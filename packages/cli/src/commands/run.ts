import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  ApprovalPolicy,
  ArtifactStore,
  FixPolicy,
  GitWorktreeManager,
  RunExecutor,
  RunService,
  RunStore,
  listRuns,
  summarizeRuns,
  workspaceDir,
  loadWorkflows,
  maxFixAttemptsLimit
} from "@baton/core";
import { RunStatusSchema, type Run, type RunStatus, type Workflow } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";
import { checkClaude, checkCodex } from "./doctor.js";
import { maybeExportJournal, type JournalWorkers } from "./journal.js";
import { createDefaultWorkerRegistry, createWorkerRegistry } from "../registry.js";
import type { WorkerCommand, WorkerRegistryResult } from "../registry.js";

export async function runCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    context.stderr(runUsage());
    return 1;
  }

  if (args[0] === "--help" || args[0] === "-h") {
    context.stdout(runUsage());
    return 0;
  }

  const [first, ...rest] = args;
  switch (first) {
    case "list":
      return runListCommand(rest, context);
    case "show":
      return runShowCommand(rest, context);
    case "status":
      return statusCommand(rest, context);
    case "resume":
      return resumeCommand(rest, context);
    case "approve":
      return approveCommand(rest, context);
    case "clean":
      return cleanCommand(rest, context);
    default:
      return executeCommand(args, context);
  }
}

async function executeCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const parsed = parseExecuteArgs(args);
  if (parsed === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const workflows = await loadWorkflows({ cwd: context.cwd });
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runService = new RunService({ artifactStore, workflows, clock: context.clock });

  if (parsed.dryRun) {
    const result = await runService.createRun(parsed.request, {
      dryRun: true,
      ...(parsed.workflowId === undefined ? {} : { workflowId: parsed.workflowId }),
      ...(parsed.projectId === undefined ? {} : { projectId: parsed.projectId })
    });
    printRun(context, result.run);
    for (const step of result.plannedSteps) {
      context.stdout(`- ${step.id}: ${step.type} (${step.status})`);
    }
    await maybeExportJournal(context, result.run, artifactStore.getRunDir(result.run.id), {
      workflows,
      workers: workerKindsForRegistry(createDefaultWorkerRegistry())
    });
    return 0;
  }

  if (parsed.useCodex) {
    const preflight = await preflightCodex(context);
    if (preflight !== 0) {
      return preflight;
    }
  }

  if (parsed.useClaude) {
    const preflight = await preflightClaude(context);
    if (preflight !== 0) {
      return preflight;
    }
  }

  const workerSelection = await resolveWorkerSelection(context, parsed);
  const executorSelection = withFixSelection(workerSelection, parsed);
  const { executor, workers } = createExecutor(context, artifactStore, runService, workflows, executorSelection);
  warnRegistry(context, executorSelection);
  const result = await executor.start(parsed.request, {
    ...(parsed.workflowId === undefined ? {} : { workflowId: parsed.workflowId }),
    ...(parsed.projectId === undefined ? {} : { projectId: parsed.projectId })
  });

  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  const exitCode = result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
  await maybeExportJournal(context, result.run, artifactStore.getRunDir(result.run.id), { workflows, workers });
  return exitCode;
}

async function runListCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const parsed = parseRunListArgs(args);
  if (parsed === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const result = await listRuns({
    cwd: context.cwd,
    ...(parsed.status === undefined ? {} : { status: parsed.status }),
    ...(parsed.limit === undefined ? {} : { limit: parsed.limit })
  });

  if (parsed.json) {
    context.stdout(JSON.stringify(result.runs.map((loadedRun) => toRunListJson(loadedRun.run)), null, 2));
    printSkipped(context.stderr, result.skipped);
    return 0;
  }

  if (result.runs.length === 0) {
    context.stdout("No runs found.");
    printSkipped(context.stdout, result.skipped);
    return 0;
  }

  context.stdout(
    formatTable(
      ["Run ID", "Status", "Workflow", "Created At", "Steps", "Outcome"],
      result.runs.map((loadedRun) => {
        const run = loadedRun.run;
        return [run.id, run.status, run.workflowId, run.createdAt, String(run.steps.length), runOutcome(run) ?? "-"];
      })
    )
  );
  context.stdout(formatRunSummary(summarizeRuns(result.runs)));
  printSkipped(context.stdout, result.skipped);
  return 0;
}

