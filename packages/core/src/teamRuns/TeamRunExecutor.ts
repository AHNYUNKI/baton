import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Approval, ApprovalStatus, Project, TeamPlan, TeamRole, TeamRun, TeamRunRole } from "@baton/schemas";
import { TeamRunSchema } from "@baton/schemas";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";
import { EventLogger } from "../events/EventLogger.js";
import type { WorktreeManager } from "../git/GitWorktreeManager.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";
import type { ProcessRunResult } from "../ports/ProcessRunner.js";
import type { WorkerRunResult } from "../workers/WorkerAdapter.js";
import { buildRolePrompt, type UpstreamContextEntry } from "./buildRolePrompt.js";
import { collectUpstreamRoleIds } from "./collectUpstream.js";
import { extractExplanation } from "./explanation.js";
import { computeExecutionOrder } from "./order.js";
import { summarizeWorkerResult } from "./summarizeResult.js";
import { readOrEstimateUsage } from "./usage.js";
import type { AgentWorkerRegistry } from "./AgentWorkerRegistry.js";
import type { TeamRunStore } from "./TeamRunStore.js";

export type TeamRunExecutionOutcome = "completed" | "awaiting-approval" | "awaiting-review" | "failed" | "cancelled";

export type TeamRunExecutionResult = {
  teamRun: TeamRun;
  outcome: TeamRunExecutionOutcome;
  artifactPaths: string[];
};

export type TeamRunProjectService = {
  get(projectId: string): Promise<Project | undefined>;
  getTeamPlan(projectId: string): Promise<TeamPlan | undefined>;
};

export type TeamRunExecutorOptions = {
  projectService: TeamRunProjectService;
  teamRunStore: TeamRunStore;
  artifactStore: ArtifactStore;
  worktreeManager: WorktreeManager;
  agentWorkerRegistry: AgentWorkerRegistry;
  clock?: Clock;
  worktreeRoot?: string;
  timeoutMs?: number;
  relayMaxChars?: number;
  write?: boolean;
  idGenerator?: () => string;
};

export type StartTeamRunOptions = {
  baseBranch?: string;
  timeoutMs?: number;
};

export type DecideTeamRunOptions = {
  decision: Extract<ApprovalStatus, "approved" | "rejected">;
  note?: string;
};

export type ReviewTeamRunOptions = {
  decision: "accepted" | "rejected";
  note?: string;
};

type WorkerInvocation = {
  prompt: string;
  result: WorkerRunResult;
};

const preDispatchStepId = "pre-dispatch";
const postRunReviewStepId = "post-run-review";
const terminalRoleStatuses = new Set<TeamRunRole["status"]>(["completed", "failed", "skipped"]);

export class TeamRunExecutor {
  private readonly projectService: TeamRunProjectService;
  private readonly teamRunStore: TeamRunStore;
  private readonly artifactStore: ArtifactStore;
  private readonly worktreeManager: WorktreeManager;
  private readonly agentWorkerRegistry: AgentWorkerRegistry;
  private readonly clock: Clock;
  private readonly worktreeRoot: string | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly relayMaxChars: number;
  private readonly write: boolean;
  private readonly idGenerator: () => string;

  public constructor(options: TeamRunExecutorOptions) {
    this.projectService = options.projectService;
    this.teamRunStore = options.teamRunStore;
    this.artifactStore = options.artifactStore;
    this.worktreeManager = options.worktreeManager;
    this.agentWorkerRegistry = options.agentWorkerRegistry;
    this.clock = options.clock ?? systemClock;
    this.worktreeRoot = options.worktreeRoot;
    this.timeoutMs = options.timeoutMs;
    this.relayMaxChars = options.relayMaxChars ?? 1500;
    this.write = options.write === true;
    this.idGenerator = options.idGenerator ?? randomUUID;
  }

