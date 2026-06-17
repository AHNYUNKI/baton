import { readFile } from "node:fs/promises";

import {
  ArtifactStore,
  ClaudeCodeAdapter,
  CodexExecAdapter,
  GitWorktreeManager,
  ProjectService,
  TeamRunExecutor,
  TeamRunStore,
  aggregateTeamRunUsage,
  batonHome,
  createAgentWorkerRegistry,
  createTeamRunDispatchConfig,
  generateTeamPlan,
  readTeamRunDispatchConfig,
  shouldPersistTeamRunDispatchConfig,
  writeTeamRunDispatchConfig,
  type ProcessRunner,
  type TeamRunDispatchConfig,
  type WorkerAdapter
} from "@baton/core";
import {
  ProjectSourceKindSchema,
  TeamPlanEnvelopeSchema,
  TeamPlanSchema,
  makeEnvelope,
  type AgentId,
  type ProjectSourceKind,
  type TeamPlan,
  type TeamRun,
  type TeamRunListJson,
  type TeamRunSummaryJson
} from "@baton/schemas";

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

type ParsedPlanRunStartArgs = {
  projectId: string;
  baseBranch?: string;
  codex: boolean;
  claude: boolean;
  timeoutMs?: number;
  json: boolean;
};

type ParsedPlanRunDecisionArgs = {
  teamRunId: string;
  note?: string;
  json: boolean;
};

type ParsedPlanRunShowArgs = {
  teamRunId: string;
  json: boolean;
};

type ParsedPlanRunListArgs = {
  projectId: string;
  json: boolean;
};

const defaultRealDispatchTimeoutMs = 10 * 60 * 1000;

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

  if (subcommand === "run") {
    return projectPlanRunCommand(rest, context, service);
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

async function projectPlanRunCommand(args: readonly string[], context: CommandContext, service: ProjectService): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(projectUsage());
    return 0;
  }

  const [subcommand, ...rest] = args;
  if (subcommand === "start") {
    const parsed = parsePlanRunStartArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return startTeamRun(parsed, context, service);
  }

  if (subcommand === "approve") {
    const parsed = parsePlanRunDecisionArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return decideTeamRun(parsed, "approved", context, service);
  }

  if (subcommand === "reject") {
    const parsed = parsePlanRunDecisionArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return decideTeamRun(parsed, "rejected", context, service);
  }

  if (subcommand === "show") {
    const parsed = parsePlanRunShowArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return showTeamRun(parsed, context);
  }

  if (subcommand === "list") {
    const parsed = parsePlanRunListArgs(rest);
    if (parsed === undefined) {
      context.stderr(projectUsage());
      return 1;
    }
    return listTeamRuns(parsed, context, service);
  }

  context.stderr(projectUsage());
  return 1;
}

async function startTeamRun(args: ParsedPlanRunStartArgs, context: CommandContext, service: ProjectService): Promise<CommandResult> {
  const dispatchConfig = dispatchConfigFromStartArgs(args);
  const preflight = await preflightTeamRunWorkers(dispatchConfig, context);
  if (preflight !== 0) {
    return preflight;
  }

  const { executor, artifactStore } = createTeamRunExecutor(context, service, dispatchConfig);
  const result = await executor.start(args.projectId, args.baseBranch === undefined ? {} : { baseBranch: args.baseBranch });
  if (result.outcome !== "failed" && shouldPersistTeamRunDispatchConfig(dispatchConfig)) {
    await writeTeamRunDispatchConfig(artifactStore, result.teamRun.id, dispatchConfig);
  }

  printTeamRunResult(result.teamRun, args.json, context);
  return result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
}

async function decideTeamRun(
  args: ParsedPlanRunDecisionArgs,
  decision: "approved" | "rejected",
  context: CommandContext,
  service: ProjectService
): Promise<CommandResult> {
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const dispatchConfig = decision === "approved" ? await readTeamRunDispatchConfig(artifactStore, args.teamRunId) : undefined;
  if (dispatchConfig !== undefined) {
    const preflight = await preflightTeamRunWorkers(dispatchConfig, context);
    if (preflight !== 0) {
      return preflight;
    }
  }

  const { executor } = createTeamRunExecutor(context, service, dispatchConfig);
  const result = await executor.decide(args.teamRunId, {
    decision,
    ...(args.note === undefined ? {} : { note: args.note })
  });

  printTeamRunResult(result.teamRun, args.json, context);
  return result.outcome === "failed" ? 1 : 0;
}

