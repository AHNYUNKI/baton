import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ClaudeCodeAdapter, createMockProcessRunner } from "../src/index.js";

describe("ClaudeCodeAdapter", () => {
  it("passes the prompt through stdin, uses read-only default args, and records prompt/output artifacts", async () => {
    const mock = createMockProcessRunner([
      {
        stdout: "# Analysis\n\nFindings",
        stderr: "",
        exitCode: 0,
        durationMs: 42
      }
    ]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-claude-adapter-"));
    const adapter = new ClaudeCodeAdapter({ runner: mock.runner });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "analyze this safely",
      timeoutMs: 1000,
      metadata: { runDirectory, stepId: "analyze", stepType: "analyze", role: "analyst" }
    });

    expect(result).toMatchObject({
      success: true,
      exitCode: 0,
      stdout: "# Analysis\n\nFindings",
      stderr: "",
      durationMs: 42
    });
    expect(result.artifacts).toEqual([
      path.join(runDirectory, "steps", "analyze.prompt.md"),
      path.join(runDirectory, "analysis.md")
    ]);
    expect(await readFile(result.artifacts[0] ?? "", "utf8")).toBe("analyze this safely");
    expect(await readFile(result.artifacts[1] ?? "", "utf8")).toBe("# Analysis\n\nFindings");
    expect(mock.calls[0]).toEqual({
      command: "claude",
      args: ["--print"],
      options: { cwd: "/repo/worktree", input: "analyze this safely", timeoutMs: 1000 }
    });
    expect(mock.calls[0]?.args).not.toContain("analyze this safely");
    expect(mock.calls[0]?.args.join(" ")).not.toMatch(/write|edit|danger|full.access/i);
  });

  it("allows command and args configuration", async () => {
    const mock = createMockProcessRunner();
    const adapter = new ClaudeCodeAdapter({
      runner: mock.runner,
      command: "custom-claude",
      args: ["--print", "--model", "safe-model"]
    });

    await adapter.run({ cwd: "/repo/worktree", prompt: "prompt" });

    expect(mock.calls[0]).toEqual({
      command: "custom-claude",
      args: ["--print", "--model", "safe-model"],
      options: { cwd: "/repo/worktree", input: "prompt" }
    });
  });

  it.each([
    ["analyze", "analysis.md"],
    ["design", "design.md"],
    ["review", "review.md"]
  ] as const)("writes %s output to %s", async (stepType, artifactName) => {
    const mock = createMockProcessRunner([{ stdout: `${stepType} output`, stderr: "", exitCode: 0, durationMs: 1 }]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-claude-artifact-"));
    const adapter = new ClaudeCodeAdapter({ runner: mock.runner });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "prompt",
      metadata: { runDirectory, stepId: stepType, stepType }
    });

    const artifactPath = path.join(runDirectory, artifactName);
    expect(result.artifacts).toContain(artifactPath);
    expect(await readFile(artifactPath, "utf8")).toBe(`${stepType} output`);
  });

  it("does not force an output artifact for unrelated step types", async () => {
    const mock = createMockProcessRunner([{ stdout: "test output", stderr: "", exitCode: 0, durationMs: 1 }]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-claude-artifact-"));
    const adapter = new ClaudeCodeAdapter({ runner: mock.runner });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "prompt",
      metadata: { runDirectory, stepId: "test", stepType: "test" }
    });

    expect(result.artifacts).toEqual([path.join(runDirectory, "steps", "test.prompt.md")]);
  });

  it("maps non-zero and timeout-like exits to unsuccessful results", async () => {
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "bad", exitCode: 2, durationMs: 10 },
      { stdout: "", stderr: "", exitCode: null, durationMs: 1000 }
    ]);
    const adapter = new ClaudeCodeAdapter({ runner: mock.runner });

    await expect(adapter.run({ cwd: "/repo/worktree", prompt: "fail" })).resolves.toMatchObject({ success: false, exitCode: 2 });
    await expect(adapter.run({ cwd: "/repo/worktree", prompt: "timeout" })).resolves.toMatchObject({ success: false, exitCode: null });
  });

  it("turns runner errors into unsuccessful results", async () => {
    const adapter = new ClaudeCodeAdapter({
      runner: {
        async run(): Promise<never> {
          throw new Error("spawn failed");
        }
      }
    });

    await expect(adapter.run({ cwd: "/repo/worktree", prompt: "prompt" })).resolves.toMatchObject({
      success: false,
      exitCode: null,
      stderr: "spawn failed"
    });
  });
});