async function runShowCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runStore = new RunStore({ artifactStore });
  const run = await runStore.load(args[0]);
  const artifactFiles = await listArtifactFiles(artifactStore.getRunDir(run.id));

  printRunDetails(context, run, artifactFiles);
  return 0;
}

async function statusCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const runStore = new RunStore({ artifactStore: new ArtifactStore({ workspaceRoot: context.cwd }) });
  const run = await runStore.load(args[0]);

  printRun(context, run);
  printSteps(context, run);
  printOutcomeHint(context, run);
  return 0;
}

async function resumeCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const parsed = parseRunIdWithWorkers(args);
  if (parsed === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  if (parsed.useCodex) {
    const preflight = await preflightCodex(context);
    if (preflight !== 0) {
      return preflight;
    }
  }

  if (parsed.useClaude) {
    const preflight = await preflightClaude(context);
    if (preflight !== 0) {
      return preflight;
    }
  }

  const workerSelection = await resolveWorkerSelection(context, parsed);
  const executorSelection = withFixSelection(workerSelection, parsed);
  const { artifactStore, executor, workflows, workers } = await createExecutorFromContext(context, executorSelection);
  warnRegistry(context, executorSelection);
  const result = await executor.resume(parsed.runId);

  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  const exitCode = result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
  await maybeExportJournal(context, result.run, artifactStore.getRunDir(result.run.id), { workflows, workers });
  return exitCode;
}

async function approveCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const parsed = parseApproveArgs(args);
  if (parsed === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  if (!parsed.reject) {
    if (parsed.useCodex) {
      const preflight = await preflightCodex(context);
      if (preflight !== 0) {
        return preflight;
      }
    }

    if (parsed.useClaude) {
      const preflight = await preflightClaude(context);
      if (preflight !== 0) {
        return preflight;
      }
    }
  }

  const workerSelection = await resolveWorkerSelection(context, parsed);
  const executorSelection = withFixSelection(workerSelection, parsed);
  const { artifactStore, executor, workflows, workers } = await createExecutorFromContext(context, executorSelection);
  const decided = await executor.decide(parsed.runId, {
    decision: parsed.reject ? "rejected" : "approved",
    ...(parsed.note === undefined ? {} : { note: parsed.note })
  });

  if (parsed.reject) {
    printRun(context, decided);
    printSteps(context, decided);
    await maybeExportJournal(context, decided, artifactStore.getRunDir(decided.id), { workflows, workers });
    return 0;
  }

  warnRegistry(context, executorSelection);
  const result = await executor.resume(parsed.runId);
  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  const exitCode = result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
  await maybeExportJournal(context, result.run, artifactStore.getRunDir(result.run.id), { workflows, workers });
  return exitCode;
}

async function cleanCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runStore = new RunStore({ artifactStore, clock: context.clock });
  const run = await runStore.load(args[0]);
  if (!isTerminalRun(run)) {
    context.stderr(`Cannot clean run ${run.id} while status is ${run.status}.`);
    return 1;
  }

  if (run.cleanedAt !== undefined) {
    context.stdout(`Run ${run.id} already cleaned at ${run.cleanedAt}.`);
    await maybeExportJournal(context, run, artifactStore.getRunDir(run.id));
    return 0;
  }

  if (run.worktreePath === undefined) {
    const cleaned = await runStore.markCleaned(run.id);
    context.stdout(`Run ${cleaned.id} has no worktree to clean.`);
    await maybeExportJournal(context, cleaned, artifactStore.getRunDir(cleaned.id));
    return 0;
  }

  if (path.resolve(run.worktreePath) === path.resolve(context.cwd)) {
    context.stderr(`Refusing to clean repository root for run ${run.id}.`);
    return 1;
  }

  const worktreeManager = new GitWorktreeManager({ runner: context.runner, repoRoot: context.cwd });
  const result = await worktreeManager.removeWorktree(run.worktreePath);
  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || `exit code ${result.exitCode}`;
    context.stderr(`Failed to remove worktree for run ${run.id}: ${message}`);
    return 1;
  }

  const cleaned = await runStore.markCleaned(run.id);
  context.stdout(`Cleaned worktree for run ${cleaned.id}: ${run.worktreePath}`);
  await maybeExportJournal(context, cleaned, artifactStore.getRunDir(cleaned.id));
  return 0;
}

