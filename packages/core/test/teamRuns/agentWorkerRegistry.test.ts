import { describe, expect, it } from "vitest";

import {
  AgentWorkerRegistry,
  StubWorker,
  createAgentWorkerRegistry,
  createMockProcessRunner,
  type WorkerAdapter,
  type WorkerRunInput,
  type WorkerRunResult
} from "../../src/index.js";

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

  it("creates codex as a read-only exec adapter when opted in", async () => {
    const mock = createMockProcessRunner();
    const { registry, codexWorker, claudeWorker } = createAgentWorkerRegistry({ codex: true, runner: mock.runner });

    expect(codexWorker).toBe("codex");
    expect(claudeWorker).toBe("stub");
    await registry.resolve("codex").run({ cwd: "/tmp/worktree", prompt: "hello" });

    expect(mock.calls[0]).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "read-only"],
      options: { cwd: "/tmp/worktree", input: "hello" }
    });
  });

  it("creates claude as a read-only json adapter when opted in", async () => {
    const mock = createMockProcessRunner([
      {
        stdout: JSON.stringify({ result: "ok", usage: { input_tokens: 2, output_tokens: 1 } }),
        stderr: "",
        exitCode: 0,
        durationMs: 1
      }
    ]);
    const { registry, codexWorker, claudeWorker } = createAgentWorkerRegistry({ claude: true, runner: mock.runner });

    expect(codexWorker).toBe("stub");
    expect(claudeWorker).toBe("claude");
    const result = await registry.resolve("claude").run({ cwd: "/tmp/worktree", prompt: "hello" });

    expect(result.stdout).toBe("ok");
    expect(result.metadata?.usage).toEqual({ inputTokens: 2, outputTokens: 1 });
    expect(mock.calls[0]).toEqual({
      command: "claude",
      args: ["--print", "--permission-mode", "plan", "--output-format", "json"],
      options: { cwd: "/tmp/worktree", input: "hello" }
    });
  });

  it("creates codex and claude as writable adapters only when readOnly is false", async () => {
    const mock = createMockProcessRunner([
      { stdout: "codex ok", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: JSON.stringify({ result: "claude ok" }), stderr: "", exitCode: 0, durationMs: 1 }
    ]);
    const { registry, codexWorker, claudeWorker } = createAgentWorkerRegistry({
      codex: true,
      claude: true,
      readOnly: false,
      runner: mock.runner
    });

    expect(codexWorker).toBe("codex");
    expect(claudeWorker).toBe("claude");
    await registry.resolve("codex").run({ cwd: "/tmp/worktree", prompt: "implement" });
    await registry.resolve("claude").run({ cwd: "/tmp/worktree", prompt: "design" });

    expect(mock.calls[0]).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "workspace-write"],
      options: { cwd: "/tmp/worktree", input: "implement" }
    });
    expect(mock.calls[1]).toEqual({
      command: "claude",
      args: ["--print", "--permission-mode", "acceptEdits", "--output-format", "json"],
      options: { cwd: "/tmp/worktree", input: "design" }
    });
    expect(mock.calls[1]?.args).not.toContain("--dangerously-skip-permissions");
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
