import path from "node:path";

import type { Approval, ApprovalStatus, Run, RunStep, Workflow, WorkflowStep } from "@baton/schemas";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";
import { EventLogger } from "../events/EventLogger.js";
import type { WorktreeManager } from "../git/GitWorktreeManager.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";
import { ApprovalPolicy } from "../policies/ApprovalPolicy.js";
import { FixPolicy } from "../policies/FixPolicy.js";
import type { WorkerRunResult } from "../workers/WorkerAdapter.js";
import { WorkerRegistry } from "../workers/WorkerRegistry.js";
import { buildFixPrompt } from "./buildFixPrompt.js";
import type { PlanRunOptions, RunService } from "./RunService.js";
import { RunStore } from "./RunStore.js";
import { buildStepPrompt } from "./buildStepPrompt.js";

export type RunExecutionOutcome = "completed" | "awaiting-approval" | "failed" | "cancelled";

export type RunExecutionResult = {
  run: Run;
  outcome: RunExecutionOutcome;
  artifactPaths: string[];
};

export type RunExecutorOptions = {
  runService: RunService;
  runStore: RunStore;
  artifactStore: ArtifactStore;
  worktreeManager: WorktreeManager;
  workerRegistry: WorkerRegistry;
  workflows: Workflow[];
  approvalPolicy?: ApprovalPolicy;
  clock?: Clock;
  worktreeRoot?: string;
  timeoutMs?: number;
  fixEnabled?: boolean;
  fixPolicy?: FixPolicy;
};

export type StartRunOptions = Omit<PlanRunOptions, "dryRun"> & {
  baseBranch?: string;
  timeoutMs?: number;
};

export type DecideRunOptions = {
  decision: Extract<ApprovalStatus, "approved" | "rejected">;
  note?: string;
};

type AttemptFixInput = {
  run: Run;
  index: number;
  workflowStep: WorkflowStep;
  failedResult: WorkerRunResult;
  artifactPaths: string[];
  timeoutMs: number | undefined;
};

type AttemptFixResult = {
  run: Run;
  fixed: boolean;
};

const terminalStepStatuses = new Set<RunStep["status"]>(["completed", "failed", "skipped"]);

export class RunExecutor {
  private readonly runService: RunService;
  private readonly runStore: RunStore;
  private readonly artifactStore: ArtifactStore;
  private readonly worktreeManager: WorktreeManager;
  private readonly workerRegistry: WorkerRegistry;
  private readonly workflows: Workflow[];
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly clock: Clock;
  private readonly worktreeRoot: string | undefined;
  private readonly timeoutMs: number | undefined;
  private readonly fixEnabled: boolean;
  private readonly fixPolicy: FixPolicy;

  public constructor(options: RunExecutorOptions) {
    this.runService = options.runService;
    this.runStore = options.runStore;
    this.artifactStore = options.artifactStore;
    this.worktreeManager = options.worktreeManager;
    this.workerRegistry = options.workerRegistry;
    this.workflows = options.workflows;
    this.approvalPolicy = options.approvalPolicy ?? new ApprovalPolicy();
    this.clock = options.clock ?? systemClock;
    this.worktreeRoot = options.worktreeRoot;
    this.timeoutMs = options.timeoutMs;
    this.fixEnabled = options.fixEnabled ?? false;
    this.fixPolicy = options.fixPolicy ?? new FixPolicy();
  }

  public async start(request: string, options: StartRunOptions = {}): Promise<RunExecutionResult> {
    const plan = this.runService.planRun(request, {
      dryRun: false,
      ...(options.workflowId === undefined ? {} : { workflowId: options.workflowId }),
      ...(options.projectId === undefined ? {} : { projectId: options.projectId })
    });
    const baseBranch = options.baseBranch ?? "main";
    const worktreePath = path.join(this.resolveWorktreeRoot(plan.run.id), plan.run.id);
    let run: Run = {
      ...plan.run,
      status: "running",
      worktreePath,
      baseBranch
    };

    await this.artifactStore.writeArtifact(run.id, "request.md", `${request}\n`);
    run = await this.runStore.save(run);

    try {
      const result = await this.worktreeManager.createWorktree({ runId: run.id, worktreePath, baseBranch });
      if (result.exitCode !== 0) {
        run = markRunFailed(run, `Failed to create worktree: ${result.stderr || result.stdout || "unknown error"}`);
        run = await this.runStore.save(run);
        return { run, outcome: "failed", artifactPaths: [] };
      }
    } catch (error) {
      run = markRunFailed(run, `Failed to create worktree: ${errorMessage(error)}`);
      run = await this.runStore.save(run);
      return { run, outcome: "failed", artifactPaths: [] };
    }

    return this.executeFrom(run, 0, options.timeoutMs);
  }

