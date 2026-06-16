import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { WorkflowStepType } from "@baton/schemas";

import type { ProcessRunner } from "../../ports/ProcessRunner.js";
import type { ProcessRunOptions } from "../../ports/ProcessRunner.js";
import { createNodeProcessRunner } from "../../ports/ProcessRunner.js";
import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "../WorkerAdapter.js";

export type ClaudeCodeAdapterOptions = {
  runner?: ProcessRunner;
  command?: string;
  args?: readonly string[];
};

const defaultArgs = ["--print"] as const;

const outputArtifactByStepType: Partial<Record<WorkflowStepType, string>> = {
  analyze: "analysis.md",
  design: "design.md",
  review: "review.md"
};

export class ClaudeCodeAdapter implements WorkerAdapter {
  private readonly runner: ProcessRunner;
  private readonly command: string;
  private readonly args: readonly string[];

  public constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.runner = options.runner ?? createNodeProcessRunner();
    this.command = options.command ?? "claude";
    this.args = options.args ?? defaultArgs;
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const startedAt = Date.now();
    let artifacts: string[] = [];
    try {
      artifacts = await this.writePromptArtifact(input);
      const result = await this.runner.run(this.command, this.args, this.runnerOptions(input));
      const outputArtifacts = await this.writeOutputArtifact(input, result.stdout);
      artifacts = [...artifacts, ...outputArtifacts];

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        artifacts,
        metadata: {
          provider: "claude"
        }
      };
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        artifacts,
        metadata: {
          provider: "claude"
        }
      };
    }
  }

  private runnerOptions(input: WorkerRunInput): ProcessRunOptions {
    return input.timeoutMs === undefined
      ? { cwd: input.cwd, input: input.prompt }
      : { cwd: input.cwd, input: input.prompt, timeoutMs: input.timeoutMs };
  }

  private async writePromptArtifact(input: WorkerRunInput): Promise<string[]> {
    const runDirectory = metadataString(input, "runDirectory");
    const stepId = metadataString(input, "stepId");
    if (runDirectory === undefined || stepId === undefined) {
      return [];
    }

    const stepsDirectory = path.join(runDirectory, "steps");
    const promptPath = path.join(stepsDirectory, `${stepId}.prompt.md`);
    await mkdir(stepsDirectory, { recursive: true });
    await writeFile(promptPath, input.prompt, "utf8");
    return [promptPath];
  }

  private async writeOutputArtifact(input: WorkerRunInput, stdout: string): Promise<string[]> {
    const runDirectory = metadataString(input, "runDirectory");
    const stepType = metadataString(input, "stepType");
    if (runDirectory === undefined || stepType === undefined) {
      return [];
    }

    const artifactName = outputArtifactByStepType[stepType as WorkflowStepType];
    if (artifactName === undefined) {
      return [];
    }

    const artifactPath = path.join(runDirectory, artifactName);
    await mkdir(runDirectory, { recursive: true });
    await writeFile(artifactPath, stdout, "utf8");
    return [artifactPath];
  }
}

function metadataString(input: WorkerRunInput, key: string): string | undefined {
  const value = input.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}
