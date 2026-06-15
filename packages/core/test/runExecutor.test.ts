import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Run, Workflow } from "@baton/schemas";
import { describe, expect, it, vi } from "vitest";

import {
  ApprovalPolicy,
  ArtifactStore,
  RunExecutor,
  RunService,
  RunStore,
  WorkerRegistry,
  fixedClock,
  type WorkerAdapter,
  type WorkerRunInput,
  type WorkerRunResult,
  type WorktreeManager
} from "../src/index.js";

type Harness = {
  artifactStore: ArtifactStore;
  executor: RunExecutor;
  runStore: RunStore;
  workspaceRoot: string;
  worktreePath: string;
  worktreeManager: WorktreeManager;
};

const successResult: WorkerRunResult = {
  success: true,
  exitCode: 0,
  stdout: "ok",
  stderr: "",
  durationMs: 1,
  artifacts: []
};

function worker(calls: WorkerRunInput[], result: WorkerRunResult | Error = successResult): WorkerAdapter {
  return {
    async run(input: WorkerRunInput): Promise<WorkerRunResult> {
      calls.push(input);
      if (result instanceof Error) {
        throw result;
      }
      return result;
    }
  };
}

async function createHarness(workflows: Workflow[], registry: WorkerRegistry, policy = new ApprovalPolicy({ requiresApprovalFor: [] })): Promise<Harness> {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-executor-"));
  const artifactStore = new ArtifactStore({ workspaceRoot });
  const clock = fixedClock("2026-06-15T00:00:00.000Z");
  const runStore = new RunStore({ artifactStore, clock });
  const worktreeRoot = path.join(workspaceRoot, ".baton", "worktrees");
  const worktreeManager: WorktreeManager = {
    createWorktree: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 1 })),
    removeWorktree: vi.fn(),
    list: vi.fn()
  };
  const runService = new RunService({
    artifactStore,
    workflows,
    clock,
    idGenerator: () => "run-1"
  });
  const executor = new RunExecutor({
    runService,
    runStore,
    artifactStore,
    worktreeManager,
    workerRegistry: registry,
    workflows,
    approvalPolicy: policy,
    clock,
    worktreeRoot
  });

  return {
    artifactStore,
    executor,
    runStore,
    workspaceRoot,
    worktreePath: path.join(worktreeRoot, "run-1"),
    worktreeManager
  };
}

