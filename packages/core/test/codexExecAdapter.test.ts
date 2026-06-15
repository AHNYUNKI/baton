import { describe, expect, it } from "vitest";

import { CodexExecAdapter, createMockProcessRunner } from "../src/index.js";

describe("CodexExecAdapter", () => {
  it("captures stdout, stderr, exit code, duration, and timeout", async () => {
    const mock = createMockProcessRunner([
      {
        stdout: "done",
        stderr: "warn",
        exitCode: 0,
        durationMs: 123
      }
    ]);
    const adapter = new CodexExecAdapter({ runner: mock.runner });

    const result = await adapter.run({ cwd: "/repo", prompt: "implement", timeoutMs: 1000 });

    expect(result).toEqual({
      success: true,
      exitCode: 0,
      stdout: "done",
      stderr: "warn",
      durationMs: 123,
      artifacts: []
    });
    expect(mock.calls[0]).toEqual({
      command: "codex",
      args: ["exec", "--sandbox", "workspace-write", "implement"],
      options: { cwd: "/repo", timeoutMs: 1000 }
    });
  });
});
