import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AgentWorkerRegistry,
  ArtifactStore,
  TeamRunExecutor,
  TeamRunStore,
  estimateTokens,
  fixedClock,
  type TeamRunProjectService,
  type ProcessRunResult,
  type WorkerAdapter,
  type WorkerRunInput,
  type WorkerRunResult,
  type WorktreeManager
} from "../../src/index.js";
import type { Project, TeamPlan, TeamRun } from "@baton/schemas";

describe("TeamRunExecutor", () => {
  it("starts in awaiting-approval and does not dispatch before approval", async () => {
    const harness = await createHarness();

    const result = await harness.executor.start("project-1");

    expect(result.outcome).toBe("awaiting-approval");
    expect(result.teamRun).toMatchObject({
      id: "team-run-1",
      projectId: "project-1",
      status: "awaiting-approval",
      baseBranch: "origin/main"
    });
    expect(result.teamRun.roles.map((role) => role.status)).toEqual(["planned", "planned", "planned"]);
    expect(result.teamRun.approvals?.[0]).toMatchObject({ stepId: "pre-dispatch", status: "pending" });
    expect(harness.worktree.calls).toEqual([
      {
        runId: "team-run-1",
        worktreePath: path.join(harness.workspaceRoot, ".baton", "worktrees", "team-run-1"),
        baseBranch: "origin/main"
      }
    ]);
    expect(harness.worker.inputs).toHaveLength(0);
  });

  it("approves and executes roles sequentially in the worktree", async () => {
    const harness = await createHarness();
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved", note: "go" });

    expect(result.outcome).toBe("completed");
    expect(result.teamRun.status).toBe("completed");
    expect(result.teamRun.roles.map((role) => [role.roleId, role.status])).toEqual([
      ["lead", "completed"],
      ["architect", "completed"],
      ["implementer", "completed"]
    ]);
    expect(result.teamRun.approvals?.[0]).toMatchObject({ status: "approved", note: "go" });
    expect(harness.worker.inputs.map((input) => input.metadata?.roleId)).toEqual(["lead", "architect", "implementer"]);
    expect(harness.worker.inputs.every((input) => input.cwd === result.teamRun.worktreePath)).toBe(true);
    expect(result.teamRun.roles.every((role) => role.reason === "Completed by stub worker.")).toBe(true);
    expect(result.teamRun.roles.find((role) => role.roleId === "lead")?.usage).toEqual({
      inputTokens: estimateTokens(promptForRole(harness.worker.inputs, "lead")),
      outputTokens: estimateTokens("ok lead"),
      estimated: true
    });
    expect(result.teamRun.roles.every((role) => role.usage?.estimated === true)).toBe(true);

    const events = await readEvents(harness.artifactStore.getRunDir("team-run-1"));
    expect(events.map((event) => event.type)).toEqual([
      "teamRun.started",
      "teamRun.role.started",
      "teamRun.role.completed",
      "teamRun.role.started",
      "teamRun.role.completed",
      "teamRun.role.started",
      "teamRun.role.completed",
      "teamRun.completed"
    ]);
    expect(await readFile(path.join(harness.artifactStore.getRunDir("team-run-1"), "logs", "lead.stdout.log"), "utf8")).toContain("ok lead");
    expect(events.filter((event) => event.type === "teamRun.role.started").map((event) => event.payload.upstreamRoleIds)).toEqual([
      [],
      ["lead"],
      ["lead", "architect"]
    ]);
    expect(events.filter((event) => event.type === "teamRun.role.completed").map((event) => event.payload.usage)).toEqual(
      result.teamRun.roles.map((role) => role.usage)
    );
  });

  it("persists explanations extracted from completed role stdout", async () => {
    const harness = await createHarness({
      workerResults: [
        {
          stdout: [
            "lead result",
            "",
            "## 학습 설명",
            "- 무엇을 했나: 리드 역할을 실행했습니다.",
            "- 왜 이렇게 했나(결정 근거): 다음 역할이 맥락을 이해하도록 정리했습니다."
          ].join("\n")
        },
        { stdout: "architect result without explanation" },
        {
          stdout: [
            "implementer result",
            "",
            "## 학습 설명",
            "- 무엇을 했나: 첫 설명입니다.",
            "## Other",
            "ignored",
            "## 학습 설명",
            "- 무엇을 했나: 마지막 설명입니다."
          ].join("\n")
        }
      ]
    });
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved" });

    expect(result.teamRun.roles.find((role) => role.roleId === "lead")?.explanation).toBe(
      "## 학습 설명\n- 무엇을 했나: 리드 역할을 실행했습니다.\n- 왜 이렇게 했나(결정 근거): 다음 역할이 맥락을 이해하도록 정리했습니다."
    );
    expect(result.teamRun.roles.find((role) => role.roleId === "architect")?.explanation).toBeUndefined();
    expect(result.teamRun.roles.find((role) => role.roleId === "implementer")?.explanation).toBe(
      "## 학습 설명\n- 무엇을 했나: 마지막 설명입니다."
    );
  });

  it("captures a write diff and waits for post-run review instead of completing", async () => {
    const harness = await createHarness({ write: true });
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved" });

    expect(result.outcome).toBe("awaiting-review");
    expect(result.teamRun.status).toBe("awaiting-review");
    expect(result.teamRun.diffSummary).toBe("1 file changed, 2 insertions(+)");
    expect(result.teamRun.approvals).toEqual([
      {
        runId: "team-run-1",
        stepId: "pre-dispatch",
        status: "approved",
        createdAt: "2026-06-17T00:00:00.000Z",
        decidedAt: "2026-06-17T00:00:00.000Z"
      },
      {
        runId: "team-run-1",
        stepId: "post-run-review",
        status: "pending",
        createdAt: "2026-06-17T00:00:00.000Z"
      }
    ]);
    expect(harness.worktree.diffCalls).toEqual([result.teamRun.worktreePath]);
    expect(await readFile(path.join(harness.artifactStore.getRunDir("team-run-1"), "diff.patch"), "utf8")).toBe(
      "diff --git a/file.ts b/file.ts\n+hello\n"
    );

    const events = await readEvents(harness.artifactStore.getRunDir("team-run-1"));
    expect(events.map((event) => event.type)).toContain("teamRun.awaitingReview");
    expect(events.map((event) => event.type)).not.toContain("teamRun.completed");
  });

  it("accepts post-run review without removing the worktree", async () => {
    const harness = await createHarness({ write: true });
    await harness.executor.start("project-1");
    await harness.executor.decide("team-run-1", { decision: "approved" });

    const result = await harness.executor.review("team-run-1", { decision: "accepted", note: "looks good" });

    expect(result.outcome).toBe("completed");
    expect(result.teamRun.status).toBe("completed");
    expect(result.teamRun.approvals?.find((approval) => approval.stepId === "post-run-review")).toMatchObject({
      status: "approved",
      note: "looks good"
    });
    expect(harness.worktree.removeCalls).toHaveLength(0);
  });

  it("rejects post-run review by cancelling while preserving the worktree", async () => {
    const harness = await createHarness({ write: true });
    await harness.executor.start("project-1");
    await harness.executor.decide("team-run-1", { decision: "approved" });

    const result = await harness.executor.review("team-run-1", { decision: "rejected", note: "needs changes" });

    expect(result.outcome).toBe("cancelled");
    expect(result.teamRun.status).toBe("cancelled");
    expect(result.teamRun.approvals?.find((approval) => approval.stepId === "post-run-review")).toMatchObject({
      status: "rejected",
      note: "needs changes"
    });
    expect(harness.worktree.removeCalls).toHaveLength(0);
  });

  it("relays completed reporting-chain summaries without unrelated sibling context", async () => {
    const harness = await createHarness({
      teamPlan: siblingTeamPlanFixture(),
      workerResults: [
        { stdout: "lead summary for descendants" },
        { stdout: "architect summary for implementer" },
        { stdout: "sibling summary that must not relay" },
        { stdout: "implementer result" }
      ]
    });
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved" });

    expect(result.outcome).toBe("completed");
    expect(harness.worker.inputs.map((input) => input.metadata?.roleId)).toEqual(["lead", "architect", "reviewer", "implementer"]);
    const implementerPrompt = promptForRole(harness.worker.inputs, "implementer");
    expect(implementerPrompt).toContain("## Upstream Context");
    expect(implementerPrompt).toContain("lead summary for descendants");
    expect(implementerPrompt).toContain("architect summary for implementer");
    expect(implementerPrompt).not.toContain("sibling summary that must not relay");
  });

  it("persists truncated summaries for successful roles", async () => {
    const harness = await createHarness({
      relayMaxChars: 5,
      workerResults: [{ stdout: "abcdefghi" }, { stdout: "architect ok" }, { stdout: "implementer ok" }]
    });
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved" });

    expect(result.teamRun.roles.find((role) => role.roleId === "lead")?.summary).toBe("abcde…(truncated)");
    expect(promptForRole(harness.worker.inputs, "architect")).toContain("abcde…(truncated)");
  });

  it("rejects by skipping planned roles and cancelling the team run", async () => {
    const harness = await createHarness();
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "rejected", note: "not now" });

    expect(result.outcome).toBe("cancelled");
    expect(result.teamRun.status).toBe("cancelled");
    expect(result.teamRun.roles.map((role) => role.status)).toEqual(["skipped", "skipped", "skipped"]);
    expect(result.teamRun.roles.every((role) => role.reason === "Pre-dispatch approval rejected.")).toBe(true);
    expect(harness.worker.inputs).toHaveLength(0);
  });

  it("stops on a role failure and skips remaining roles", async () => {
    const harness = await createHarness({
      workerResults: [
        { success: true, stdout: "ok lead" },
        { success: false, stderr: "boom" }
      ]
    });
    await harness.executor.start("project-1");

    const result = await harness.executor.decide("team-run-1", { decision: "approved" });

    expect(result.outcome).toBe("failed");
    expect(result.teamRun.status).toBe("failed");
    expect(result.teamRun.roles.map((role) => [role.roleId, role.status, role.reason])).toEqual([
      ["lead", "completed", "Completed by stub worker."],
      ["architect", "failed", "boom"],
      ["implementer", "skipped", "Previous role failed: architect"]
    ]);
    expect(harness.worker.inputs.map((input) => input.metadata?.roleId)).toEqual(["lead", "architect"]);
  });

  it("resumes from the first non-terminal role", async () => {
    const harness = await createHarness();
    await harness.teamRunStore.save({
      ...teamRunFixture(),
      status: "running",
      approvals: [
        {
          runId: "team-run-1",
          stepId: "pre-dispatch",
          status: "approved",
          createdAt: "2026-06-17T00:00:00.000Z",
          decidedAt: "2026-06-17T00:00:00.000Z"
        }
      ],
      roles: [
        {
          roleId: "lead",
          name: "Lead",
          assignedAgentId: "codex",
          status: "completed",
          startedAt: "2026-06-17T00:00:00.000Z",
          completedAt: "2026-06-17T00:00:00.000Z",
          summary: "persisted lead summary",
          usage: {
            inputTokens: 12,
            outputTokens: 3,
            estimated: false
          },
          artifacts: ["/tmp/team-run-1/steps/lead.result.json"]
        },
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "codex",
          status: "planned"
        },
        {
          roleId: "implementer",
          name: "Implementer",
          assignedAgentId: "codex",
          status: "planned"
        }
      ]
    });

    const result = await harness.executor.resume("team-run-1");

    expect(result.outcome).toBe("completed");
    expect(harness.worker.inputs.map((input) => input.metadata?.roleId)).toEqual(["architect", "implementer"]);
    expect(promptForRole(harness.worker.inputs, "architect")).toContain("persisted lead summary");
    expect(promptForRole(harness.worker.inputs, "architect")).toContain("/tmp/team-run-1/steps/lead.result.json");
    expect(result.teamRun.roles.map((role) => role.status)).toEqual(["completed", "completed", "completed"]);
    expect(result.teamRun.roles.find((role) => role.roleId === "lead")?.usage).toEqual({
      inputTokens: 12,
      outputTokens: 3,
      estimated: false
    });
  });

  it("keeps awaiting runs gated on resume when approval is still pending", async () => {
    const harness = await createHarness();
    await harness.executor.start("project-1");

    const result = await harness.executor.resume("team-run-1");

    expect(result.outcome).toBe("awaiting-approval");
    expect(result.teamRun.roles.map((role) => role.status)).toEqual(["planned", "planned", "planned"]);
    expect(harness.worker.inputs).toHaveLength(0);
  });

  it("keeps awaiting-review runs gated on resume", async () => {
    const harness = await createHarness({ write: true });
    await harness.executor.start("project-1");
    await harness.executor.decide("team-run-1", { decision: "approved" });
    harness.worker.inputs.length = 0;

    const result = await harness.executor.resume("team-run-1");

    expect(result.outcome).toBe("awaiting-review");
    expect(result.teamRun.status).toBe("awaiting-review");
    expect(harness.worker.inputs).toHaveLength(0);
  });

  it("rejects post-run review when the team run is not awaiting review", async () => {
    const harness = await createHarness();
    await harness.executor.start("project-1");

    await expect(harness.executor.review("team-run-1", { decision: "accepted" })).rejects.toThrow("post-run review");
  });

  it("records worktree creation failures as failed team runs", async () => {
    const harness = await createHarness({ worktreeExitCode: 1, worktreeStderr: "no base" });

    const result = await harness.executor.start("project-1");

    expect(result.outcome).toBe("failed");
    expect(result.teamRun.status).toBe("failed");
    expect(result.teamRun.roles.map((role) => role.status)).toEqual(["skipped", "skipped", "skipped"]);
    expect(result.teamRun.roles[0]?.reason).toContain("Failed to create worktree: no base");
  });

  it("rejects main as a direct base branch", async () => {
    const harness = await createHarness();

    await expect(harness.executor.start("project-1", { baseBranch: "main" })).rejects.toThrow("must not be main");
    expect(harness.worktree.calls).toHaveLength(0);
  });
});