describe("RunExecutor", () => {
  it("starts a run, creates one worktree, runs steps in the worktree, and writes artifacts/events", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [
          { id: "analyze", name: "Analyze", type: "analyze", role: "analyst" },
          { id: "test", name: "Test", type: "test", role: "tester" }
        ]
      }
    ];
    const registry = new WorkerRegistry().register("analyst", worker(calls)).register("tester", worker(calls));
    const harness = await createHarness(workflows, registry);

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("completed");
    expect(result.run.status).toBe("completed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
    expect(calls.map((call) => call.cwd)).toEqual([harness.worktreePath, harness.worktreePath]);
    expect(calls[0]?.metadata).toMatchObject({
      runId: "run-1",
      stepId: "analyze",
      stepType: "analyze",
      role: "analyst",
      runDirectory: harness.artifactStore.getRunDir("run-1")
    });
    expect(harness.worktreeManager.createWorktree).toHaveBeenCalledTimes(1);
    expect(harness.worktreeManager.createWorktree).toHaveBeenCalledWith({
      runId: "run-1",
      worktreePath: harness.worktreePath,
      baseBranch: "main"
    });
    expect(await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "logs", "analyze.stdout.log"), "utf8")).toBe("ok");
    expect(await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "steps", "analyze.result.json"), "utf8")).toContain("\"success\": true");
    expect(await readFile(path.join(harness.artifactStore.getRunDir("run-1"), "events.jsonl"), "utf8")).toContain("step.started");
    expect((await harness.runStore.load("run-1")).status).toBe("completed");
  });

  it("turns worker failure into failed run state and skips remaining steps", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [
          { id: "analyze", name: "Analyze", type: "analyze", role: "analyst" },
          { id: "test", name: "Test", type: "test", role: "tester" }
        ]
      }
    ];
    const failed: WorkerRunResult = {
      success: false,
      exitCode: 7,
      stdout: "",
      stderr: "failed",
      durationMs: 1,
      artifacts: []
    };
    const registry = new WorkerRegistry().register("analyst", worker(calls, failed)).register("tester", worker(calls));
    const harness = await createHarness(workflows, registry);

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("failed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["failed", "skipped"]);
    expect(calls).toHaveLength(1);
  });

  it("skips unregistered roles and continues", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [
          { id: "analyze", name: "Analyze", type: "analyze", role: "analyst" },
          { id: "test", name: "Test", type: "test", role: "tester" }
        ]
      }
    ];
    const registry = new WorkerRegistry().register("tester", worker(calls));
    const harness = await createHarness(workflows, registry);

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("completed");
    expect(result.run.steps.map((step) => step.status)).toEqual(["skipped", "completed"]);
    expect(result.run.steps[0]?.reason).toContain("No worker registered");
    expect(calls).toHaveLength(1);
  });

  it("pauses at policy approval gates without invoking the gated worker", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [{ id: "implement", name: "Implement", type: "implement", role: "implementer" }]
      }
    ];
    const registry = new WorkerRegistry().register("implementer", worker(calls));
    const harness = await createHarness(workflows, registry, new ApprovalPolicy());

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("awaiting-approval");
    expect(result.run.status).toBe("awaiting-approval");
    expect(result.run.approvals).toMatchObject([{ stepId: "implement", status: "pending" }]);
    expect(calls).toHaveLength(0);
  });

  it("records approval decisions and resumes through a gated step", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [{ id: "implement", name: "Implement", type: "implement", role: "implementer" }]
      }
    ];
    const registry = new WorkerRegistry().register("implementer", worker(calls));
    const harness = await createHarness(workflows, registry, new ApprovalPolicy());

    await harness.executor.start("Build Baton");
    const decided = await harness.executor.decide("run-1", { decision: "approved", note: "Proceed" });
    const resumed = await harness.executor.resume("run-1");

    expect(decided.approvals).toMatchObject([{ stepId: "implement", status: "approved", note: "Proceed" }]);
    expect(resumed.outcome).toBe("completed");
    expect(resumed.run.steps[0]?.status).toBe("completed");
    expect(calls).toHaveLength(1);
  });

  it("cancels a run and skips the gate when approval is rejected", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [{ id: "implement", name: "Implement", type: "implement", role: "implementer" }]
      }
    ];
    const registry = new WorkerRegistry().register("implementer", worker(calls));
    const harness = await createHarness(workflows, registry, new ApprovalPolicy());

    await harness.executor.start("Build Baton");
    const rejected = await harness.executor.decide("run-1", { decision: "rejected", note: "No" });

    expect(rejected.status).toBe("cancelled");
    expect(rejected.steps[0]?.status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("marks approve steps complete after approval and continues", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [
          { id: "approve", name: "Approve", type: "approve", role: "architect" },
          { id: "finalize", name: "Finalize", type: "finalize", role: "release_writer" }
        ]
      }
    ];
    const registry = new WorkerRegistry().register("release_writer", worker(calls));
    const harness = await createHarness(workflows, registry);

    await harness.executor.start("Build Baton");
    await harness.executor.decide("run-1", { decision: "approved" });
    const result = await harness.executor.resume("run-1");

    expect(result.run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
    expect(calls).toHaveLength(1);
  });

  it("resumes from the first non-terminal step without re-running completed steps", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [
          { id: "analyze", name: "Analyze", type: "analyze", role: "analyst" },
          { id: "test", name: "Test", type: "test", role: "tester" }
        ]
      }
    ];
    const registry = new WorkerRegistry().register("analyst", worker(calls)).register("tester", worker(calls));
    const harness = await createHarness(workflows, registry);
    const partialRun: Run = {
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath: harness.worktreePath,
      baseBranch: "main",
      steps: [
        { id: "analyze", type: "analyze", status: "completed" },
        { id: "test", type: "test", status: "planned" }
      ]
    };
    await harness.artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await harness.runStore.save(partialRun);

    const result = await harness.executor.resume("run-1");

    expect(result.outcome).toBe("completed");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.prompt).toContain("Step: test");
  });

  it("turns thrown worker errors into failed state", async () => {
    const calls: WorkerRunInput[] = [];
    const workflows: Workflow[] = [
      {
        id: "default",
        name: "Default",
        steps: [{ id: "analyze", name: "Analyze", type: "analyze", role: "analyst" }]
      }
    ];
    const registry = new WorkerRegistry().register("analyst", worker(calls, new Error("boom")));
    const harness = await createHarness(workflows, registry);

    const result = await harness.executor.start("Build Baton");

    expect(result.outcome).toBe("failed");
    expect(result.run.steps[0]?.reason).toContain("boom");
  });
});
