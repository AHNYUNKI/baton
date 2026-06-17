import { ProjectService, batonHome } from "@baton/core";
import { ProjectSourceKindSchema, makeEnvelope, type ProjectSourceKind } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";

export async function projectCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(projectUsage());
    return 0;
  }

  const [subcommand, ...rest] = args;
  const service = new ProjectService({ homeDir: batonHome(context.env) });

  if (subcommand === "create") {
    if (rest.includes("--help") || rest.includes("-h")) {
      context.stdout(projectUsage());
      return 0;
    }

    const parsed = parseProjectCreateArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }

    const project = await service.create(parsed);
    context.stdout(`Created project ${project.id}: ${project.name}`);
    return 0;
  }

  if (subcommand === "add" && rest.length === 1) {
    const projectPath = rest[0] ?? "";
    const project = await service.add(projectPath);
    context.stdout(`Added project ${project.id}: ${project.source.value}`);
    return 0;
  }

  if (subcommand === "list") {
    if (rest.includes("--help") || rest.includes("-h")) {
      context.stdout(projectUsage());
      return 0;
    }

    const parsed = parseProjectListArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }

    const projects = await service.list();
    if (parsed.json) {
      context.stdout(JSON.stringify(makeEnvelope("project-list", projects), null, 2));
      return 0;
    }

    if (projects.length === 0) {
      context.stdout("No projects registered.");
      return 0;
    }

    for (const project of projects) {
      context.stdout(`${project.id}\t${project.name}\t${project.source.kind}\t${project.source.value}\t${project.leadAgentId ?? "-"}`);
    }
    return 0;
  }

  context.stderr(projectUsage());
  return 1;
}

type ParsedProjectCreateArgs = {
  name: string;
  source: {
    kind: ProjectSourceKind;
    value: string;
  };
  agentIds: string[];
  leadAgentId?: string;
};

type ParsedProjectListArgs = {
  json: boolean;
};

function parseProjectCreateArgs(args: readonly string[]): ParsedProjectCreateArgs | undefined {
  let name: string | undefined;
  let sourceKind: ProjectSourceKind | undefined;
  let source: string | undefined;
  const agentIds: string[] = [];
  let leadAgentId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--name") {
      name = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--source-kind") {
      const parsed = ProjectSourceKindSchema.safeParse(args[index + 1]);
      if (!parsed.success) {
        return undefined;
      }
      sourceKind = parsed.data;
      index += 1;
      continue;
    }

    if (arg === "--source") {
      source = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--agent") {
      const agentId = args[index + 1];
      if (agentId === undefined || agentId.trim().length === 0) {
        return undefined;
      }
      agentIds.push(agentId);
      index += 1;
      continue;
    }

    if (arg === "--lead") {
      const lead = args[index + 1];
      if (lead === undefined || lead.trim().length === 0) {
        return undefined;
      }
      leadAgentId = lead;
      index += 1;
      continue;
    }

    return undefined;
  }

  if (name === undefined || name.trim().length === 0 || sourceKind === undefined || source === undefined || source.trim().length === 0 || leadAgentId === "") {
    return undefined;
  }

  return {
    name,
    source: {
      kind: sourceKind,
      value: source
    },
    agentIds,
    ...(leadAgentId === undefined ? {} : { leadAgentId })
  };
}

function parseProjectListArgs(args: readonly string[]): ParsedProjectListArgs | undefined {
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    return undefined;
  }

  return { json };
}

function projectUsage(): string {
  return [
    "Usage:",
    "  baton project create --name <name> --source-kind <local|github> --source <value> --agent <id> [--agent <id> ...] [--lead <id>]",
    "  baton project add <path>",
    "  baton project list [--json]"
  ].join("\n");
}