async function showTeamRun(args: ParsedPlanRunShowArgs, context: CommandContext): Promise<CommandResult> {
  const store = new TeamRunStore({
    artifactStore: new ArtifactStore({ workspaceRoot: context.cwd }),
    clock: context.clock
  });
  const teamRun = await store.load(args.teamRunId);

  printTeamRunResult(teamRun, args.json, context, { includeUsage: true });
  return 0;
}

async function listTeamRuns(args: ParsedPlanRunListArgs, context: CommandContext, service: ProjectService): Promise<CommandResult> {
  const project = await service.get(args.projectId);
  if (project === undefined) {
    context.stderr(`Project not found: ${args.projectId}`);
    return 1;
  }

  const store = new TeamRunStore({
    artifactStore: new ArtifactStore({ workspaceRoot: context.cwd }),
    clock: context.clock
  });
  const teamRuns = await store.list(args.projectId);
  const data: TeamRunListJson = {
    teamRuns: teamRuns.map(toTeamRunSummaryJson)
  };

  if (args.json) {
    context.stdout(JSON.stringify(makeEnvelope("team-run-list", data), null, 2));
    return 0;
  }

  if (data.teamRuns.length === 0) {
    context.stdout(`TeamRun이 없습니다: ${args.projectId}`);
    return 0;
  }

  for (const summary of data.teamRuns) {
    context.stdout(`${summary.teamRunId}\t${summary.status}\t${summary.completedRoleCount}/${summary.roleCount}\t${summary.createdAt}`);
  }
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

function dispatchConfigFromStartArgs(args: ParsedPlanRunStartArgs): TeamRunDispatchConfig {
  const timeoutMs = args.timeoutMs ?? (args.codex || args.claude ? defaultRealDispatchTimeoutMs : undefined);
  return createTeamRunDispatchConfig({
    codex: args.codex,
    claude: args.claude,
    ...(timeoutMs === undefined ? {} : { timeoutMs })
  });
}

async function preflightTeamRunWorkers(config: TeamRunDispatchConfig, context: CommandContext): Promise<CommandResult> {
  if (config.workers.codex) {
    const result = await checkCodex(context.runner, { cwd: context.cwd });
    if (!result.available) {
      const prefix = result.reason === "not-installed" ? "Codex not installed or not on PATH" : "Codex command returned an error";
      context.stderr(`${prefix}: ${result.message}`);
      return 1;
    }
  }

  if (config.workers.claude) {
    const result = await checkClaude(context.runner, { cwd: context.cwd });
    if (!result.available) {
      const prefix = result.reason === "not-installed" ? "Claude not installed or not on PATH" : "Claude command returned an error";
      context.stderr(`${prefix}: ${result.message}`);
      return 1;
    }
  }

  return 0;
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

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
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

function parsePlanRunStartArgs(args: readonly string[]): ParsedPlanRunStartArgs | undefined {
  const projectId = args[0];
  if (projectId === undefined || projectId.trim().length === 0) {
    return undefined;
  }

  let baseBranch: string | undefined;
  let codex = false;
  let claude = false;
  let timeoutMs: number | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--base") {
      baseBranch = args[index + 1];
      if (baseBranch === undefined || baseBranch.trim().length === 0) {
        return undefined;
      }
      index += 1;
      continue;
    }

    if (arg === "--codex") {
      codex = true;
      continue;
    }

    if (arg === "--claude") {
      claude = true;
      continue;
    }

    if (arg === "--timeout-ms") {
      timeoutMs = parsePositiveInteger(args[index + 1]);
      if (timeoutMs === undefined) {
        return undefined;
      }
      index += 1;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    return undefined;
  }

  return {
    projectId,
    codex,
    claude,
    json,
    ...(baseBranch === undefined ? {} : { baseBranch }),
    ...(timeoutMs === undefined ? {} : { timeoutMs })
  };
}

function parsePlanRunDecisionArgs(args: readonly string[]): ParsedPlanRunDecisionArgs | undefined {
  const teamRunId = args[0];
  if (teamRunId === undefined || teamRunId.trim().length === 0) {
    return undefined;
  }

  let note: string | undefined;
  let json = false;
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--note") {
      note = args[index + 1];
      if (note === undefined || note.trim().length === 0) {
        return undefined;
      }
      index += 1;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    return undefined;
  }

  return {
    teamRunId,
    json,
    ...(note === undefined ? {} : { note })
  };
}

