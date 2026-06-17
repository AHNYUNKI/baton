import { describe, expect, it } from "vitest";

import { AgentWorkerRegistry, StubWorker, createAgentWorkerRegistry, type WorkerAdapter, type WorkerRunInput, type WorkerRunResult } from "../../src/index.js";

describe("AgentWorkerRegistry", () => {
  it("resolves registered adapters", async () => {
    const adapter = new RecordingWorker();
    const registry = new AgentWorkerRegistry().register("custom", adapter);

    await registry.resolve("custom").run({ cwd: "/tmp/worktree", prompt: "hello" });

    expect(adapter.inputs).toEqual([{ cwd: "/tmp/worktree", prompt: "hello" }]);
  });

  it("falls back to StubWorker for unknown agent ids", async () => {
    const registry = new AgentWorkerRegistry();
    const result = await registry.resolve("unknown").run({ cwd: "/tmp/worktree", prompt: "hello" });

    expect(result.success).toBe(true);
    expect(result.metadata?.stub).toBe(true);
  });

  it("creates codex and claude as stub workers by default", async () => {
    const { registry, codexWorker, claudeWorker } = createAgentWorkerRegistry();

    expect(codexWorker).toBe("stub");
    expect(claudeWorker).toBe("stub");
    await expect(registry.resolve("codex").run({ cwd: "/tmp/worktree", prompt: "hello" })).resolves.toMatchObject({
      metadata: { stub: true }
    });
    await expect(registry.resolve("claude").run({ cwd: "/tmp/worktree", prompt: "hello" })).resolves.toMatchObject({
      metadata: { stub: true }
    });
  });

  it("accepts an explicit fallback adapter", () => {
    const fallback = new StubWorker();
    const registry = new AgentWorkerRegistry(fallback);

    expect(registry.resolve("missing")).toBe(fallback);
  });
});

class RecordingWorker implements WorkerAdapter {
  public readonly inputs: WorkerRunInput[] = [];

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    this.inputs.push(input);
    return {
      success: true,
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      durationMs: 0,
      artifacts: []
    };
  }
}
