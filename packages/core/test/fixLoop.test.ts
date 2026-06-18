import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Run, Workflow } from "@baton/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  ApprovalPolicy,
  ArtifactStore,
  FixPolicy,
  RunExecutor,
  RunService,
  RunStore,
  WorkerRegistry,
  buildFixPrompt,
  fixedClock,
  maxFixAttemptsLimit,
  type WorkerAdapter,
  type WorkerRunInput,
  type WorkerRunResult,
  type WorktreeManager
} from "../src/index.js";

type Harness = {
  artifactStore: ArtifactStore;
  executor: RunExecutor;
  runStore: RecordingRunStore;
  worktreePath: string;
};

const successResult: WorkerRunResult = {
  success: true,
  exitCode: 0,
  stdout: "ok",
  stderr: "",
  durationMs: 1,
  artifacts: []
};

const failedResult: WorkerRunResult = {
  success: false,
  exitCode: 1,
  stdout: "test stdout",
  stderr: "test stderr",
  durationMs: 1,
  artifacts: []
};

class RecordingRunStore extends RunStore {
  public readonly savedRuns: Run[] = [];

  public override async save(run: Run): Promise<Run> {
    const saved = await super.save(run);
    this.savedRuns.push(saved);
    return saved;
  }
}

function worker(calls: WorkerRunInput[], results: readonly WorkerRunResult[] = [successResult]): WorkerAdapter {
  const queuedResults = [...results];
  return {
    async run(input: WorkerRunInput): Promise<WorkerRunResult> {
      calls.push(input);
      return queuedResults.shift() ?? results[results.length - 1] ?? successResult;
    }
  };
}

async function createHarness(
  workflows: Workflow[],
  registry: WorkerRegistry,
  options: { fixEnabled?: boolean; fixPolicy?: FixPolicy } = {}
): Promise<Harness> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-fix-loop-"));
  const artifactStore = new ArtifactStore({ workspaceRoot });
  const clock = fixedClock("2026-06-15T00:00:00.000Z");
  const runStore = new RecordingRunStore({ artifactStore, clock });
  const worktreeRoot = path.join(workspaceRoot, ".baton", "worktrees");
  const runService = new RunService({
    artifactStore,
    workflows,
    clock,
    idGenerator: () => "run-1"
  });
  const worktreeManager: WorktreeManager = {
    createWorktree: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 1 })),
    removeWorktree: vi.fn(),
    list: vi.fn(),
    diff: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 1 }))
  };
  const executor = new RunExecutor({
    runService,
    runStore,
    artifactStore,
    worktreeManager,
    workerRegistry: registry,
    workflows,
    approvalPolicy: new ApprovalPolicy({ requiresApprovalFor: [] }),
    clock,
    worktreeRoot,
    fixEnabled: options.fixEnabled ?? false,
    fixPolicy: options.fixPolicy ?? new FixPolicy()
  });

  return {
    artifactStore,
    executor,
    runStore,
    worktreePath: path.join(worktreeRoot, "run-1")
  };
}

function workflow(stepIds: readonly ("test" | "review")[]): Workflow[] {
  return [
    {
      id: "default",
      name: "Default",
      steps: stepIds.map((id) =>
        id === "test"
          ? { id: "test", name: "Test", type: "test", role: "tester" }
          : { id: "review", name: "Review", type: "review", role: "reviewer" }
      )
    }
  ];
}

describe("FixPolicy and buildFixPrompt", () => {
  it("defaults to one test fix attempt and rejects invalid maxima", () => {
    const policy = new FixPolicy();

    expect(policy.maxAttempts).toBe(1);
    expect(policy.isFixable("test")).toBe(true);
    expect(policy.isFixable("review")).toBe(false);
    expect(new FixPolicy({ maxAttempts: maxFixAttemptsLimit }).maxAttempts).toBe(maxFixAttemptsLimit);
    expect(() => new FixPolicy({ maxAttempts: 0 })).toThrow("maxFixAttempts");
    expect(() => new FixPolicy({ maxAttempts: 1.5 })).toThrow("maxFixAttempts");
    expect(() => new FixPolicy({ maxAttempts: maxFixAttemptsLimit + 1 })).toThrow("maxFixAttempts");
  });

  it("builds a fixer prompt with failed step output and artifact context", () => {
    const prompt = buildFixPrompt({
      run: {
        id: "run-1",
        request: "Build Baton",
        workflowId: "default",
        status: "running",
        dryRun: false,
        createdAt: "2026-06-15T00:00:00.000Z",
        steps: [{ id: "test", type: "test", status: "failed", artifacts: ["/tmp/test_result.md"] }]
      },
      failedStep: { id: "test", name: "Test", type: "test", role: "tester" },
      failedRunStep: { id: "test", type: "test", status: "failed", artifacts: ["/tmp/test_result.md"] },
      failedResult: failedResult,
      runDirectory: "/tmp/run-1",
      attempt: 1,
      maxAttempts: 3
    });

    expect(prompt).toContain("Fix attempt: 1 of 3");
    expect(prompt).toContain("Failed step: test (test)");
    expect(prompt).toContain("/tmp/test_result.md");
    expect(prompt).toContain("test stdout");
    expect(prompt).toContain("test stderr");
  });
});