type ParsedExecuteArgs = {
  request: string;
  dryRun: boolean;
  useCodex: boolean;
  useClaude: boolean;
  useTest: boolean;
  fixEnabled: boolean;
  testCommandFlag?: string;
  maxFixAttempts?: number;
  workflowId?: string;
  projectId?: string;
};

type ParsedRunListArgs = {
  json: boolean;
  status?: RunStatus;
  limit?: number;
};

type RunListJson = {
  runId: string;
  status: RunStatus;
  dryRun: boolean;
  workflowId: string;
  createdAt: string;
  updatedAt?: string;
  stepCount: number;
  outcome?: RunStatus;
};

function parseRunListArgs(args: readonly string[]): ParsedRunListArgs | undefined {
  let json = false;
  let status: RunStatus | undefined;
  let limit: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--status") {
      const value = args[index + 1];
      const parsed = RunStatusSchema.safeParse(value);
      if (!parsed.success) {
        return undefined;
      }
      status = parsed.data;
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const value = args[index + 1];
      if (value === undefined || !/^[1-9]\d*$/u.test(value)) {
        return undefined;
      }
      const parsedLimit = Number(value);
      if (!Number.isSafeInteger(parsedLimit)) {
        return undefined;
      }
      limit = parsedLimit;
      index += 1;
      continue;
    }

    return undefined;
  }

  return {
    json,
    ...(status === undefined ? {} : { status }),
    ...(limit === undefined ? {} : { limit })
  };
}

function parseExecuteArgs(args: readonly string[]): ParsedExecuteArgs | undefined {
  const requestParts: string[] = [];
  let dryRun = false;
  let useCodex = false;
  let useClaude = false;
  let useTest = false;
  let fixEnabled = false;
  let testCommandFlag: string | undefined;
  let maxFixAttempts: number | undefined;
  let workflowId: string | undefined;
  let projectId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--codex") {
      useCodex = true;
      continue;
    }

    if (arg === "--claude") {
      useClaude = true;
      continue;
    }

    if (arg === "--test") {
      useTest = true;
      continue;
    }

    if (arg === "--fix") {
      fixEnabled = true;
      continue;
    }

    if (arg === "--max-fix-attempts") {
      const parsed = parseMaxFixAttempts(args[index + 1]);
      if (parsed === undefined) {
        return undefined;
      }
      maxFixAttempts = parsed;
      index += 1;
      continue;
    }

    if (arg === "--test-command") {
      const value = args[index + 1];
      if (value === undefined || value.length === 0) {
        return undefined;
      }
      testCommandFlag = value;
      index += 1;
      continue;
    }

    if (arg === "--workflow") {
      workflowId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project") {
      projectId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--") === true) {
      return undefined;
    }

    if (arg !== undefined) {
      requestParts.push(arg);
    }
  }

  const request = requestParts.join(" ").trim();
  if (request.length === 0 || workflowId === "" || projectId === "" || (testCommandFlag !== undefined && !useTest)) {
    return undefined;
  }

  return {
    request,
    dryRun,
    useCodex,
    useClaude,
    useTest,
    fixEnabled,
    ...(testCommandFlag === undefined ? {} : { testCommandFlag }),
    ...(maxFixAttempts === undefined ? {} : { maxFixAttempts }),
    ...(workflowId === undefined ? {} : { workflowId }),
    ...(projectId === undefined ? {} : { projectId })
  };
}

type ParsedApproveArgs = {
  runId: string;
  reject: boolean;
  useCodex: boolean;
  useClaude: boolean;
  useTest: boolean;
  fixEnabled: boolean;
  testCommandFlag?: string;
  maxFixAttempts?: number;
  note?: string;
};