  public async start(projectId: string, options: StartTeamRunOptions = {}): Promise<TeamRunExecutionResult> {
    const project = await this.projectService.get(projectId);
    if (project === undefined) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const teamPlan = await this.projectService.getTeamPlan(projectId);
    if (teamPlan === undefined) {
      throw new Error(`TeamPlan not found for project: ${projectId}`);
    }

    const teamRunId = this.idGenerator();
    const baseBranch = validateBaseBranch(options.baseBranch ?? "origin/main");
    const worktreePath = path.join(this.resolveWorktreeRoot(teamRunId), teamRunId);
    const createdAt = this.now();
    const baseTeamRun = TeamRunSchema.parse({
      id: teamRunId,
      projectId,
      status: "planned",
      createdAt,
      order: computeExecutionOrder(teamPlan),
      roles: teamPlan.roles.map<TeamRunRole>((role) => ({
        roleId: role.id,
        name: role.name,
        assignedAgentId: role.assignedAgentId,
        status: "planned"
      })),
      worktreePath,
      baseBranch
    });

    try {
      const result = await this.worktreeManager.createWorktree({ runId: teamRunId, worktreePath, baseBranch });
      if (result.exitCode !== 0) {
        const failed = await this.saveFailedStart(baseTeamRun, `Failed to create worktree: ${result.stderr || result.stdout || "unknown error"}`);
        return { teamRun: failed, outcome: "failed", artifactPaths: [] };
      }
    } catch (error) {
      const failed = await this.saveFailedStart(baseTeamRun, `Failed to create worktree: ${errorMessage(error)}`);
      return { teamRun: failed, outcome: "failed", artifactPaths: [] };
    }

    const teamRun = await this.teamRunStore.save({
      ...baseTeamRun,
      status: "awaiting-approval",
      approvals: [this.buildApproval(teamRunId, preDispatchStepId, "pending")]
    });
    await this.teamRunEvent(teamRun, "teamRun.started", { projectId, baseBranch, worktreePath });

    return { teamRun, outcome: "awaiting-approval", artifactPaths: [] };
  }

  public async decide(teamRunId: string, options: DecideTeamRunOptions): Promise<TeamRunExecutionResult> {
    const loaded = await this.teamRunStore.load(teamRunId);
    const pendingApproval = preDispatchApproval(loaded);
    if (pendingApproval?.status !== "pending") {
      throw new Error(`TeamRun is not awaiting pre-dispatch approval: ${teamRunId}`);
    }

    let teamRun = upsertApproval(
      loaded,
      this.buildApproval(teamRunId, preDispatchStepId, options.decision, options.note, pendingApproval.createdAt)
    );

    if (options.decision === "rejected") {
      teamRun = skipRemainingRoles(teamRun, "Pre-dispatch approval rejected.", this.now());
      teamRun = await this.teamRunStore.save({ ...teamRun, status: "cancelled" });
      await this.teamRunEvent(teamRun, "teamRun.cancelled", { note: options.note ?? "" });
      return { teamRun, outcome: "cancelled", artifactPaths: [] };
    }

    return this.executeFrom({ ...teamRun, status: "running" });
  }

  public async review(teamRunId: string, options: ReviewTeamRunOptions): Promise<TeamRunExecutionResult> {
    const loaded = await this.teamRunStore.load(teamRunId);
    const pendingApproval = postRunReviewApproval(loaded);
    if (loaded.status !== "awaiting-review" || pendingApproval?.status !== "pending") {
      throw new Error(`TeamRun is not awaiting post-run review: ${teamRunId}`);
    }

    const approvalStatus: ApprovalStatus = options.decision === "accepted" ? "approved" : "rejected";
    const nextStatus = options.decision === "accepted" ? "completed" : "cancelled";
    const teamRun = await this.teamRunStore.save({
      ...upsertApproval(
        loaded,
        this.buildApproval(teamRunId, postRunReviewStepId, approvalStatus, options.note, pendingApproval.createdAt)
      ),
      status: nextStatus
    });

    await this.teamRunEvent(teamRun, options.decision === "accepted" ? "teamRun.review.accepted" : "teamRun.review.rejected", {
      note: options.note ?? ""
    });

    return { teamRun, outcome: nextStatus, artifactPaths: [] };
  }