function parsePlanRunShowArgs(args: readonly string[]): ParsedPlanRunShowArgs | undefined {
  const teamRunId = args[0];
  if (teamRunId === undefined || teamRunId.trim().length === 0) {
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

  return { teamRunId, json };
}

function parsePlanRunListArgs(args: readonly string[]): ParsedPlanRunListArgs | undefined {
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

function createTeamRunExecutor(
  context: CommandContext,
  projectService: ProjectService,
  dispatchConfig?: TeamRunDispatchConfig
): { executor: TeamRunExecutor; artifactStore: ArtifactStore } {
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const { registry } = createAgentWorkerRegistry({
    codex: dispatchConfig?.workers.codex === true,
    claude: dispatchConfig?.workers.claude === true,
    runner: context.runner
  });

  return {
    artifactStore,
    executor: new TeamRunExecutor({
      projectService,
      teamRunStore: new TeamRunStore({ artifactStore, clock: context.clock }),
      artifactStore,
      worktreeManager: new GitWorktreeManager({ runner: context.runner, repoRoot: context.cwd }),
      agentWorkerRegistry: registry,
      clock: context.clock,
      ...(dispatchConfig?.timeoutMs === undefined ? {} : { timeoutMs: dispatchConfig.timeoutMs })
    })
  };
}

function printTeamRunResult(teamRun: TeamRun, json: boolean, context: CommandContext, options: { includeUsage?: boolean } = {}): void {
  if (json) {
    context.stdout(JSON.stringify(makeEnvelope("team-run", teamRun), null, 2));
    return;
  }

  context.stdout(`TeamRun ${teamRun.id} ${teamRun.status}`);
  context.stdout(`Project: ${teamRun.projectId}`);
  if (teamRun.baseBranch !== undefined) {
    context.stdout(`Base: ${teamRun.baseBranch}`);
  }
  if (teamRun.worktreePath !== undefined) {
    context.stdout(`Worktree: ${teamRun.worktreePath}`);
  }
  for (const role of teamRun.roles) {
    context.stdout(`- ${role.roleId}: ${role.name} (${role.status})${role.reason === undefined ? "" : ` - ${role.reason}`}`);
  }
  if (options.includeUsage === true) {
    printTeamRunUsage(teamRun, context);
  }
  if (teamRun.status === "awaiting-approval") {
    context.stdout(`승인 대기: baton project plan run approve ${teamRun.id}`);
  }
}

function printTeamRunUsage(teamRun: TeamRun, context: CommandContext): void {
  const usage = aggregateTeamRunUsage(teamRun);
  const rows = Object.entries(usage.byPlatform).sort(([left], [right]) => left.localeCompare(right));
  const roleCount = rows.reduce((sum, [, platform]) => sum + platform.roles, 0);

  context.stdout("토큰 사용량(추정/실측)");
  context.stdout("플랫폼\t입력\t출력\t합계\t역할수");
  for (const [platform, platformUsage] of rows) {
    context.stdout(
      `${platform}\t${platformUsage.inputTokens}\t${platformUsage.outputTokens}\t${platformUsage.totalTokens}\t${platformUsage.roles}`
    );
  }
  context.stdout(`총합\t${usage.total.inputTokens}\t${usage.total.outputTokens}\t${usage.total.totalTokens}\t${roleCount}`);
  if (usage.anyEstimated) {
    context.stdout("※ 추정치 포함(실측 디스패치 시 정확)");
  }
}

function toTeamRunSummaryJson(teamRun: TeamRun): TeamRunSummaryJson {
  return {
    teamRunId: teamRun.id,
    projectId: teamRun.projectId,
    status: teamRun.status,
    createdAt: teamRun.createdAt,
    ...(teamRun.updatedAt === undefined ? {} : { updatedAt: teamRun.updatedAt }),
    roleCount: teamRun.roles.length,
    completedRoleCount: teamRun.roles.filter((role) => role.status === "completed").length
  };
}

function projectUsage(): string {
  return [
    "Usage:",
    "  baton project create --name <name> --source-kind <local|github> --source <value> --agent <id> [--agent <id> ...] [--lead <id>]",
    "  baton project add <path>",
    "  baton project list [--json]",
    "  baton project plan generate <projectId> --overview <text>",
    "  baton project plan show <projectId> [--json]",
    "  baton project plan set <projectId> [--file <path>]",
    "  baton project plan run start <projectId> [--base <branch>] [--codex] [--claude] [--timeout-ms <ms>] [--json]",
    "  baton project plan run approve <teamRunId> [--note <text>] [--json]",
    "  baton project plan run reject <teamRunId> [--note <text>] [--json]",
    "  baton project plan run show <teamRunId> [--json]",
    "  baton project plan run list <projectId> [--json]"
  ].join("\n");
}
