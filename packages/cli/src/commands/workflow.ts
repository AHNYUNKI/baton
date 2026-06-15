import { loadWorkflows } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export async function workflowCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] !== "list" || args.length !== 1) {
    context.stderr("Usage: baton workflow list");
    return 1;
  }

  const workflows = await loadWorkflows({ cwd: context.cwd });
  for (const workflow of workflows) {
    context.stdout(`${workflow.id}\t${workflow.name}\t${workflow.steps.length} steps`);
  }

  return 0;
}