  public async resume(teamRunId: string): Promise<TeamRunExecutionResult> {
    const loaded = await this.teamRunStore.load(teamRunId);
    if (loaded.status === "cancelled") {
      return { teamRun: loaded, outcome: "cancelled", artifactPaths: [] };
    }
    if (loaded.status === "failed") {
      return { teamRun: loaded, outcome: "failed", artifactPaths: [] };
    }
    if (loaded.status === "completed") {
      return { teamRun: loaded, outcome: "completed", artifactPaths: [] };
    }
    if (loaded.status === "awaiting-review") {
      return { teamRun: loaded, outcome: "awaiting-review", artifactPaths: [] };
    }

    const approval = preDispatchApproval(loaded);
    if (approval?.status !== "approved") {
      const awaiting = await this.teamRunStore.save({ ...loaded, status: "awaiting-approval" });
      return { teamRun: awaiting, outcome: "awaiting-approval", artifactPaths: [] };
    }

    return this.executeFrom({ ...loaded, status: "running" });
  }

  public async executeFrom(initialTeamRun: TeamRun, options: { timeoutMs?: number } = {}): Promise<TeamRunExecutionResult> {
    const project = await this.projectService.get(initialTeamRun.projectId);
    if (project === undefined) {
      throw new Error(`Project not found: ${initialTeamRun.projectId}`);
    }
    const teamPlan = await this.projectService.getTeamPlan(initialTeamRun.projectId);
    if (teamPlan === undefined) {
      throw new Error(`TeamPlan not found for project: ${initialTeamRun.projectId}`);
    }

    let teamRun = await this.teamRunStore.save({ ...initialTeamRun, status: "running" });
    const artifacts: string[] = [];

    for (const roleId of teamRun.order) {
      const roleIndex = teamRun.roles.findIndex((role) => role.roleId === roleId);
      if (roleIndex === -1) {
        continue;
      }

      const roleState = teamRun.roles[roleIndex];
      if (roleState === undefined || terminalRoleStatuses.has(roleState.status)) {
        continue;
      }

      const planRole = teamPlan.roles.find((role) => role.id === roleId);
      if (planRole === undefined) {
        teamRun = replaceRole(teamRun, roleIndex, {
          ...roleState,
          status: "skipped",
          reason: `TeamPlan role not found: ${roleId}`,
          completedAt: this.now()
        });
        await this.roleEvent(teamRun, "teamRun.role.skipped", roleId, { reason: `TeamPlan role not found: ${roleId}` });
        teamRun = await this.teamRunStore.save(teamRun);
        continue;
      }

      const upstream = buildUpstreamContext(roleId, teamPlan, teamRun);
      const upstreamRoleIds = upstream.map((entry) => entry.roleId);
      const startedAt = roleState.startedAt ?? this.now();
      teamRun = replaceRole(teamRun, roleIndex, {
        ...roleState,
        status: "running",
        startedAt
      });
      await this.roleEvent(teamRun, "teamRun.role.started", roleId, { assignedAgentId: roleState.assignedAgentId, upstreamRoleIds });
      teamRun = await this.teamRunStore.save(teamRun);

      const registeredAgent = this.agentWorkerRegistry.has(roleState.assignedAgentId);
      const invocation = await this.invokeWorker({
        teamRun,
        project,
        teamPlan,
        role: planRole,
        upstream,
        timeoutMs: options.timeoutMs ?? this.timeoutMs
      });
      const { result } = invocation;
      const roleArtifacts = await this.writeRoleArtifacts(teamRun, roleId, result);
      artifacts.push(...roleArtifacts);

      const completedAt = this.now();
      const status: TeamRunRole["status"] = result.success ? "completed" : "failed";
      const reason = roleReason(result, registeredAgent, roleState.assignedAgentId);
      const summary = result.success ? summarizeWorkerResult(result, this.relayMaxChars) : undefined;
      const explanation = extractExplanation(result.stdout);
      const usage = readOrEstimateUsage(invocation.prompt, result);
      const { summary: _previousSummary, explanation: _previousExplanation, ...roleWithoutSummary } = teamRun.roles[roleIndex] ?? roleState;
      teamRun = replaceRole(teamRun, roleIndex, {
        ...roleWithoutSummary,
        status,
        completedAt,
        artifacts: roleArtifacts,
        usage,
        ...(summary === undefined ? {} : { summary }),
        ...(explanation === undefined ? {} : { explanation }),
        ...(reason === undefined ? {} : { reason })
      });
      await this.roleEvent(teamRun, result.success ? "teamRun.role.completed" : "teamRun.role.failed", roleId, {
        exitCode: result.exitCode,
        stub: result.metadata?.stub === true,
        usage
      });
      teamRun = await this.teamRunStore.save(teamRun);

      if (!result.success) {
        teamRun = skipRolesAfter(teamRun, roleId, `Previous role failed: ${roleId}`, this.now());
        const diffArtifact = this.write ? await this.captureDiffArtifact(teamRun) : undefined;
        teamRun = await this.teamRunStore.save({
          ...teamRun,
          status: "failed",
          ...(diffArtifact === undefined ? {} : { diffSummary: diffArtifact.summary })
        });
        await this.teamRunEvent(teamRun, "teamRun.failed", { failedRoleId: roleId });
        return {
          teamRun,
          outcome: "failed",
          artifactPaths: diffArtifact === undefined ? artifacts : [...artifacts, diffArtifact.artifactPath]
        };
      }
    }

    if (this.write) {
      const diffArtifact = await this.captureDiffArtifact(teamRun);
      const awaitingReview = await this.teamRunStore.save({
        ...upsertApproval(
          {
            ...teamRun,
            diffSummary: diffArtifact.summary
          },
          this.buildApproval(teamRun.id, postRunReviewStepId, "pending")
        ),
        status: "awaiting-review"
      });
      await this.teamRunEvent(awaitingReview, "teamRun.awaitingReview", { diffSummary: diffArtifact.summary });
      return { teamRun: awaitingReview, outcome: "awaiting-review", artifactPaths: [...artifacts, diffArtifact.artifactPath] };
    }

    const completed = await this.teamRunStore.save({ ...teamRun, status: "completed" });
    await this.teamRunEvent(completed, "teamRun.completed", {});
    return { teamRun: completed, outcome: "completed", artifactPaths: artifacts };
  }