type HarnessOptions = {
  workerResults?: Array<Partial<WorkerRunResult>>;
  worktreeExitCode?: number;
  worktreeStderr?: string;
  teamPlan?: TeamPlan;
  relayMaxChars?: number;
  write?: boolean;
  diffResult?: Partial<ProcessRunResult>;
};

async function createHarness(options: HarnessOptions = {}): Promise<{
  workspaceRoot: string;
  artifactStore: ArtifactStore;
  teamRunStore: TeamRunStore;
  executor: TeamRunExecutor;
  worker: RecordingWorker;
  worktree: RecordingWorktreeManager;
}> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-team-run-executor-"));
  const artifactStore = new ArtifactStore({ workspaceRoot });
  const teamRunStore = new TeamRunStore({ artifactStore, clock: fixedClock("2026-06-17T00:00:00.000Z") });
  const worker = new RecordingWorker(options.workerResults);
  const registry = new AgentWorkerRegistry().register("codex", worker);
  const worktree = new RecordingWorktreeManager(options.worktreeExitCode ?? 0, options.worktreeStderr ?? "", options.diffResult);

  return {
    workspaceRoot,
    artifactStore,
    teamRunStore,
    worker,
    worktree,
    executor: new TeamRunExecutor({
      projectService: projectServiceFixture(options.teamPlan),
      teamRunStore,
      artifactStore,
      worktreeManager: worktree,
      agentWorkerRegistry: registry,
      clock: fixedClock("2026-06-17T00:00:00.000Z"),
      idGenerator: () => "team-run-1",
      write: options.write === true,
      ...(options.relayMaxChars === undefined ? {} : { relayMaxChars: options.relayMaxChars })
    })
  };
}