function parseApproveArgs(args: readonly string[]): ParsedApproveArgs | undefined {
  let reject = false;
  let useCodex = false;
  let useClaude = false;
  let useTest = false;
  let fixEnabled = false;
  let testCommandFlag: string | undefined;
  let maxFixAttempts: number | undefined;
  let note: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--reject") {
      reject = true;
      continue;
    }

    if (arg === "--codex") {
      useCodex = true;
      continue;
    }

    if (arg === "--claude") {
      useClaude = true;
      continue;
    }

    if (arg === "--test") {
      useTest = true;
      continue;
    }

    if (arg === "--fix") {
      fixEnabled = true;
      continue;
    }

    if (arg === "--max-fix-attempts") {
      const parsed = parseMaxFixAttempts(args[index + 1]);
      if (parsed === undefined) {
        return undefined;
      }
      maxFixAttempts = parsed;
      index += 1;
      continue;
    }

    if (arg === "--test-command") {
      const value = args[index + 1];
      if (value === undefined || value.length === 0) {
        return undefined;
      }
      testCommandFlag = value;
      index += 1;
      continue;
    }

    if (arg === "--note") {
      note = args[index + 1];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--") === true) {
      return undefined;
    }

    if (arg !== undefined) {
      positional.push(arg);
    }
  }

  if (positional.length !== 1 || positional[0] === undefined || note === "" || (testCommandFlag !== undefined && !useTest)) {
    return undefined;
  }

  return {
    runId: positional[0],
    reject,
    useCodex,
    useClaude,
    useTest,
    fixEnabled,
    ...(testCommandFlag === undefined ? {} : { testCommandFlag }),
    ...(maxFixAttempts === undefined ? {} : { maxFixAttempts }),
    ...(note === undefined ? {} : { note })
  };
}

type ParsedRunIdWithWorkers = {
  runId: string;
  useCodex: boolean;
  useClaude: boolean;
  useTest: boolean;
  fixEnabled: boolean;
  testCommandFlag?: string;
  maxFixAttempts?: number;
};

function parseRunIdWithWorkers(args: readonly string[]): ParsedRunIdWithWorkers | undefined {
  let useCodex = false;
  let useClaude = false;
  let useTest = false;
  let fixEnabled = false;
  let testCommandFlag: string | undefined;
  let maxFixAttempts: number | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--codex") {
      useCodex = true;
      continue;
    }

    if (arg === "--claude") {
      useClaude = true;
      continue;
    }

    if (arg === "--test") {
      useTest = true;
      continue;
    }

    if (arg === "--fix") {
      fixEnabled = true;
      continue;
    }

    if (arg === "--max-fix-attempts") {
      const parsed = parseMaxFixAttempts(args[index + 1]);
      if (parsed === undefined) {
        return undefined;
      }
      maxFixAttempts = parsed;
      index += 1;
      continue;
    }

    if (arg === "--test-command") {
      const value = args[index + 1];
      if (value === undefined || value.length === 0) {
        return undefined;
      }
      testCommandFlag = value;
      index += 1;
      continue;
    }

    if (arg?.startsWith("--") === true) {
      return undefined;
    }

    if (arg !== undefined) {
      positional.push(arg);
    }
  }

  if (positional.length !== 1 || positional[0] === undefined || (testCommandFlag !== undefined && !useTest)) {
    return undefined;
  }

  return {
    runId: positional[0],
    useCodex,
    useClaude,
    useTest,
    fixEnabled,
    ...(maxFixAttempts === undefined ? {} : { maxFixAttempts }),
    ...(testCommandFlag === undefined ? {} : { testCommandFlag })
  };
}

type WorkerSelection = {
  useCodex: boolean;
  useClaude: boolean;
  useTest: boolean;
  testCommand?: WorkerCommand;
};

type FixSelection = {
  fixEnabled: boolean;
  maxFixAttempts?: number;
};

type ExecutorSelection = WorkerSelection & FixSelection;

type WorkerSelectionFlags = {
  useCodex: boolean;
  useClaude: boolean;
  useTest: boolean;
  testCommandFlag?: string;
};

export type ResolveTestCommandOptions = {
  config?: unknown;
  flag?: string;
};

export function resolveTestCommand(options: ResolveTestCommandOptions): WorkerCommand | undefined {
  if (options.flag !== undefined) {
    return parseFlagTestCommand(options.flag);
  }

  return parseConfigTestCommand(options.config);
}

