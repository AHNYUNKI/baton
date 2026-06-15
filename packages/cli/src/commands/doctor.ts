import type { CommandContext, CommandResult } from "./context.js";

export async function doctorCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] !== "doctor" || args.length !== 1) {
    context.stderr("Usage: baton codex doctor");
    return 1;
  }

  try {
    const result = await context.runner.run("codex", ["--version"], { cwd: context.cwd, timeoutMs: 5000 });
    if (result.exitCode === 0) {
      context.stdout(`Codex available: ${result.stdout.trim() || "version command succeeded"}`);
      return 0;
    }

    context.stderr(`Codex unavailable: ${result.stderr.trim() || `exit code ${result.exitCode}`}`);
    return 1;
  } catch (error) {
    context.stderr(`Codex unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
