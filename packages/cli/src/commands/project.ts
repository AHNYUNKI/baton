import { ProjectService, batonHome } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export async function projectCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [subcommand, projectPath] = args;
  const service = new ProjectService({ homeDir: batonHome(context.env) });

  if (subcommand === "add" && projectPath !== undefined) {
    const project = await service.add(projectPath);
    context.stdout(`Added project ${project.id}: ${project.path}`);
    return 0;
  }

  if (subcommand === "list") {
    const projects = await service.list();
    if (projects.length === 0) {
      context.stdout("No projects registered.");
      return 0;
    }

    for (const project of projects) {
      context.stdout(`${project.id}\t${project.name}\t${project.path}`);
    }
    return 0;
  }

  context.stderr("Usage: baton project add <path> | baton project list");
  return 1;
}
