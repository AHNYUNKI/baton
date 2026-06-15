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
});
