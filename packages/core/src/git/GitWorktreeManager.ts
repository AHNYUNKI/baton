import type { ProcessRunner, ProcessRunOptions, ProcessRunResult } from "../ports/ProcessRunner.js";

export type CreateWorktreeInput = {
  runId: string;
  worktreePath: string;
  baseBranch?: string;
};

export type WorktreeManager = {
  createWorktree(input: CreateWorktreeInput): Promise<ProcessRunResult>;
  removeWorktree(worktreePath: string): Promise<ProcessRunResult>;
  list(): Promise<ProcessRunResult>;
};

export type GitWorktreeManagerOptions = {
  runner: ProcessRunner;
  repoRoot?: string;
};

export class GitWorktreeManager implements WorktreeManager {
  private readonly runner: ProcessRunner;
  private readonly repoRoot: string | undefined;

  public constructor(options: GitWorktreeManagerOptions) {
    this.runner = options.runner;
    this.repoRoot = options.repoRoot;
  }

  public async createWorktree(input: CreateWorktreeInput): Promise<ProcessRunResult> {
    const branchName = `baton/${input.runId}`;
    return this.runner.run(
      "git",
      ["worktree", "add", input.worktreePath, "-b", branchName, input.baseBranch ?? "main"],
      this.runnerOptions()
    );
  }

  public async removeWorktree(worktreePath: string): Promise<ProcessRunResult> {
    return this.runner.run("git", ["worktree", "remove", worktreePath], this.runnerOptions());
  }

  public async list(): Promise<ProcessRunResult> {
    return this.runner.run("git", ["worktree", "list", "--porcelain"], this.runnerOptions());
  }

  private runnerOptions(): ProcessRunOptions | undefined {
    return this.repoRoot === undefined ? undefined : { cwd: this.repoRoot };
  }
}
