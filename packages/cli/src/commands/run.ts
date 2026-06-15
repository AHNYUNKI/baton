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
import { createDefaultWorkerRegistry } from "../registry.js";

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

  const executor = createExecutor(context, artifactStore, runService, workflows);
  warnStub(context);
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
  if (args.length !== 1 || args[0] === undefined) {
    context.stderr(runUsage());
    return 1;
  }

  const { executor } = await createExecutorFromContext(context);
  warnStub(context);
  const result = await executor.resume(args[0]);

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

  const { executor } = await createExecutorFromContext(context);
  const decided = await executor.decide(parsed.runId, {
    decision: parsed.reject ? "rejected" : "approved",
    ...(parsed.note === undefined ? {} : { note: parsed.note })
  });

  if (parsed.reject) {
    printRun(context, decided);
    printSteps(context, decided);
    return 0;
  }

  warnStub(context);
  const result = await executor.resume(parsed.runId);
  printRun(context, result.run);
  printSteps(context, result.run);
  printOutcomeHint(context, result.run);
  return result.outcome === "failed" || result.outcome === "cancelled" ? 1 : 0;
}

type ParsedExecuteArgs = {
  request: string;
  dryRun: boolean;
  workflowId?: string;
  projectId?: string;
};

function parseExecuteArgs(args: readonly string[]): ParsedExecuteArgs | undefined {
  const requestParts: string[] = [];
  let dryRun = false;
  let workflowId: string | undefined;
  let projectId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
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
    ? { request, dryRun }
    : {
        request,
        dryRun,
        ...(workflowId === undefined ? {} : { workflowId }),
        ...(projectId === undefined ? {} : { projectId })
      };
}

type ParsedApproveArgs = {
  runId: string;
  reject: boolean;
  note?: string;
};

function parseApproveArgs(args: readonly string[]): ParsedApproveArgs | undefined {
  let reject = false;
  let note: string | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--reject") {
      reject = true;
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

  return note === undefined ? { runId: positional[0], reject } : { runId: positional[0], reject, note };
}

async function createExecutorFromContext(context: CommandContext): Promise<{ executor: RunExecutor }> {
  const workflows = await loadWorkflows({ cwd: context.cwd });
  const artifactStore = new ArtifactStore({ workspaceRoot: context.cwd });
  const runService = new RunService({ artifactStore, workflows });
  return {
    executor: createExecutor(context, artifactStore, runService, workflows)
  };
}

function createExecutor(
  context: CommandContext,
  artifactStore: ArtifactStore,
  runService: RunService,
  workflows: Awaited<ReturnType<typeof loadWorkflows>>
): RunExecutor {
  const { registry } = createDefaultWorkerRegistry();
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

function runUsage(): string {
  return [
    "Usage:",
    "  baton run <request> [--dry-run] [--workflow <id>] [--project <id>]",
    "  baton run status <runId>",
    "  baton run resume <runId>",
    "  baton run approve <runId> [--reject] [--note <text>]"
  ].join("\n");
}
