import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TestRunnerAdapter, createMockProcessRunner } from "../src/index.js";

describe("TestRunnerAdapter", () => {
  it("runs the configured command in the input cwd and records test_result.md", async () => {
    const mock = createMockProcessRunner([
      {
        stdout: "all good",
        stderr: "",
        exitCode: 0,
        durationMs: 123
      }
    ]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-test-runner-"));
    const adapter = new TestRunnerAdapter({
      runner: mock.runner,
      command: "pnpm",
      args: ["test", "--run"],
      timeoutMs: 5_000
    });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "unused prompt",
      metadata: { runDirectory, stepId: "test", stepType: "test", role: "tester" }
    });

    const artifactPath = path.join(runDirectory, "test_result.md");
    expect(result).toMatchObject({
      success: true,
      exitCode: 0,
      stdout: "all good",
      stderr: "",
      durationMs: 123
    });
    expect(result.artifacts).toEqual([artifactPath]);
    expect(mock.calls[0]).toEqual({
      command: "pnpm",
      args: ["test", "--run"],
      options: { cwd: "/repo/worktree", timeoutMs: 5_000 }
    });
    expect(mock.calls[0]?.options?.input).toBeUndefined();

    const artifact = await readFile(artifactPath, "utf8");
    expect(artifact).toContain('Command: `["pnpm","test","--run"]`');
    expect(artifact).toContain("Exit code: 0");
    expect(artifact).toContain("Summary: PASS");
    expect(artifact).toContain("all good");
  });

  it("lets input timeout override the configured timeout", async () => {
    const mock = createMockProcessRunner();
    const adapter = new TestRunnerAdapter({
      runner: mock.runner,
      command: "pnpm",
      args: ["test"],
      timeoutMs: 5_000
    });

    await adapter.run({ cwd: "/repo/worktree", prompt: "", timeoutMs: 100 });

    expect(mock.calls[0]?.options).toEqual({ cwd: "/repo/worktree", timeoutMs: 100 });
  });

  it("does not force a test_result.md artifact for non-test steps", async () => {
    const mock = createMockProcessRunner([{ stdout: "review", stderr: "", exitCode: 0, durationMs: 1 }]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-test-runner-"));
    const adapter = new TestRunnerAdapter({ runner: mock.runner, command: "pnpm", args: ["test"] });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "",
      metadata: { runDirectory, stepId: "review", stepType: "review" }
    });

    expect(result.artifacts).toEqual([]);
  });

  it("maps non-zero and timeout-like exits to unsuccessful results", async () => {
    const mock = createMockProcessRunner([
      { stdout: "failed tests", stderr: "assertion failed", exitCode: 1, durationMs: 10 },
      { stdout: "", stderr: "", exitCode: null, durationMs: 1000 }
    ]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-test-runner-"));
    const adapter = new TestRunnerAdapter({ runner: mock.runner, command: "pnpm", args: ["test"] });

    const failed = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "",
      metadata: { runDirectory, stepId: "test", stepType: "test" }
    });
    const timedOut = await adapter.run({ cwd: "/repo/worktree", prompt: "" });

    expect(failed).toMatchObject({ success: false, exitCode: 1 });
    expect(await readFile(path.join(runDirectory, "test_result.md"), "utf8")).toContain("Summary: FAIL");
    expect(timedOut).toMatchObject({ success: false, exitCode: null });
  });

  it("turns runner errors into unsuccessful results and still writes a test artifact when possible", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-test-runner-"));
    const adapter = new TestRunnerAdapter({
      command: "pnpm",
      args: ["test"],
      runner: {
        async run(): Promise<never> {
          throw new Error("spawn failed");
        }
      }
    });

    const result = await adapter.run({
      cwd: "/repo/worktree",
      prompt: "",
      metadata: { runDirectory, stepId: "test", stepType: "test" }
    });

    expect(result).toMatchObject({
      success: false,
      exitCode: null,
      stderr: "spawn failed"
    });
    expect(result.artifacts).toEqual([path.join(runDirectory, "test_result.md")]);
    expect(await readFile(result.artifacts[0] ?? "", "utf8")).toContain("spawn failed");
  });

  it("keeps large stdout and stderr bounded in test_result.md", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-test-runner-"));
    const mock = createMockProcessRunner([
      {
        stdout: "x".repeat(4_100),
        stderr: "y".repeat(4_100),
        exitCode: 1,
        durationMs: 1
      }
    ]);
    const adapter = new TestRunnerAdapter({ runner: mock.runner, command: "pnpm", args: ["test"] });

    await adapter.run({
      cwd: "/repo/worktree",
      prompt: "",
      metadata: { runDirectory, stepId: "test", stepType: "test" }
    });

    const artifact = await readFile(path.join(runDirectory, "test_result.md"), "utf8");
    expect(artifact).toContain("[truncated 100 character(s)]");
    expect(artifact.length).toBeLessThan(8_800);
  });
});