  public async resume(runId: string): Promise<RunExecutionResult> {
    const loaded = await this.runStore.load(runId);
    if (loaded.status === "cancelled") {
      return { run: loaded, outcome: "cancelled", artifactPaths: [] };
    }
    if (loaded.status === "failed") {
      return { run: loaded, outcome: "failed", artifactPaths: [] };
    }
    if (loaded.status === "completed") {
      return { run: loaded, outcome: "completed", artifactPaths: [] };
    }

    const firstRunnableIndex = loaded.steps.findIndex((step) => !terminalStepStatuses.has(step.status));
    if (firstRunnableIndex === -1) {
      const completed = await this.runStore.save({ ...loaded, status: "completed" });
      return { run: completed, outcome: "completed", artifactPaths: [] };
    }

    return this.executeFrom({ ...loaded, status: "running" }, firstRunnableIndex, this.timeoutMs);
  }

  public async decide(runId: string, options: DecideRunOptions): Promise<Run> {
    const loaded = await this.runStore.load(runId);
    const gate = this.findCurrentGate(loaded);
    if (gate === undefined) {
      throw new Error(`Run is not awaiting an approval gate: ${runId}`);
    }

    const existingApproval = approvalFor(loaded, gate.step.id);
    const approval = this.buildApproval(loaded.id, gate.step.id, options.decision, options.note, existingApproval?.createdAt);
    let run = upsertApproval(loaded, approval);

    if (options.decision === "rejected") {
      run = skipFromIndex(run, gate.index, "Approval rejected.");
      run = { ...run, status: "cancelled" };
    }

    return this.runStore.save(run);
  }

