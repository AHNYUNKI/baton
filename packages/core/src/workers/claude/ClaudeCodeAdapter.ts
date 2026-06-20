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
  readOnly?: boolean;
  write?: boolean;
  outputFormat?: "text" | "json";
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
  private readonly outputFormat: ClaudeCodeAdapterOptions["outputFormat"];

  public constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.runner = options.runner ?? createNodeProcessRunner();
    this.command = options.command ?? "claude";
    this.args = buildClaudeArgs(options);
    this.outputFormat = options.outputFormat;
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const startedAt = Date.now();
    let artifacts: string[] = [];
    try {
      artifacts = await this.writePromptArtifact(input);
      const result = await this.runner.run(this.command, this.args, this.runnerOptions(input));
      const parsedOutput = this.outputFormat === "json" ? parseClaudeOutput(result.stdout) : { stdout: result.stdout };
      const outputArtifacts = await this.writeOutputArtifact(input, parsedOutput.stdout);
      artifacts = [...artifacts, ...outputArtifacts];

      return {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: parsedOutput.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        artifacts,
        metadata: {
          provider: "claude",
          ...(parsedOutput.usage === undefined ? {} : { usage: parsedOutput.usage })
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
    return {
      cwd: input.cwd,
      input: input.prompt,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.onOutput === undefined ? {} : { onStdout: input.onOutput, onStderr: input.onOutput })
    };
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

function buildClaudeArgs(options: ClaudeCodeAdapterOptions): readonly string[] {
  let args = [...(options.args ?? defaultArgs)];

  if (options.outputFormat !== undefined && !hasPrintArg(args)) {
    args = ["--print", ...args];
  }

  if (options.readOnly === true) {
    args = stripDangerousPermissionArgs(args);
    args.push("--permission-mode", "plan");
  }

  if (options.write === true) {
    args = stripDangerousPermissionArgs(args);
    args.push("--permission-mode", "acceptEdits");
  }

  if (options.outputFormat !== undefined) {
    args = stripOutputFormatArgs(args);
    args.push("--output-format", options.outputFormat);
  }

  return args;
}

function hasPrintArg(args: readonly string[]): boolean {
  return args.includes("--print") || args.includes("-p");
}

function stripDangerousPermissionArgs(args: readonly string[]): string[] {
  const stripped: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--permission-mode") {
      index += 1;
      continue;
    }
    if (arg?.startsWith("--permission-mode=") === true) {
      continue;
    }
    if (arg === "--dangerously-skip-permissions" || arg === "--allow-dangerously-skip-permissions") {
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
}

function stripOutputFormatArgs(args: readonly string[]): string[] {
  const stripped: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--output-format") {
      index += 1;
      continue;
    }
    if (arg?.startsWith("--output-format=") === true) {
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
}

type ParsedClaudeOutput = {
  stdout: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

function parseClaudeOutput(stdout: string): ParsedClaudeOutput {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return { stdout };
  }

  if (!isRecord(value)) {
    return { stdout };
  }

  const resultText = typeof value.result === "string" ? value.result : stdout;
  const usage = parseClaudeUsage(value.usage) ?? parseClaudeUsage(isRecord(value.message) ? value.message.usage : undefined);
  return {
    stdout: resultText,
    ...(usage === undefined ? {} : { usage })
  };
}

function parseClaudeUsage(value: unknown): ParsedClaudeOutput["usage"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputTokens = readTokenCount(value.inputTokens) ?? sumTokenCounts(value, ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]);
  const outputTokens = readTokenCount(value.outputTokens) ?? readTokenCount(value.output_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  return { inputTokens, outputTokens };
}

function sumTokenCounts(value: Record<string, unknown>, keys: readonly string[]): number | undefined {
  let total = 0;
  let found = false;
  for (const key of keys) {
    const count = readTokenCount(value[key]);
    if (count === undefined) {
      continue;
    }
    total += count;
    found = true;
  }
  return found ? total : undefined;
}

function readTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