class RecordingWorker implements WorkerAdapter {
  public readonly inputs: WorkerRunInput[] = [];
  private readonly results: Array<Partial<WorkerRunResult>>;

  public constructor(results: Array<Partial<WorkerRunResult>> = []) {
    this.results = results;
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    this.inputs.push(input);
    const result = this.results.shift() ?? { success: true, stdout: `ok ${String(input.metadata?.roleId ?? "")}` };
    return {
      success: result.success ?? true,
      exitCode: result.exitCode ?? (result.success === false ? 1 : 0),
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      durationMs: result.durationMs ?? 0,
      artifacts: result.artifacts ?? [],
      metadata: result.metadata ?? { stub: true }
    };
  }
}

class RecordingWorktreeManager implements WorktreeManager {
  public readonly calls: Array<{ runId: string; worktreePath: string; baseBranch?: string }> = [];
  public readonly diffCalls: string[] = [];
  public readonly removeCalls: string[] = [];

  public constructor(
    private readonly exitCode: number,
    private readonly stderr: string,
    private readonly diffResult: Partial<ProcessRunResult> = {}
  ) {}

  public async createWorktree(input: { runId: string; worktreePath: string; baseBranch?: string }): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
  }> {
    this.calls.push(input);
    return { stdout: "", stderr: this.stderr, exitCode: this.exitCode, durationMs: 1 };
  }

  public async removeWorktree(worktreePath: string): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
    this.removeCalls.push(worktreePath);
    return { stdout: "", stderr: "", exitCode: 0, durationMs: 1 };
  }

  public async list(): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
    return { stdout: "", stderr: "", exitCode: 0, durationMs: 1 };
  }

  public async diff(worktreePath: string): Promise<ProcessRunResult> {
    this.diffCalls.push(worktreePath);
    return {
      stdout: this.diffResult.stdout ?? "diff --git a/file.ts b/file.ts\n+hello\n",
      stderr: this.diffResult.stderr ?? "",
      exitCode: this.diffResult.exitCode ?? 0,
      durationMs: this.diffResult.durationMs ?? 1,
      metadata: this.diffResult.metadata ?? { diffStat: " file.ts | 2 ++\n 1 file changed, 2 insertions(+)\n" }
    };
  }
}

