import { readFile } from "node:fs/promises";

import { ClaudeCodeAdapter, CodexExecAdapter, ProjectService, batonHome, generateTeamPlan, type ProcessRunner, type WorkerAdapter } from "@baton/core";
import { ProjectSourceKindSchema, TeamPlanEnvelopeSchema, TeamPlanSchema, makeEnvelope, type AgentId, type ProjectSourceKind, type TeamPlan } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";
import { checkClaude, checkCodex } from "./doctor.js";

export async function projectCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(projectUsage());
    return 0;
  }

  const [subcommand, ...rest] = args;
  const service = new ProjectService({ homeDir: batonHome(context.env), clock: context.clock });

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

  if (subcommand === "plan") {
    return projectPlanCommand(rest, context, service);
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

type ParsedPlanGenerateArgs = {
  projectId: string;
  overview: string;
};

type ParsedPlanShowArgs = {
  projectId: string;
  json: boolean;
};

type ParsedPlanSetArgs = {
  projectId: string;
  file?: string;
};

async function projectPlanCommand(args: readonly string[], context: CommandContext, service: ProjectService): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(projectUsage());
    return 0;
  }

  const [subcommand, ...rest] = args;
  if (subcommand === "generate") {
    const parsed = parsePlanGenerateArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return generatePlan(parsed, context, service);
  }

  if (subcommand === "show") {
    const parsed = parsePlanShowArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return showPlan(parsed, context, service);
  }

  if (subcommand === "set") {
    const parsed = parsePlanSetArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return setPlan(parsed, context, service);
  }

  context.stderr(projectUsage());
  return 1;
}

async function generatePlan(args: ParsedPlanGenerateArgs, context: CommandContext, service: ProjectService): Promise<CommandResult> {
  const project = await service.get(args.projectId);
  if (project === undefined) {
    context.stderr(`Project not found: ${args.projectId}`);
    return 1;
  }

  const leadAgentId = project.leadAgentId ?? project.agentIds[0];
  if (leadAgentId === undefined) {
    context.stderr(`Project ${project.id} has no lead AI configured.`);
    return 1;
  }

  const preflight = await checkLead(leadAgentId, context.runner, context.cwd);
  if (!preflight.available) {
    context.stderr(`Lead AI ${leadAgentId} is not available: ${preflight.message}`);
    return 1;
  }

  const leadAdapter = createLeadAdapter(leadAgentId, context.runner);
  const plan = await generateTeamPlan({
    project,
    overview: args.overview,
    leadAdapter
  });
  const savedProject = await service.setTeamPlan(project.id, plan, { overview: args.overview });
  context.stdout(JSON.stringify(makeEnvelope("team-plan", savedProject.teamPlan ?? plan), null, 2));
  return 0;
}

async function showPlan(args: ParsedPlanShowArgs, context: CommandContext, service: ProjectService): Promise<CommandResult> {
  const plan = await service.getTeamPlan(args.projectId);
  if (plan === undefined) {
    context.stderr(`TeamPlan not found for project: ${args.projectId}`);
    return 1;
  }

  if (args.json) {
    context.stdout(JSON.stringify(makeEnvelope("team-plan", plan), null, 2));
    return 0;
  }

  for (const role of plan.roles) {
    context.stdout(`${role.id}\t${role.name}\t${role.assignedAgentId}`);
  }
  return 0;
}

async function setPlan(args: ParsedPlanSetArgs, context: CommandContext, service: ProjectService): Promise<CommandResult> {
  const content = args.file === undefined ? await readStdin(context) : await readFile(args.file, "utf8");
  const plan = parsePlanInput(content);
  const savedProject = await service.setTeamPlan(args.projectId, plan);
  if (savedProject.teamPlan === undefined) {
    throw new Error(`TeamPlan was not stored for project: ${args.projectId}`);
  }
  context.stdout(JSON.stringify(makeEnvelope("team-plan", savedProject.teamPlan), null, 2));
  return 0;
}

async function readStdin(context: CommandContext): Promise<string> {
  if (context.readStdin === undefined) {
    throw new Error("stdin is not available in this command context.");
  }
  return context.readStdin();
}

function parsePlanInput(content: string): TeamPlan {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid TeamPlan JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const envelope = TeamPlanEnvelopeSchema.safeParse(value);
  const planValue = envelope.success ? envelope.data.data : value;
  const parsed = TeamPlanSchema.safeParse(planValue);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".") || "teamPlan"}: ${issue.message}`).join("; ");
    throw new Error(`Invalid TeamPlan: ${details}`);
  }
  return parsed.data;
}

async function checkLead(agentId: AgentId, runner: ProcessRunner, cwd: string): Promise<{ available: true } | { available: false; message: string }> {
  const result = agentId === "codex" ? await checkCodex(runner, { cwd }) : await checkClaude(runner, { cwd });
  return result.available ? { available: true } : { available: false, message: result.message };
}

function createLeadAdapter(agentId: AgentId, runner: ProcessRunner): WorkerAdapter {
  return agentId === "codex" ? new CodexExecAdapter({ runner, sandbox: "read-only" }) : new ClaudeCodeAdapter({ runner });
}

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

function parsePlanGenerateArgs(args: readonly string[]): ParsedPlanGenerateArgs | undefined {
  const projectId = args[0];
  let overview: string | undefined;
  if (projectId === undefined || projectId.trim().length === 0) {
    return undefined;
  }

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--overview") {
      overview = args[index + 1];
      index += 1;
      continue;
    }
    return undefined;
  }

  if (overview === undefined || overview.trim().length === 0) {
    return undefined;
  }
  return { projectId, overview: overview.trim() };
}

function parsePlanShowArgs(args: readonly string[]): ParsedPlanShowArgs | undefined {
  const projectId = args[0];
  if (projectId === undefined || projectId.trim().length === 0) {
    return undefined;
  }

  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    return undefined;
  }

  return { projectId, json };
}

function parsePlanSetArgs(args: readonly string[]): ParsedPlanSetArgs | undefined {
  const projectId = args[0];
  if (projectId === undefined || projectId.trim().length === 0) {
    return undefined;
  }

  let file: string | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file") {
      file = args[index + 1];
      if (file === undefined || file.trim().length === 0) {
        return undefined;
      }
      index += 1;
      continue;
    }
    return undefined;
  }

  return file === undefined ? { projectId } : { projectId, file };
}

function projectUsage(): string {
  return [
    "Usage:",
    "  baton project create --name <name> --source-kind <local|github> --source <value> --agent <id> [--agent <id> ...] [--lead <id>]",
    "  baton project add <path>",
    "  baton project list [--json]",
    "  baton project plan generate <projectId> --overview <text>",
    "  baton project plan show <projectId> [--json]",
    "  baton project plan set <projectId> [--file <path>]"
  ].join("\n");
}
