import path from "node:path";

import {
  ApprovalPolicy,
  ArtifactStore,
  GitWorktreeManager,
  RunExecutor,
  RunService,
  RunStore,
  loadWorkflows
} from "@baton/core";
import type { Run } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";
import { checkClaude, checkCodex } from "./doctor.js";
import { createDefaultWorkerRegistry, createWorkerRegistry } from "../registry.js";

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
  const runService = new RunService({ artifactStore, workflows });

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

  const executor = createExecutor(context, artifactStore, runService, workflows, { useCodex: parsed.useCodex, useClaude: parsed.useClaude });
  warnRegistry(context, parsed.useCodex, parsed.useClaude);
  const result = await executor.start(parsed.request, {
    ...(parsed.workflowId === undefined ? {} : { workflowId: parsed.workflowId }),
    ...(parsed.projectId === undefined ? {} : { projectId: parsed.projectId })
  });

  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  return result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
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

  const { executor } = await createExecutorFromContext(context, { useCodex: parsed.useCodex, useClaude: parsed.useClaude });
  warnRegistry(context, parsed.useCodex, parsed.useClaude);
  const result = await executor.resume(parsed.runId);

  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  return result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
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

  const { executor } = await createExecutorFromContext(context, { useCodex: parsed.useCodex, useClaude: parsed.useClaude });
  const decided = await executor.decide(parsed.runId, {
    decision: parsed.reject ? "rejected" : "approved",
    ...(parsed.note === undefined ? {} : { note: parsed.note })
  });

  if (parsed.reject) {
    printRun(context, decided);
    printSteps(context, decided);
    return 0;
  }

  warnRegistry(context, parsed.useCodex, parsed.useClaude);
  const result = await executor.resume(parsed.runId);
  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  return result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
}

async function cleanCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runStore = new RunStore({ artifactStore });
  const run = await runStore.load(args[0]);
  if (!isTerminalRun(run)) {
    context.stderr(`Cannot clean run ${run.id} while status is ${run.status}.`);
    return 1;
  }

  if (run.cleanedAt !== undefined) {
    context.stdout(`Run ${run.id} already cleaned at ${run.cleanedAt}.`);
    return 0;
  }

  if (run.worktreePath === undefined) {
    const cleaned = await runStore.markCleaned(run.id);
    context.stdout(`Run ${cleaned.id} has no worktree to clean.`);
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
  return 0;
}

type ParsedExecuteArgs = {
  request: string;
  dryRun: boolean;
  useCodex: boolean;
  useClaude: boolean;
  workflowId?: string;
  projectId?: string;
};

function parseExecuteArgs(args: readonly string[]): ParsedExecuteArgs | undefined {
  const requestParts: string[] = [];
  let dryRun = false;
  let useCodex = false;
  let useClaude = false;
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
  if (request.length === 0 || workflowId === "" || projectId === "") {
    return undefined;
  }

  return workflowId === undefined && projectId === undefined
    ? { request, dryRun, useCodex, useClaude }
    : {
        request,
        dryRun,
        useCodex,
        useClaude,
        ...(workflowId === undefined ? {} : { workflowId }),
        ...(projectId === undefined ? {} : { projectId })
      };
}

type ParsedApproveArgs = {
  runId: string;
  reject: boolean;
  useCodex: boolean;
  useClaude: boolean;
  note?: string;
};

function parseApproveArgs(args: readonly string[]): ParsedApproveArgs | undefined {
  let reject = false;
  let useCodex = false;
  let useClaude = false;
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

  if (positional.length !== 1 || positional[0] === undefined || note === "") {
    return undefined;
  }

  return note === undefined
    ? { runId: positional[0], reject, useCodex, useClaude }
    : { runId: positional[0], reject, useCodex, useClaude, note };
}

type ParsedRunIdWithWorkers = {
  runId: string;
  useCodex: boolean;
  useClaude: boolean;
};

function parseRunIdWithWorkers(args: readonly string[]): ParsedRunIdWithWorkers | undefined {
  let useCodex = false;
  let useClaude = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--codex") {
      useCodex = true;
      continue;
    }

    if (arg === "--claude") {
      useClaude = true;
      continue;
    }

    if (arg.startsWith("--")) {
      return undefined;
    }

    positional.push(arg);
  }

  if (positional.length !== 1 || positional[0] === undefined) {
    return undefined;
  }

  return {
    runId: positional[0],
    useCodex,
    useClaude
  };
}

type WorkerSelection = {
  useCodex: boolean;
  useClaude: boolean;
};

async function createExecutorFromContext(
  context: CommandContext,
  options: WorkerSelection = { useCodex: false, useClaude: false }
): Promise<{ executor: RunExecutor }> {
  const workflows = await loadWorkflows({ cwd: context.cwd });
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runService = new RunService({ artifactStore, workflows });
  return {
    executor: createExecutor(context, artifactStore, runService, workflows, options)
  };
}

function createExecutor(
  context: CommandContext,
  artifactStore: ArtifactStore,
  runService: RunService,
  workflows: Awaited<ReturnType<typeof loadWorkflows>>,
  options: WorkerSelection = { useCodex: false, useClaude: false }
): RunExecutor {
  const { registry } =
    options.useCodex || options.useClaude
      ? createWorkerRegistry({ codex: options.useCodex, claude: options.useClaude, runner: context.runner })
      : createDefaultWorkerRegistry();
  return new RunExecutor({
    runService,
    runStore: new RunStore({ artifactStore }),
    artifactStore,
    worktreeManager: new GitWorktreeManager({ runner: context.runner, repoRoot: context.cwd }),
    workerRegistry: registry,
    workflows,
    approvalPolicy: new ApprovalPolicy()
  });
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

function warnStub(context: CommandContext): void {
  const { stubRoles } = createDefaultWorkerRegistry();
  context.stderr(`Warning: using StubWorker for ${stubRoles.join(", ")}.`);
}

function warnRegistry(context: CommandContext, useCodex: boolean, useClaude: boolean): void {
  if (!useCodex && !useClaude) {
    warnStub(context);
    return;
  }

  const { codexRoles, claudeRoles, stubRoles } = createWorkerRegistry({ codex: useCodex, claude: useClaude });
  const actuals = [
    codexRoles.length === 0 ? undefined : `CodexExecAdapter for ${codexRoles.join(", ")}`,
    claudeRoles.length === 0 ? undefined : `ClaudeCodeAdapter for ${claudeRoles.join(", ")}`
  ].filter((message): message is string => message !== undefined);
  context.stderr(`Warning: using ${actuals.join("; ")}; StubWorker for ${stubRoles.join(", ")}.`);
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

function runUsage(): string {
  return [
    "Usage:",
    "  baton run <request> [--dry-run] [--codex] [--claude] [--workflow <id>] [--project <id>]",
    "  baton run status <runId>",
    "  baton run resume <runId> [--codex] [--claude]",
    "  baton run approve <runId> [--codex] [--claude] [--reject] [--note <text>]",
    "  baton run clean <runId>"
  ].join("\n");
}
