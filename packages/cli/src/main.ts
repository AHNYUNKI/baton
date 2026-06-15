#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createNodeProcessRunner } from "@baton/core";

import { agentCommand } from "./commands/agent.js";
import type { CommandContext, WriteLine } from "./commands/context.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { projectCommand } from "./commands/project.js";
import { runCommand } from "./commands/run.js";
import { workflowCommand } from "./commands/workflow.js";

export type CliOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: WriteLine;
  stderr?: WriteLine;
  runner?: CommandContext["runner"];
};

export async function runCli(argv: readonly string[], options: CliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((message: string): void => console.log(message));
  const stderr = options.stderr ?? ((message: string): void => console.error(message));
  const context: CommandContext = {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdout,
    stderr,
    runner: options.runner ?? createNodeProcessRunner()
  };

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    stdout(usage());
    return 0;
  }

  try {
    const [command, ...args] = argv;
    switch (command) {
      case "init":
        return await initCommand(args, context);
      case "project":
        return await projectCommand(args, context);
      case "agent":
        return await agentCommand(args, context);
      case "workflow":
        return await workflowCommand(args, context);
      case "run":
        return await runCommand(args, context);
      case "codex":
        return await doctorCommand(args, context);
      default:
        stderr(`Unknown command: ${command ?? ""}`);
        stderr(usage());
        return 1;
    }
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function usage(): string {
  return [
    "Usage: baton <command>",
    "",
    "Commands:",
    "  baton init",
    "  baton project add <path>",
    "  baton project list",
    "  baton agent list",
    "  baton workflow list",
    "  baton run <request> [--dry-run]",
    "  baton run status <runId>",
    "  baton run resume <runId>",
    "  baton run approve <runId> [--reject]",
    "  baton codex doctor"
  ].join("\n");
}

function isEntrypoint(): boolean {
  const currentFile = fileURLToPath(import.meta.url);
  const invokedFile = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
  return currentFile === invokedFile;
}

if (isEntrypoint()) {
  process.exitCode = await runCli(process.argv.slice(2));
}
