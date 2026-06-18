import { describe, expect, it } from "vitest";

import { GitWorktreeManager, createMockProcessRunner } from "../src/index.js";

describe("GitWorktreeManager", () => {
  it("uses argument arrays to create baton run worktrees", async () => {
    const mock = createMockProcessRunner();
    const manager = new GitWorktreeManager({ runner: mock.runner, repoRoot: "/repo" });

    await manager.createWorktree({ runId: "run-1", worktreePath: "/tmp/worktree", baseBranch: "origin/main" });

    expect(mock.calls).toEqual([
      {
        command: "git",
        args: ["worktree", "add", "/tmp/worktree", "-b", "baton/run-1", "origin/main"],
        options: { cwd: "/repo" }
      }
    ]);
  });

  it("captures staged worktree diffs with stat metadata", async () => {
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: " file.ts | 2 ++\n 1 file changed, 2 insertions(+)\n", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "diff --git a/file.ts b/file.ts\n+hello\n", stderr: "", exitCode: 0, durationMs: 3 }
    ]);
    const manager = new GitWorktreeManager({ runner: mock.runner, repoRoot: "/repo" });

    const result = await manager.diff("/tmp/worktree");

    expect(result).toEqual({
      stdout: "diff --git a/file.ts b/file.ts\n+hello\n",
      stderr: "",
      exitCode: 0,
      durationMs: 6,
      metadata: { diffStat: " file.ts | 2 ++\n 1 file changed, 2 insertions(+)\n" }
    });
    expect(mock.calls).toEqual([
      {
        command: "git",
        args: ["-C", "/tmp/worktree", "add", "-A"],
        options: { cwd: "/repo" }
      },
      {
        command: "git",
        args: ["-C", "/tmp/worktree", "--no-pager", "diff", "--cached", "--stat"],
        options: { cwd: "/repo" }
      },
      {
        command: "git",
        args: ["-C", "/tmp/worktree", "--no-pager", "diff", "--cached"],
        options: { cwd: "/repo" }
      }
    ]);
  });
});