describe("RunExecutor bounded fix loop", () => {
  it("preserves the failed-step path and never calls fixer when fix is disabled", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const fixerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry()
      .register("tester", worker(testerCalls, [failedResult]))
      .register("fixer", worker(fixerCalls))
      .register("reviewer", worker([]));
    const harness = await createHarness(workflow(["test", "review"]), registry);

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("failed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["failed", "skipped"]);
    expect(testerCalls).toHaveLength(1);
    expect(fixerCalls).toHaveLength(0);
    expect(result.run.steps[0]?.attempts).toBeUndefined();
  });

  it("runs fixer once, retries the failed test in the worktree, and continues when retry passes", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const fixerCalls: WorkerRunInput[] = [];
    const reviewerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry()
      .register("tester", worker(testerCalls, [failedResult, successResult]))
      .register("fixer", worker(fixerCalls, [successResult]))
      .register("reviewer", worker(reviewerCalls, [successResult]));
    const harness = await createHarness(workflow(["test", "review"]), registry, { fixEnabled: true });

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("completed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
    expect(result.run.steps[0]?.attempts).toBe(1);
    expect(testerCalls).toHaveLength(2);
    expect(fixerCalls).toHaveLength(1);
    expect(reviewerCalls).toHaveLength(1);
    expect([...testerCalls, ...fixerCalls, ...reviewerCalls].map((call) => call.cwd)).toEqual([
      harness.worktreePath,
      harness.worktreePath,
      harness.worktreePath,
      harness.worktreePath
    ]);
    expect(fixerCalls[0]?.prompt).toContain("Fix attempt: 1 of 1");
    expect(fixerCalls[0]?.prompt).toContain("test stderr");

    const events = await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "events.jsonl"), "utf8");
    expect(events).toContain("fix.attempt.started");
    expect(events).toContain("fix.attempt.finished");
    expect(events).toContain("step.retried");
    expect(await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "logs", "test.retry.1.stdout.log"), "utf8")).toBe("ok");
    expect(await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "logs", "test.fix.1.stdout.log"), "utf8")).toBe("ok");
  });

  it("stops after exactly maxFixAttempts and fails the run when retries keep failing", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const fixerCalls: WorkerRunInput[] = [];
    const reviewerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry()
      .register("tester", worker(testerCalls, [failedResult]))
      .register("fixer", worker(fixerCalls, [successResult]))
      .register("reviewer", worker(reviewerCalls, [successResult]));
    const harness = await createHarness(workflow(["test", "review"]), registry, {
      fixEnabled: true,
      fixPolicy: new FixPolicy({ maxAttempts: 3 })
    });

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("failed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["failed", "skipped"]);
    expect(result.run.steps[0]?.attempts).toBe(3);
    expect(testerCalls).toHaveLength(4);
    expect(fixerCalls).toHaveLength(3);
    expect(reviewerCalls).toHaveLength(0);
  });

  it("does not enter the fix loop when the first test run passes", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const fixerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry().register("tester", worker(testerCalls, [successResult])).register("fixer", worker(fixerCalls));
    const harness = await createHarness(workflow(["test"]), registry, { fixEnabled: true });

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("completed");
    expect(testerCalls).toHaveLength(1);
    expect(fixerCalls).toHaveLength(0);
    expect(result.run.steps[0]?.attempts).toBeUndefined();
  });

  it("fails safely without retrying when no fixer role is registered", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry().register("tester", worker(testerCalls, [failedResult]));
    const harness = await createHarness(workflow(["test"]), registry, { fixEnabled: true });

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("failed");
    expect(testerCalls).toHaveLength(1);
    expect(result.run.steps[0]?.attempts).toBeUndefined();
  });

  it("persists attempts after each bounded retry", async () => {
    const registry = new WorkerRegistry()
      .register("tester", worker([], [failedResult, failedResult, successResult]))
      .register("fixer", worker([], [successResult]));
    const harness = await createHarness(workflow(["test"]), registry, {
      fixEnabled: true,
      fixPolicy: new FixPolicy({ maxAttempts: 2 })
    });

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("completed");
    expect(harness.runStore.savedRuns.some((run) => run.steps[0]?.attempts === 1)).toBe(true);
    expect(harness.runStore.savedRuns.some((run) => run.steps[0]?.attempts === 2)).toBe(true);
    expect((await harness.runStore.load("run-1")).steps[0]).toMatchObject({ status: "completed", attempts: 2 });
  });

  it("resumes after completed fixable steps without rerunning them", async () => {
    const testerCalls: WorkerRunInput[] = [];
    const reviewerCalls: WorkerRunInput[] = [];
    const registry = new WorkerRegistry()
      .register("tester", worker(testerCalls, [failedResult]))
      .register("fixer", worker([], [successResult]))
      .register("reviewer", worker(reviewerCalls, [successResult]));
    const harness = await createHarness(workflow(["test", "review"]), registry, { fixEnabled: true });
    await harness.artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await harness.runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath: harness.worktreePath,
      baseBranch: "main",
      steps: [
        { id: "test", type: "test", status: "completed", attempts: 1 },
        { id: "review", type: "review", status: "planned" }
      ]
    });

    const result = await harness.executor.resume("run-1");

    expect(result.outcome).toBe("completed");
    expect(testerCalls).toHaveLength(0);
    expect(reviewerCalls).toHaveLength(1);
  });
});
