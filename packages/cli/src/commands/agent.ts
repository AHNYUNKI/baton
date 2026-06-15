import { loadAgentProfiles } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export async function agentCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] !== "list" || args.length !== 1) {
    context.stderr("Usage: baton agent list");
    return 1;
  }

  const agents = await loadAgentProfiles({ cwd: context.cwd });
  for (const agent of agents) {
    context.stdout(`${agent.id}\t${agent.role}\t${agent.provider}\t${agent.name}`);
  }

  return 0;
}
