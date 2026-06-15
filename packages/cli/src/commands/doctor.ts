import type { ProcessRunner } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export type ProviderCheckResult =
  | {
      available: true;
      version: string;
    }
  | {
      available: false;
      reason: "not-installed" | "error";
      message: string;
    };

export type CodexCheckResult = ProviderCheckResult;
export type ClaudeCheckResult = ProviderCheckResult;

export type CheckProviderOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export type CheckCodexOptions = CheckProviderOptions;
export type CheckClaudeOptions = CheckProviderOptions;

export async function checkCodex(runner: ProcessRunner, options: CheckCodexOptions = {}): Promise<CodexCheckResult> {
  return checkProvider("codex", runner, options);
}

export async function checkClaude(runner: ProcessRunner, options: CheckClaudeOptions = {}): Promise<ClaudeCheckResult> {
  return checkProvider("claude", runner, options);
}

export async function doctorCommand(provider: "codex" | "claude", args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] !== "doctor" || args.length !== 1) {
    context.stderr(`Usage: baton ${provider} doctor`);
    return 1;
  }

  const result = provider === "codex" ? await checkCodex(context.runner, { cwd: context.cwd }) : await checkClaude(context.runner, { cwd: context.cwd });
  const providerLabel = provider === "codex" ? "Codex" : "Claude";
  if (result.available) {
    context.stdout(`${providerLabel} available: ${result.version}`);
    return 0;
  }

  const prefix =
    result.reason === "not-installed" ? `${providerLabel} not installed or not on PATH` : `${providerLabel} command returned an error`;
  context.stderr(`${prefix}: ${result.message}`);
  return 1;
}

async function checkProvider(command: "codex" | "claude", runner: ProcessRunner, options: CheckProviderOptions = {}): Promise<ProviderCheckResult> {
  try {
    const result = await runner.run(command, ["--version"], {
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      timeoutMs: options.timeoutMs ?? 5000
    });
    if (result.exitCode === 0) {
      return {
        available: true,
        version: result.stdout.trim() || "version command succeeded"
      };
    }

    return {
      available: false,
      reason: "error",
      message: result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`
    };
  } catch (error) {
    return {
      available: false,
      reason: "not-installed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
