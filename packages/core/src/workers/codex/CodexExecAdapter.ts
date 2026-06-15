import type { ProcessRunner } from "../../ports/ProcessRunner.js";
import type { ProcessRunOptions } from "../../ports/ProcessRunner.js";
import { createNodeProcessRunner } from "../../ports/ProcessRunner.js";
import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "../WorkerAdapter.js";

export type CodexSandbox = "workspace-write" | "read-only";

export type CodexExecAdapterOptions = {
  runner?: ProcessRunner;
  command?: string;
  sandbox?: CodexSandbox;
};

export class CodexExecAdapter implements WorkerAdapter {
  private readonly runner: ProcessRunner;
  private readonly command: string;
  private readonly sandbox: CodexSandbox;

  public constructor(options: CodexExecAdapterOptions = {}) {
    this.runner = options.runner ?? createNodeProcessRunner();
    this.command = options.command ?? "codex";
    this.sandbox = options.sandbox ?? "workspace-write";
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const result = await this.runner.run(
      this.command,
      ["exec", "--sandbox", this.sandbox, input.prompt],
      this.runnerOptions(input)
    );

    return {
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      artifacts: []
    };
  }

  private runnerOptions(input: WorkerRunInput): ProcessRunOptions {
    return input.timeoutMs === undefined ? { cwd: input.cwd } : { cwd: input.cwd, timeoutMs: input.timeoutMs };
  }
}
