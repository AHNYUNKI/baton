import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ProcessRunner } from "../../ports/ProcessRunner.js";
import type { ProcessRunOptions, ProcessRunResult } from "../../ports/ProcessRunner.js";
import { createNodeProcessRunner } from "../../ports/ProcessRunner.js";
import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "../WorkerAdapter.js";

export type TestRunnerAdapterOptions = {
  runner?: ProcessRunner;
  command: string;
  args?: readonly string[];
  timeoutMs?: number;
};

type TestResultArtifactInput = {
  command: string;
  args: readonly string[];
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

const maxOutputCharacters = 4_000;

export class TestRunnerAdapter implements WorkerAdapter {
  private readonly runner: ProcessRunner;
  private readonly command: string;
  private readonly args: readonly string[];
  private readonly timeoutMs: number | undefined;

  public constructor(options: TestRunnerAdapterOptions) {
    this.runner = options.runner ?? createNodeProcessRunner();
    this.command = options.command;
    this.args = options.args ?? [];
    this.timeoutMs = options.timeoutMs;
  }

  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const startedAt = Date.now();

    let result: ProcessRunResult;
    try {
      result = await this.runner.run(this.command, this.args, this.runnerOptions(input));
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const stderr = errorMessage(error);
      const artifactResult = await this.writeTestResultArtifactSafe(input, {
        command: this.command,
        args: this.args,
        success: false,
        exitCode: null,
        stdout: "",
        stderr,
        durationMs
      });

      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: appendArtifactError(stderr, artifactResult.error),
        durationMs,
        artifacts: artifactResult.artifacts,
        metadata: {
          provider: "test-runner"
        }
      };
    }

    const artifactResult = await this.writeTestResultArtifactSafe(input, {
      command: this.command,
      args: this.args,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs
    });

    return {
      success: result.exitCode === 0 && artifactResult.error === undefined,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: appendArtifactError(result.stderr, artifactResult.error),
      durationMs: result.durationMs,
      artifacts: artifactResult.artifacts,
      metadata: {
        provider: "test-runner"
      }
    };
  }

  private runnerOptions(input: WorkerRunInput): ProcessRunOptions {
    const timeoutMs = input.timeoutMs ?? this.timeoutMs;
    return timeoutMs === undefined ? { cwd: input.cwd } : { cwd: input.cwd, timeoutMs };
  }

  private async writeTestResultArtifactSafe(
    input: WorkerRunInput,
    result: TestResultArtifactInput
  ): Promise<{ artifacts: string[]; error?: string }> {
    try {
      return { artifacts: await this.writeTestResultArtifact(input, result) };
    } catch (error) {
      return { artifacts: [], error: `Failed to write test_result.md: ${errorMessage(error)}` };
    }
  }

  private async writeTestResultArtifact(input: WorkerRunInput, result: TestResultArtifactInput): Promise<string[]> {
    const runDirectory = metadataString(input, "runDirectory");
    const stepType = metadataString(input, "stepType");
    if (runDirectory === undefined || stepType !== "test") {
      return [];
    }

    const artifactPath = path.join(runDirectory, "test_result.md");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(artifactPath, renderTestResult(result), "utf8");
    return [artifactPath];
  }
}

function renderTestResult(result: TestResultArtifactInput): string {
  const summary = result.success ? "PASS" : "FAIL";
  return [
    "# Test Result",
    "",
    `- Command: \`${JSON.stringify([result.command, ...result.args])}\``,
    `- Exit code: ${result.exitCode === null ? "null" : String(result.exitCode)}`,
    `- Duration: ${result.durationMs}ms`,
    `- Summary: ${summary}`,
    "",
    "## Stdout",
    "",
    codeFence(truncateOutput(result.stdout), "text"),
    "",
    "## Stderr",
    "",
    codeFence(truncateOutput(result.stderr), "text"),
    ""
  ].join("\n");
}

function truncateOutput(output: string): string {
  if (output.length <= maxOutputCharacters) {
    return output;
  }

  return `${output.slice(0, maxOutputCharacters)}\n\n[truncated ${output.length - maxOutputCharacters} character(s)]`;
}

function codeFence(content: string, language: string): string {
  const longestBacktickRun = Math.max(2, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = "`".repeat(longestBacktickRun + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}

function appendArtifactError(stderr: string, artifactError: string | undefined): string {
  if (artifactError === undefined) {
    return stderr;
  }

  return stderr.length === 0 ? artifactError : `${stderr}\n${artifactError}`;
}

function metadataString(input: WorkerRunInput, key: string): string | undefined {
  const value = input.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
