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
  diff(worktreePath: string): Promise<ProcessRunResult>;
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

  public async diff(worktreePath: string): Promise<ProcessRunResult> {
    const add = await this.runner.run("git", ["-C", worktreePath, "add", "-A"], this.runnerOptions());
    if (add.exitCode !== 0) {
      return withDiffStat(add, "");
    }

    const stat = await this.runner.run("git", ["-C", worktreePath, "--no-pager", "diff", "--cached", "--stat"], this.runnerOptions());
    if (stat.exitCode !== 0) {
      return combineDiffResults([add, stat], stat.stdout, stat.exitCode);
    }

    const patch = await this.runner.run("git", ["-C", worktreePath, "--no-pager", "diff", "--cached"], this.runnerOptions());
    return combineDiffResults([add, stat, patch], patch.stdout, patch.exitCode, stat.stdout);
  }

  private runnerOptions(): ProcessRunOptions | undefined {
    return this.repoRoot === undefined ? undefined : { cwd: this.repoRoot };
  }
}

function combineDiffResults(
  results: readonly ProcessRunResult[],
  stdout: string,
  exitCode: number | null,
  diffStat = ""
): ProcessRunResult {
  return {
    stdout,
    stderr: results.map((result) => result.stderr).filter((value) => value.trim().length > 0).join("\n"),
    exitCode,
    durationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    metadata: { diffStat }
  };
}

function withDiffStat(result: ProcessRunResult, diffStat: string): ProcessRunResult {
  return {
    ...result,
    metadata: { ...(result.metadata ?? {}), diffStat }
  };
}