  private async executeFrom(initialRun: Run, startIndex: number, timeoutMs: number | undefined): Promise<RunExecutionResult> {
    let run = await this.runStore.save(initialRun);
    const workflow = this.workflowFor(run);
    const artifacts: string[] = [];

    for (let index = startIndex; index < run.steps.length; index += 1) {
      const step = run.steps[index];
      if (step === undefined || terminalStepStatuses.has(step.status)) {
        continue;
      }

      const workflowStep = workflow.steps.find((candidate) => candidate.id === step.id);
      if (workflowStep === undefined) {
        run = replaceStep(run, index, {
          ...step,
          status: "skipped",
          reason: `Workflow step not found: ${step.id}`,
          completedAt: this.now()
        });
        await this.stepEvent(run, "step.skipped", step.id, { reason: run.steps[index]?.reason });
        run = await this.runStore.save(run);
        continue;
      }

      const approval = approvalFor(run, step.id);
      if (this.isGate(workflowStep) && approval?.status !== "approved") {
        const pendingApproval = approval ?? this.buildApproval(run.id, step.id, "pending");
        run = upsertApproval(run, pendingApproval);
        run = await this.runStore.save({ ...run, status: "awaiting-approval" });
        return { run, outcome: "awaiting-approval", artifactPaths: artifacts };
      }

      if (workflowStep.type === "approve") {
        run = replaceStep(run, index, {
          ...step,
          status: "completed",
          startedAt: step.startedAt ?? this.now(),
          completedAt: this.now(),
          reason: "Approval granted."
        });
        await this.stepEvent(run, "step.completed", step.id, { gated: true });
        run = await this.runStore.save(run);
        continue;
      }

      if (this.shouldResumeFixAttempt(step, workflowStep)) {
        const fixAttempt = await this.attemptFix({
          run,
          index,
          workflowStep,
          failedResult: failedResultFromStep(step),
          artifactPaths: artifacts,
          timeoutMs
        });
        run = fixAttempt.run;
        if (fixAttempt.fixed) {
          continue;
        }

        const failedStep = run.steps[index] ?? step;
        run = replaceStep(run, index, {
          ...failedStep,
          status: "failed",
          completedAt: this.now(),
          reason: failedStep.reason ?? `Fix attempts exhausted for step: ${step.id}`
        });
        run = skipFromIndex(run, index + 1, `Previous step failed: ${step.id}`);
        run = await this.runStore.save({ ...run, status: "failed" });
        return { run, outcome: "failed", artifactPaths: artifacts };
      }

      const adapter = this.workerRegistry.resolve(workflowStep.role);
      if (adapter === undefined) {
        run = replaceStep(run, index, {
          ...step,
          status: "skipped",
          reason: `No worker registered for role: ${workflowStep.role}`,
          completedAt: this.now()
        });
        await this.stepEvent(run, "step.skipped", step.id, { role: workflowStep.role, reason: run.steps[index]?.reason });
        run = await this.runStore.save(run);
        continue;
      }

      run = replaceStep(run, index, {
        ...step,
        status: "running",
        startedAt: step.startedAt ?? this.now()
      });
      await this.stepEvent(run, "step.started", step.id, { role: workflowStep.role });
      run = await this.runStore.save(run);

      const result = await this.invokeWorker(run, workflowStep, timeoutMs);
      const stepArtifacts = await this.writeStepArtifacts(run, step.id, result);
      artifacts.push(...stepArtifacts);

      const status: RunStep["status"] = result.success ? "completed" : "failed";
      const reason = stepReason(result);
      const completedStep = {
        ...(run.steps[index] ?? step),
        id: step.id,
        type: step.type,
        status,
        completedAt: this.now(),
        artifacts: stepArtifacts
      };
      run = replaceStep(run, index, {
        ...(reason === undefined ? completedStep : { ...completedStep, reason })
      });
      await this.stepEvent(run, result.success ? "step.completed" : "step.failed", step.id, {
        exitCode: result.exitCode,
        stub: result.metadata?.stub === true
      });
      run = await this.runStore.save(run);

      if (!result.success) {
        if (this.fixEnabled) {
          const fixAttempt = await this.attemptFix({
            run,
            index,
            workflowStep,
            failedResult: result,
            artifactPaths: artifacts,
            timeoutMs
          });
          run = fixAttempt.run;
          if (fixAttempt.fixed) {
            continue;
          }
        }

        run = skipFromIndex(run, index + 1, `Previous step failed: ${step.id}`);
        run = await this.runStore.save({ ...run, status: "failed" });
        return { run, outcome: "failed", artifactPaths: artifacts };
      }
    }

    run = await this.runStore.save({ ...run, status: "completed" });
    return { run, outcome: "completed", artifactPaths: artifacts };
  }

  private async attemptFix(input: AttemptFixInput): Promise<AttemptFixResult> {
    if (!this.fixPolicy.isFixable(input.workflowStep.type) || this.workerRegistry.resolve("fixer") === undefined) {
      return { run: input.run, fixed: false };
    }

    let run = input.run;
    let failedResult = input.failedResult;
    let attempts = run.steps[input.index]?.attempts ?? 0;
    const maxAttempts = this.fixPolicy.maxAttempts;

    while (attempts < maxAttempts) {
      attempts += 1;
      const failedStep = run.steps[input.index];
      if (failedStep === undefined) {
        return { run, fixed: false };
      }

      run = replaceStep(run, input.index, runningFixStep(failedStep, attempts, maxAttempts, this.now()));
      await this.stepEvent(run, "fix.attempt.started", failedStep.id, {
        attempt: attempts,
        maxAttempts,
        role: "fixer"
      });
      run = await this.runStore.save(run);

      const fixerStep = buildFixerStep(input.workflowStep, attempts);
      const fixResult = await this.invokeWorker(
        run,
        fixerStep,
        input.timeoutMs,
        buildFixPrompt({
          run,
          failedStep: input.workflowStep,
          failedRunStep: failedStep,
          failedResult,
          runDirectory: this.artifactStore.getRunDir(run.id),
          attempt: attempts,
          maxAttempts
        })
      );
      const fixArtifacts = await this.writeStepArtifacts(run, fixerStep.id, fixResult);
      input.artifactPaths.push(...fixArtifacts);
      await this.stepEvent(run, "fix.attempt.finished", failedStep.id, {
        attempt: attempts,
        maxAttempts,
        success: fixResult.success,
        exitCode: fixResult.exitCode,
        stub: fixResult.metadata?.stub === true
      });
      run = await this.runStore.save(run);

      await this.stepEvent(run, "step.retried", failedStep.id, {
        attempt: attempts,
        maxAttempts
      });
      const retryResult = await this.invokeWorker(run, input.workflowStep, input.timeoutMs);
      failedResult = retryResult;
      const retryArtifacts = await this.writeStepArtifacts(run, retryStepArtifactId(input.workflowStep.id, attempts), retryResult);
      input.artifactPaths.push(...retryArtifacts);

      const isLastAttempt = attempts >= maxAttempts;
      const status: RunStep["status"] = retryResult.success ? "completed" : isLastAttempt ? "failed" : "running";
      const reason = stepReason(retryResult);
      run = replaceStep(run, input.index, retryStep({
        previousStep: run.steps[input.index] ?? failedStep,
        status,
        attempts,
        artifacts: retryArtifacts,
        now: this.now(),
        reason
      }));
      await this.stepEvent(run, retryResult.success ? "step.completed" : "step.failed", failedStep.id, {
        attempt: attempts,
        retried: true,
        exitCode: retryResult.exitCode,
        stub: retryResult.metadata?.stub === true
      });
      run = await this.runStore.save(run);

      if (retryResult.success) {
        return { run, fixed: true };
      }
    }

    return { run, fixed: false };
  }