  private async invokeWorker(input: {
    teamRun: TeamRun;
    project: Project;
    teamPlan: TeamPlan;
    role: TeamRole;
    upstream: UpstreamContextEntry[];
    timeoutMs: number | undefined;
  }): Promise<WorkerInvocation> {
    const startedAt = Date.now();
    let prompt = "";
    try {
      prompt = buildRolePrompt({
        project: input.project,
        role: input.role,
        teamPlan: input.teamPlan,
        runDirectory: this.artifactStore.getRunDir(input.teamRun.id),
        upstream: input.upstream
      });
      const result = await this.agentWorkerRegistry.resolve(input.role.assignedAgentId).run({
        cwd: requiredWorktreePath(input.teamRun),
        prompt,
        metadata: {
          teamRunId: input.teamRun.id,
          projectId: input.teamRun.projectId,
          roleId: input.role.id,
          assignedAgentId: input.role.assignedAgentId,
          runDirectory: this.artifactStore.getRunDir(input.teamRun.id)
        },
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs })
      });
      return { prompt, result };
    } catch (error) {
      return {
        prompt,
        result: {
          success: false,
          exitCode: null,
          stdout: "",
          stderr: errorMessage(error),
          durationMs: Date.now() - startedAt,
          artifacts: []
        }
      };
    }
  }

  private async writeRoleArtifacts(teamRun: TeamRun, roleId: string, result: WorkerRunResult): Promise<string[]> {
    const artifactId = roleArtifactId(roleId);
    const stdoutPath = await this.artifactStore.writeArtifact(teamRun.id, `logs/${artifactId}.stdout.log`, result.stdout);
    const stderrPath = await this.artifactStore.writeArtifact(teamRun.id, `logs/${artifactId}.stderr.log`, result.stderr);
    const resultPath = await this.artifactStore.writeArtifact(
      teamRun.id,
      `steps/${artifactId}.result.json`,
      `${JSON.stringify(result, null, 2)}\n`
    );

    return [stdoutPath, stderrPath, resultPath, ...result.artifacts];
  }

  private buildApproval(
    teamRunId: string,
    stepId: string,
    status: ApprovalStatus,
    note?: string,
    createdAt?: string
  ): Approval {
    const baseApproval = {
      runId: teamRunId,
      stepId,
      status,
      createdAt: createdAt ?? this.now()
    };

    return status === "pending"
      ? baseApproval
      : {
          ...baseApproval,
          decidedAt: this.now(),
          ...(note === undefined ? {} : { note })
        };
  }

  private async captureDiffArtifact(teamRun: TeamRun): Promise<{ artifactPath: string; summary: string }> {
    let result: ProcessRunResult;
    try {
      result = await this.worktreeManager.diff(requiredWorktreePath(teamRun));
    } catch (error) {
      const summary = `Diff capture failed: ${errorMessage(error)}`;
      const artifactPath = await this.artifactStore.writeArtifact(teamRun.id, "diff.patch", `${summary}\n`);
      return { artifactPath, summary };
    }

    const summary = summarizeDiffResult(result);
    const content =
      result.exitCode === 0
        ? result.stdout
        : [
            "Diff capture failed.",
            `Exit code: ${result.exitCode ?? "null"}`,
            "",
            "stdout:",
            result.stdout,
            "",
            "stderr:",
            result.stderr
          ].join("\n");
    const artifactPath = await this.artifactStore.writeArtifact(teamRun.id, "diff.patch", content);
    return { artifactPath, summary };
  }

  private async saveFailedStart(teamRun: TeamRun, reason: string): Promise<TeamRun> {
    const failed = await this.teamRunStore.save({
      ...skipRemainingRoles(teamRun, reason, this.now()),
      status: "failed"
    });
    await this.teamRunEvent(failed, "teamRun.failed", { reason });
    return failed;
  }

  private async roleEvent(teamRun: TeamRun, type: string, roleId: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.teamRunEvent(teamRun, type, { roleId, ...payload });
  }

  private async teamRunEvent(teamRun: TeamRun, type: string, payload: Record<string, unknown> = {}): Promise<void> {
    const logger = new EventLogger({
      eventLogPath: path.join(this.artifactStore.getRunDir(teamRun.id), "events.jsonl"),
      clock: this.clock
    });
    await logger.append({ type, runId: teamRun.id, payload });
  }

  private resolveWorktreeRoot(teamRunId: string): string {
    if (this.worktreeRoot !== undefined) {
      return this.worktreeRoot;
    }

    const runDirectory = this.artifactStore.getRunDir(teamRunId);
    return path.join(path.dirname(path.dirname(runDirectory)), "worktrees");
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

function buildUpstreamContext(roleId: string, teamPlan: TeamPlan, teamRun: TeamRun): UpstreamContextEntry[] {
  const roleById = new Map(teamRun.roles.map((role) => [role.roleId, role]));
  const upstream: UpstreamContextEntry[] = [];

  for (const upstreamRoleId of collectUpstreamRoleIds(roleId, teamPlan)) {
    const role = roleById.get(upstreamRoleId);
    if (role?.status !== "completed") {
      continue;
    }

    const entry = {
      roleId: role.roleId,
      name: role.name,
      assignedAgentId: role.assignedAgentId,
      status: role.status,
      artifacts: role.artifacts ?? []
    };
    upstream.push(role.summary === undefined ? entry : { ...entry, summary: role.summary });
  }

  return upstream;
}

function preDispatchApproval(teamRun: TeamRun): Approval | undefined {
  return teamRun.approvals?.find((approval) => approval.stepId === preDispatchStepId);
}

function postRunReviewApproval(teamRun: TeamRun): Approval | undefined {
  return teamRun.approvals?.find((approval) => approval.stepId === postRunReviewStepId);
}

function upsertApproval(teamRun: TeamRun, approval: Approval): TeamRun {
  const approvals = teamRun.approvals ?? [];
  const existingIndex = approvals.findIndex((candidate) => candidate.stepId === approval.stepId);
  const nextApprovals =
    existingIndex === -1
      ? [...approvals, approval]
      : approvals.map((candidate, index) => (index === existingIndex ? { ...candidate, ...approval } : candidate));

  return { ...teamRun, approvals: nextApprovals };
}

function replaceRole(teamRun: TeamRun, index: number, role: TeamRunRole): TeamRun {
  return {
    ...teamRun,
    roles: teamRun.roles.map((candidate, candidateIndex) => (candidateIndex === index ? role : candidate))
  };
}

function skipRemainingRoles(teamRun: TeamRun, reason: string, now: string): TeamRun {
  return {
    ...teamRun,
    roles: teamRun.roles.map((role) =>
      terminalRoleStatuses.has(role.status)
        ? role
        : {
            ...role,
            status: "skipped",
            reason,
            completedAt: now
          }
    )
  };
}

function skipRolesAfter(teamRun: TeamRun, roleId: string, reason: string, now: string): TeamRun {
  const rolePosition = teamRun.order.indexOf(roleId);
  const remaining = new Set(rolePosition === -1 ? [] : teamRun.order.slice(rolePosition + 1));
  return {
    ...teamRun,
    roles: teamRun.roles.map((role) =>
      !remaining.has(role.roleId) || terminalRoleStatuses.has(role.status)
        ? role
        : {
            ...role,
            status: "skipped",
            reason,
            completedAt: now
          }
    )
  };
}

function requiredWorktreePath(teamRun: TeamRun): string {
  if (teamRun.worktreePath === undefined) {
    throw new Error(`TeamRun is missing worktreePath: ${teamRun.id}`);
  }
  return teamRun.worktreePath;
}

function validateBaseBranch(baseBranch: string): string {
  const trimmed = baseBranch.trim();
  if (trimmed.length === 0) {
    throw new Error("TeamRun base branch must not be empty.");
  }
  if (trimmed === "main") {
    throw new Error("TeamRun base branch must not be main; use origin/main or another review base.");
  }
  return trimmed;
}

function roleReason(result: WorkerRunResult, registeredAgent: boolean, assignedAgentId: string): string | undefined {
  if (result.success && result.metadata?.stub === true) {
    return registeredAgent
      ? "Completed by stub worker."
      : `Completed by fallback StubWorker for unregistered agent: ${assignedAgentId}.`;
  }
  if (result.success) {
    return undefined;
  }
  return result.stderr || result.stdout || "Worker failed.";
}

function roleArtifactId(roleId: string): string {
  return encodeURIComponent(roleId);
}

function summarizeDiffResult(result: ProcessRunResult): string {
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || "unknown error";
    return `Diff capture failed: ${message}`;
  }

  const diffStat = metadataString(result.metadata, "diffStat");
  const statLines = diffStat
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const summaryLine = statLines?.[statLines.length - 1];
  if (summaryLine !== undefined) {
    return summaryLine;
  }

  if (result.stdout.trim().length === 0) {
    return "No changes captured.";
  }

  const fileCount = result.stdout.split("\n").filter((line) => line.startsWith("diff --git ")).length;
  const insertions = result.stdout.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deletions = result.stdout.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  return `${fileCount} files changed, ${insertions} insertions(+), ${deletions} deletions(-)`;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
