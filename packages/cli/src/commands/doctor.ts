import type { ProcessRunner } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export type CodexCheckResult =
  | {
      available: true;
      version: string;
    }
  | {
      available: false;
      reason: "not-installed" | "error";
      message: string;
    };

export type CheckCodexOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export async function checkCodex(runner: ProcessRunner, options: CheckCodexOptions = {}): Promise<CodexCheckResult> {
  try {
    const result = await runner.run("codex", ["--version"], {
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

export async function doctorCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] !== "doctor" || args.length !== 1) {
    context.stderr("Usage: baton codex doctor");
    return 1;
  }

  const result = await checkCodex(context.runner, { cwd: context.cwd });
  if (result.available) {
    context.stdout(`Codex available: ${result.version}`);
    return 0;
  }

  const prefix = result.reason === "not-installed" ? "Codex not installed or not on PATH" : "Codex command returned an error";
  context.stderr(`${prefix}: ${result.message}`);
  return 1;
}