  private shouldResumeFixAttempt(step: RunStep, workflowStep: WorkflowStep): boolean {
    return (
      this.fixEnabled &&
      step.status === "running" &&
      (step.attempts ?? 0) > 0 &&
      this.fixPolicy.isFixable(workflowStep.type)
    );
  }

  private async invokeWorker(
    run: Run,
    step: WorkflowStep,
    timeoutMs: number | undefined,
    promptOverride?: string
  ): Promise<WorkerRunResult> {
    const adapter = this.workerRegistry.resolve(step.role);
    if (adapter === undefined) {
      throw new Error(`No worker registered for role: ${step.role}`);
    }

    const startedAt = Date.now();
    try {
      return await adapter.run({
        cwd: requiredWorktreePath(run),
        prompt:
          promptOverride ??
          buildStepPrompt({
            run,
            step,
            runDirectory: this.artifactStore.getRunDir(run.id)
          }),
        metadata: {
          runId: run.id,
          stepId: step.id,
          stepType: step.type,
          role: step.role,
          runDirectory: this.artifactStore.getRunDir(run.id)
        },
        ...(timeoutMs === undefined ? {} : { timeoutMs })
      });
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: errorMessage(error),
        durationMs: Date.now() - startedAt,
        artifacts: []
      };
    }
  }

  private async writeStepArtifacts(run: Run, stepId: string, result: WorkerRunResult): Promise<string[]> {
    const stdoutPath = await this.artifactStore.writeArtifact(run.id, `logs/${stepId}.stdout.log`, result.stdout);
    const stderrPath = await this.artifactStore.writeArtifact(run.id, `logs/${stepId}.stderr.log`, result.stderr);
    const resultPath = await this.artifactStore.writeArtifact(
      run.id,
      `steps/${stepId}.result.json`,
      `${JSON.stringify(result, null, 2)}\n`
    );

    return [stdoutPath, stderrPath, resultPath, ...result.artifacts];
  }

  private findCurrentGate(run: Run): { index: number; step: RunStep } | undefined {
    const workflow = this.workflowFor(run);

    for (let index = 0; index < run.steps.length; index += 1) {
      const step = run.steps[index];
      if (step === undefined || terminalStepStatuses.has(step.status)) {
        continue;
      }

      const workflowStep = workflow.steps.find((candidate) => candidate.id === step.id);
      if (workflowStep !== undefined && this.isGate(workflowStep)) {
        return { index, step };
      }
    }

    return undefined;
  }

  private isGate(step: WorkflowStep): boolean {
    return step.type === "approve" || this.approvalPolicy.requiresApproval(step.type);
  }

  private workflowFor(run: Run): Workflow {
    const workflow = this.workflows.find((candidate) => candidate.id === run.workflowId);
    if (workflow === undefined) {
      throw new Error(`Workflow not found for run ${run.id}: ${run.workflowId}`);
    }
    return workflow;
  }

  private buildApproval(runId: string, stepId: string, status: ApprovalStatus, note?: string, createdAt?: string): Approval {
    const baseApproval = {
      runId,
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

  private async stepEvent(run: Run, type: string, stepId: string, payload: Record<string, unknown> = {}): Promise<void> {
    const logger = new EventLogger({
      eventLogPath: path.join(this.artifactStore.getRunDir(run.id), "events.jsonl"),
      clock: this.clock
    });
    await logger.append({ type, runId: run.id, payload: { stepId, ...payload } });
  }

  private resolveWorktreeRoot(runId: string): string {
    if (this.worktreeRoot !== undefined) {
      return this.worktreeRoot;
    }

    const runDirectory = this.artifactStore.getRunDir(runId);
    return path.join(path.dirname(path.dirname(runDirectory)), "worktrees");
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

type RetryStepInput = {
  previousStep: RunStep;
  status: RunStep["status"];
  attempts: number;
  artifacts: string[];
  now: string;
  reason: string | undefined;
};

function buildFixerStep(failedStep: WorkflowStep, attempt: number): WorkflowStep {
  return {
    id: `${failedStep.id}.fix.${attempt}`,
    name: `Fix ${failedStep.name}`,
    type: "fix",
    role: "fixer"
  };
}

function retryStepArtifactId(stepId: string, attempt: number): string {
  return `${stepId}.retry.${attempt}`;
}

function runningFixStep(step: RunStep, attempts: number, maxAttempts: number, now: string): RunStep {
  return {
    id: step.id,
    type: step.type,
    status: "running",
    startedAt: step.startedAt ?? now,
    reason: `Fix attempt ${attempts} of ${maxAttempts} in progress.`,
    ...(step.artifacts === undefined ? {} : { artifacts: step.artifacts }),
    attempts
  };
}

function retryStep(input: RetryStepInput): RunStep {
  const base = {
    id: input.previousStep.id,
    type: input.previousStep.type,
    status: input.status,
    startedAt: input.previousStep.startedAt ?? input.now,
    artifacts: input.artifacts,
    attempts: input.attempts,
    ...(input.reason === undefined ? {} : { reason: input.reason })
  };

  return input.status === "running"
    ? base
    : {
        ...base,
        completedAt: input.now
      };
}

function failedResultFromStep(step: RunStep): WorkerRunResult {
  return {
    success: false,
    exitCode: null,
    stdout: "",
    stderr: step.reason ?? `Previous fix attempt did not complete successfully: ${step.id}`,
    durationMs: 0,
    artifacts: step.artifacts ?? []
  };
}

function approvalFor(run: Run, stepId: string): Approval | undefined {
  return run.approvals?.find((approval) => approval.stepId === stepId);
}

function upsertApproval(run: Run, approval: Approval): Run {
  const approvals = run.approvals ?? [];
  const existingIndex = approvals.findIndex((candidate) => candidate.stepId === approval.stepId);
  const nextApprovals =
    existingIndex === -1
      ? [...approvals, approval]
      : approvals.map((candidate, index) => (index === existingIndex ? { ...candidate, ...approval } : candidate));

  return { ...run, approvals: nextApprovals };
}

function replaceStep(run: Run, index: number, step: RunStep): Run {
  return {
    ...run,
    steps: run.steps.map((candidate, candidateIndex) => (candidateIndex === index ? step : candidate))
  };
}

function skipFromIndex(run: Run, startIndex: number, reason: string): Run {
  return {
    ...run,
    steps: run.steps.map((step, index) =>
      index < startIndex || terminalStepStatuses.has(step.status)
        ? step
        : {
            ...step,
            status: "skipped",
            reason
          }
    )
  };
}

function markRunFailed(run: Run, reason: string): Run {
  return skipFromIndex({ ...run, status: "failed" }, 0, reason);
}

function requiredWorktreePath(run: Run): string {
  if (run.worktreePath === undefined) {
    throw new Error(`Run is missing worktreePath: ${run.id}`);
  }
  return run.worktreePath;
}

function stepReason(result: WorkerRunResult): string | undefined {
  if (result.metadata?.stub === true) {
    return "Completed by stub worker.";
  }
  if (result.success) {
    return undefined;
  }
  return result.stderr || result.stdout || "Worker failed.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
