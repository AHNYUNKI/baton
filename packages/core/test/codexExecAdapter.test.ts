import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CodexExecAdapter, createMockProcessRunner } from "../src/index.js";

describe("CodexExecAdapter", () => {
  it("passes the prompt through stdin and records a prompt artifact", async () => {
    const mock = createMockProcessRunner([
      {
        stdout: "done",
        stderr: "warn",
        exitCode: 0,
        durationMs: 123
      }
    ]);
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-codex-adapter-"));
    const adapter = new CodexExecAdapter({ runner: mock.runner });

    const result = await adapter.run({
      cwd: "/repo",
      prompt: "implement this safely",
      timeoutMs: 1000,
      metadata: { runDirectory, stepId: "implement" }
    });

    expect(result).toMatchObject({
      success: true,
      exitCode: 0,
      stdout: "done",
      stderr: "warn",
      durationMs: 123
    });
    expect(result.artifacts).toEqual([path.join(runDirectory, "steps", "implement.prompt.md")]);
    expect(await readFile(result.artifacts[0] ?? "", "utf8")).toBe("implement this safely");
    expect(mock.calls[0]).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "workspace-write"],
      options: { cwd: "/repo", input: "implement this safely", timeoutMs: 1000 }
    });
    expect(mock.calls[0]?.args).not.toContain("implement this safely");
  });

  it("allows command, args, and sandbox configuration", async () => {
    const mock = createMockProcessRunner();
    const adapter = new CodexExecAdapter({
      runner: mock.runner,
      command: "custom-codex",
      args: ["run", "--mode", "batch"],
      sandbox: "read-only"
    });

    await adapter.run({ cwd: "/repo", prompt: "prompt" });

    expect(mock.calls[0]).toEqual({
      command: "custom-codex",
      args: ["run", "--mode", "batch"],
      options: { cwd: "/repo", input: "prompt" }
    });
  });

  it("maps non-zero and timeout-like exits to unsuccessful results", async () => {
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "bad", exitCode: 2, durationMs: 10 },
      { stdout: "", stderr: "", exitCode: null, durationMs: 1000 }
    ]);
    const adapter = new CodexExecAdapter({ runner: mock.runner });

    await expect(adapter.run({ cwd: "/repo", prompt: "fail" })).resolves.toMatchObject({ success: false, exitCode: 2 });
    await expect(adapter.run({ cwd: "/repo", prompt: "timeout" })).resolves.toMatchObject({ success: false, exitCode: null });
  });

  it("turns runner errors into unsuccessful results", async () => {
    const adapter = new CodexExecAdapter({
      runner: {
        async run(): Promise<never> {
          throw new Error("spawn failed");
        }
      }
    });

    await expect(adapter.run({ cwd: "/repo", prompt: "prompt" })).resolves.toMatchObject({
      success: false,
      exitCode: null,
      stderr: "spawn failed"
    });
  });
});