function projectServiceFixture(teamPlan = teamPlanFixture()): TeamRunProjectService {
  const project: Project = {
    id: "project-1",
    name: "Baton",
    source: { kind: "local", value: "/repo/baton" },
    agentIds: ["codex"],
    leadAgentId: "codex",
    overview: "Build Baton safely.",
    teamPlan,
    createdAt: "2026-06-17T00:00:00.000Z"
  };

  return {
    async get(projectId: string): Promise<Project | undefined> {
      return projectId === project.id ? project : undefined;
    },
    async getTeamPlan(projectId: string): Promise<TeamPlan | undefined> {
      return projectId === project.id ? teamPlan : undefined;
    }
  };
}

function teamPlanFixture(): TeamPlan {
  return {
    roles: [
      {
        id: "lead",
        name: "Lead",
        description: "Coordinates work.",
        assignedAgentId: "codex",
        instructions: "Lead the plan."
      },
      {
        id: "architect",
        name: "Architect",
        description: "Designs work.",
        assignedAgentId: "codex",
        instructions: "Design safely.",
        reportsTo: "lead"
      },
      {
        id: "implementer",
        name: "Implementer",
        description: "Implements work.",
        assignedAgentId: "codex",
        instructions: "Implement safely.",
        reportsTo: "architect"
      }
    ]
  };
}

