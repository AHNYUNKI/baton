import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProcessRunner } from "../../ports/ProcessRunner.js";
import type { ProcessRunOptions } from "../../ports/ProcessRunner.js";
import { createNodeProcessRunner } from "../../ports/ProcessRunner.js";
import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "../WorkerAdapter.js";

export type CodexSandbox = "workspace-write" | "read-only";

export type CodexExecAdapterOptions = {
  runner?: ProcessRunner;
  command?: string;
  args?: readonly string[];
  sandbox?: CodexSandbox;
};

export class CodexExecAdapter implements WorkerAdapter {
  private readonly runner: ProcessRunner;
  private readonly command: string;
  private readonly args: readonly string[] | undefined;
  private readonly sandbox: CodexSandbox;

  public constructor(options: CodexExecAdapterOptions = {}) {
    this.runner = options.runner ?? createNodeProcessRunner();
    this.command = options.command ?? "codex";
    this.args = options.args;
    this.sandbox = options.sandbox ?? "workspace-write";
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const startedAt = Date.now();
    let artifacts: string[] = [];
    try {
      artifacts = await this.writePromptArtifact(input);
      const result = await this.runner.run(
        this.command,
        this.args ?? ["exec", "--sandbox", this.sandbox],
        this.runnerOptions(input)
      );

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        artifacts
      };
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        artifacts
      };
    }
  }

  private runnerOptions(input: WorkerRunInput): ProcessRunOptions {
    return input.timeoutMs === undefined
      ? { cwd: input.cwd, input: input.prompt }
      : { cwd: input.cwd, input: input.prompt, timeoutMs: input.timeoutMs };
  }

  private async writePromptArtifact(input: WorkerRunInput): Promise<string[]> {
    const runDirectory = typeof input.metadata?.runDirectory === "string" ? input.metadata.runDirectory : undefined;
    const stepId = typeof input.metadata?.stepId === "string" ? input.metadata.stepId : undefined;
    if (runDirectory === undefined || stepId === undefined) {
      return [];
    }

    const stepsDirectory = path.join(runDirectory, "steps");
    const promptPath = path.join(stepsDirectory, `${stepId}.prompt.md`);
    await mkdir(stepsDirectory, { recursive: true });
    await writeFile(promptPath, input.prompt, "utf8");
    return [promptPath];
  }
}