async function resolveWorkerSelection(context: CommandContext, flags: WorkerSelectionFlags): Promise<WorkerSelection> {
  const config = flags.useTest ? await loadRunConfig(context.cwd) : undefined;
  const testCommand = flags.useTest
    ? resolveTestCommand({
        ...(config === undefined ? {} : { config }),
        ...(flags.testCommandFlag === undefined ? {} : { flag: flags.testCommandFlag })
      })
    : undefined;

  return {
    useCodex: flags.useCodex,
    useClaude: flags.useClaude,
    useTest: flags.useTest,
    ...(testCommand === undefined ? {} : { testCommand })
  };
}

function withFixSelection(workerSelection: WorkerSelection, fixSelection: FixSelection): ExecutorSelection {
  return {
    ...workerSelection,
    fixEnabled: fixSelection.fixEnabled,
    ...(fixSelection.maxFixAttempts === undefined ? {} : { maxFixAttempts: fixSelection.maxFixAttempts })
  };
}

async function loadRunConfig(cwd: string): Promise<unknown | undefined> {
  const configPath = path.join(workspaceDir(cwd), "config.json");

  try {
    return JSON.parse(await readFile(configPath, "utf8")) as unknown;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid Baton config: ${configPath}`);
    }
    throw error;
  }
}

function parseFlagTestCommand(flag: string): WorkerCommand | undefined {
  const tokens = flag.trim().split(/\s+/u).filter((token) => token.length > 0);
  const command = tokens[0];
  if (command === undefined) {
    return undefined;
  }

  return { command, args: tokens.slice(1) };
}

function parseConfigTestCommand(config: unknown): WorkerCommand | undefined {
  if (!isRecord(config) || !isRecord(config.test)) {
    return undefined;
  }

  const commandParts = config.test.command;
  if (!Array.isArray(commandParts) || !commandParts.every((part): part is string => typeof part === "string")) {
    return undefined;
  }

  const command = commandParts[0];
  if (command === undefined || command.length === 0) {
    return undefined;
  }

  return { command, args: commandParts.slice(1) };
}

function parseMaxFixAttempts(value: string | undefined): number | undefined {
  if (value === undefined || !/^[1-9]\d*$/u.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maxFixAttemptsLimit) {
    return undefined;
  }

  return parsed;
}

async function createExecutorFromContext(
  context: CommandContext,
  options: ExecutorSelection = { useCodex: false, useClaude: false, useTest: false, fixEnabled: false }
): Promise<{ artifactStore: ArtifactStore; executor: RunExecutor; workflows: Workflow[]; workers: JournalWorkers }> {
  const workflows = await loadWorkflows({ cwd: context.cwd });
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runService = new RunService({ artifactStore, workflows, clock: context.clock });
  const { executor, workers } = createExecutor(context, artifactStore, runService, workflows, options);
  return {
    artifactStore,
    executor,
    workflows,
    workers
  };
}

function createExecutor(
  context: CommandContext,
  artifactStore: ArtifactStore,
  runService: RunService,
  workflows: Workflow[],
  options: ExecutorSelection = { useCodex: false, useClaude: false, useTest: false, fixEnabled: false }
): { executor: RunExecutor; workers: JournalWorkers } {
  const registryResult =
    options.useCodex || options.useClaude || options.useTest
      ? createWorkerRegistry({
          codex: options.useCodex,
          claude: options.useClaude,
          test: options.useTest,
          ...(options.testCommand === undefined ? {} : { testCommand: options.testCommand }),
          runner: context.runner
        })
      : createDefaultWorkerRegistry();
  return {
    executor: new RunExecutor({
      runService,
      runStore: new RunStore({ artifactStore, clock: context.clock }),
      artifactStore,
      worktreeManager: new GitWorktreeManager({ runner: context.runner, repoRoot: context.cwd }),
      workerRegistry: registryResult.registry,
      workflows,
      approvalPolicy: new ApprovalPolicy(),
      clock: context.clock,
      fixEnabled: options.fixEnabled,
      fixPolicy: new FixPolicy(options.maxFixAttempts === undefined ? {} : { maxAttempts: options.maxFixAttempts })
    }),
    workers: workerKindsForRegistry(registryResult)
  };
}

function workerKindsForRegistry(registry: Pick<WorkerRegistryResult, "codexRoles" | "claudeRoles" | "stubRoles">): JournalWorkers {
  const { codexRoles, claudeRoles, stubRoles } = registry;
  const workers: JournalWorkers = {};
  for (const role of codexRoles) {
    workers[role] = "codex";
  }
  for (const role of claudeRoles) {
    workers[role] = "claude";
  }
  for (const role of stubRoles) {
    workers[role] = "stub";
  }
  return workers;
}

function toRunListJson(run: Run): RunListJson {
  const outcome = runOutcome(run);
  return {
    runId: run.id,
    status: run.status,
    dryRun: run.dryRun,
    workflowId: run.workflowId,
    createdAt: run.createdAt,
    ...(run.updatedAt === undefined ? {} : { updatedAt: run.updatedAt }),
    stepCount: run.steps.length,
    ...(outcome === undefined ? {} : { outcome })
  };
}

function printRunDetails(context: CommandContext, run: Run, artifactFiles: readonly string[]): void {
  context.stdout(`Run ${run.id} ${run.status} (${run.workflowId})`);
  context.stdout(`Request: ${run.request}`);
  context.stdout(`Dry run: ${run.dryRun ? "yes" : "no"}`);
  context.stdout(`Created: ${run.createdAt}`);
  if (run.updatedAt !== undefined) {
    context.stdout(`Updated: ${run.updatedAt}`);
  }
  if (run.projectId !== undefined) {
    context.stdout(`Project: ${run.projectId}`);
  }
  if (run.baseBranch !== undefined) {
    context.stdout(`Base branch: ${run.baseBranch}`);
  }
  if (run.worktreePath !== undefined) {
    context.stdout(`Worktree: ${run.worktreePath}`);
  }
  if (run.cleanedAt !== undefined) {
    context.stdout(`Cleaned: ${run.cleanedAt}`);
  }

  context.stdout("Steps:");
  if (run.steps.length === 0) {
    context.stdout("- none");
  } else {
    context.stdout(
      formatTable(
        ["ID", "Type", "Status", "Started At", "Completed At", "Reason"],
        run.steps.map((step) => [
          step.id,
          step.type,
          step.status,
          step.startedAt ?? "-",
          step.completedAt ?? "-",
          step.reason ?? "-"
        ])
      )
    );
  }

  context.stdout("Approvals:");
  if (run.approvals === undefined || run.approvals.length === 0) {
    context.stdout("- none");
  } else {
    context.stdout(
      formatTable(
        ["Step", "Status", "Created At", "Decided At", "Note"],
        run.approvals.map((approval) => [
          approval.stepId,
          approval.status,
          approval.createdAt,
          approval.decidedAt ?? "-",
          approval.note ?? "-"
        ])
      )
    );
  }

  context.stdout("Artifacts:");
  if (artifactFiles.length === 0) {
    context.stdout("- none");
  } else {
    for (const artifactFile of artifactFiles) {
      context.stdout(`- ${artifactFile}`);
    }
  }
}

function printRun(context: CommandContext, run: Run): void {
  context.stdout(`Run ${run.id} ${run.status} (${run.workflowId})`);
  if (run.worktreePath !== undefined) {
    context.stdout(`Worktree: ${run.worktreePath}`);
  }
}

function printSteps(context: CommandContext, run: Run): void {
  for (const step of run.steps) {
    context.stdout(`- ${step.id}: ${step.type} (${step.status})${step.reason === undefined ? "" : ` - ${step.reason}`}`);
  }
}

function printOutcomeHint(context: CommandContext, run: Run): void {
  if (run.status === "awaiting-approval") {
    const step = run.steps.find((candidate) => candidate.status !== "completed" && candidate.status !== "failed" && candidate.status !== "skipped");
    context.stdout(`Awaiting approval: baton run approve ${run.id}${step === undefined ? "" : ` # ${step.id}`}`);
  }
}

function printSkipped(write: (line: string) => void, skipped: number): void {
  if (skipped > 0) {
    write(`${skipped} skipped run(s) with missing or invalid run.json.`);
  }
}

function formatRunSummary(summary: ReturnType<typeof summarizeRuns>): string {
  const statuses = Object.entries(summary.byStatus)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${status}: ${count}`);
  return statuses.length === 0 ? `Total: ${summary.total}` : `Total: ${summary.total} (${statuses.join(", ")})`;
}

function formatTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => {
        const cell = row[index];
        return cell === undefined ? 0 : cell.length;
      })
    )
  );
  const divider = widths.map((width) => "-".repeat(width));
  const formatRow = (row: readonly string[]): string =>
    row
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd();

  return [formatRow(headers), formatRow(divider), ...rows.map(formatRow)].join("\n");
}

async function listArtifactFiles(directory: string, prefix = ""): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => compareString(left.name, right.name))) {
    const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listArtifactFiles(entryPath, relativePath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function warnStub(context: CommandContext): void {
  const { stubRoles } = createDefaultWorkerRegistry();
  context.stderr(`Warning: using StubWorker for ${stubRoles.join(", ")}.`);
}

function warnRegistry(context: CommandContext, selection: ExecutorSelection): void {
  if (selection.useTest && selection.testCommand === undefined) {
    context.stderr("Warning: --test requested but no test command was configured; using StubWorker for tester.");
  }

  if (selection.fixEnabled && !selection.useCodex) {
    context.stderr("Warning: --fix requested without --codex; using StubWorker for fixer, so no provider-specific code changes will be made.");
  }

  if (!selection.useCodex && !selection.useClaude && !selection.useTest) {
    warnStub(context);
    return;
  }

  const { codexRoles, claudeRoles, testerRoles, stubRoles } = createWorkerRegistry({
    codex: selection.useCodex,
    claude: selection.useClaude,
    test: selection.useTest,
    ...(selection.testCommand === undefined ? {} : { testCommand: selection.testCommand })
  });
  const actuals = [
    codexRoles.length === 0 ? undefined : `CodexExecAdapter for ${codexRoles.join(", ")}`,
    claudeRoles.length === 0 ? undefined : `ClaudeCodeAdapter for ${claudeRoles.join(", ")}`,
    testerRoles.length === 0 ? undefined : `TestRunnerAdapter for ${testerRoles.join(", ")}`
  ].filter((message): message is string => message !== undefined);
  const stubMessage = stubRoles.length === 0 ? undefined : `StubWorker for ${stubRoles.join(", ")}`;
  const messages = [...actuals, ...(stubMessage === undefined ? [] : [stubMessage])];
  context.stderr(`Warning: using ${messages.join("; ")}.`);
}

async function preflightCodex(context: CommandContext): Promise<CommandResult> {
  const result = await checkCodex(context.runner, { cwd: context.cwd });
  if (result.available) {
    return 0;
  }

  const prefix = result.reason === "not-installed" ? "Codex not installed or not on PATH" : "Codex command returned an error";
  context.stderr(`${prefix}: ${result.message}`);
  return 1;
}

async function preflightClaude(context: CommandContext): Promise<CommandResult> {
  const result = await checkClaude(context.runner, { cwd: context.cwd });
  if (result.available) {
    return 0;
  }

  const prefix = result.reason === "not-installed" ? "Claude not installed or not on PATH" : "Claude command returned an error";
  context.stderr(`${prefix}: ${result.message}`);
  return 1;
}

function isTerminalRun(run: Run): boolean {
  return run.status === "completed" || run.status === "failed" || run.status === "cancelled";
}

function runOutcome(run: Run): RunStatus | undefined {
  return isTerminalRun(run) ? run.status : undefined;
}

function compareString(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runUsage(): string {
  return [
    "Usage:",
    "  baton run <request> [--dry-run] [--codex] [--claude] [--test] [--test-command <command>] [--fix] [--max-fix-attempts <n>] [--workflow <id>] [--project <id>]",
    "  baton run list [--status <status>] [--limit <n>] [--json]",
    "  baton run show <runId>",
    "  baton run status <runId>",
    "  baton run resume <runId> [--codex] [--claude] [--test] [--test-command <command>] [--fix] [--max-fix-attempts <n>]",
    "  baton run approve <runId> [--codex] [--claude] [--test] [--test-command <command>] [--fix] [--max-fix-attempts <n>] [--reject] [--note <text>]",
    "  baton run clean <runId>"
  ].join("\n");
}