function siblingTeamPlanFixture(): TeamPlan {
  return {
    roles: [
      {
        id: "lead",
        name: "Lead",
        description: "Coordinates work.",
        assignedAgentId: "codex",
        instructions: "Lead the plan."
      },
      {
        id: "architect",
        name: "Architect",
        description: "Designs work.",
        assignedAgentId: "codex",
        instructions: "Design safely.",
        reportsTo: "lead"
      },
      {
        id: "reviewer",
        name: "Reviewer",
        description: "Reviews work.",
        assignedAgentId: "codex",
        instructions: "Review safely.",
        reportsTo: "lead"
      },
      {
        id: "implementer",
        name: "Implementer",
        description: "Implements work.",
        assignedAgentId: "codex",
        instructions: "Implement safely.",
        reportsTo: "architect"
      }
    ]
  };
}

function teamRunFixture(): TeamRun {
  return {
    id: "team-run-1",
    projectId: "project-1",
    status: "running",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    order: ["lead", "architect", "implementer"],
    worktreePath: "/tmp/team-run-worktree",
    baseBranch: "origin/main",
    roles: [
      {
        roleId: "lead",
        name: "Lead",
        assignedAgentId: "codex",
        status: "planned"
      }
    ]
  };
}

function promptForRole(inputs: WorkerRunInput[], roleId: string): string {
  const input = inputs.find((candidate) => candidate.metadata?.roleId === roleId);
  if (input === undefined) {
    throw new Error(`Missing worker input for role: ${roleId}`);
  }
  return input.prompt;
}

async function readEvents(runDirectory: string): Promise<Array<{ type: string; payload: Record<string, unknown> }>> {
  return (await readFile(path.join(runDirectory, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; payload: Record<string, unknown> });
}
