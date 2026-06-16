import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  ObsidianJournalExporter,
  listRuns,
  loadWorkflows,
  resolveObsidianVault,
  workspaceDir,
  type ObsidianVaultConfig
} from "@baton/core";
import type { AgentRole, JournalWorkerKind, Run, Workflow, WorkflowStepType } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";

export type JournalWorkers = Partial<Record<AgentRole, JournalWorkerKind>>;

export type MaybeExportJournalOptions = {
  workflows?: readonly Workflow[];
  workers?: JournalWorkers;
};

export async function journalCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args.length !== 1 || args[0] !== "sync") {
    context.stderr("Usage: baton journal sync");
    return 1;
  }

  try {
    const config = await loadWorkspaceConfig(context.cwd);
    const vaultPath = resolveObsidianVault({ env: context.env, config });
    if (vaultPath === undefined) {
      context.stdout("Obsidian vault is not configured; nothing to sync.");
      return 0;
    }

    const workflows = await loadWorkflows({ cwd: context.cwd });
    const { runs } = await listRuns({ cwd: context.cwd });
    const exporter = new ObsidianJournalExporter();
    for (const loadedRun of runs) {
      const workflow = workflowForRun(loadedRun.run, workflows);
      await exporter.exportRun(loadedRun.run, {
        vaultPath,
        runDirectory: loadedRun.directory,
        clock: context.clock,
        ...(workflow === undefined ? {} : { workflow }),
        workers: await inferJournalWorkers(loadedRun.run, loadedRun.directory, workflow)
      });
    }
    await exporter.updateIndex(
      runs.map((loadedRun) => loadedRun.run),
      { vaultPath }
    );

    context.stdout(`Synced ${runs.length} Baton run journal note(s) to ${vaultPath}`);
    return 0;
  } catch (error) {
    context.stderr(`Failed to sync Obsidian journal: ${formatError(error)}`);
    return 1;
  }
}

export async function maybeExportJournal(
  context: CommandContext,
  run: Run,
  runDirectory: string,
  options: MaybeExportJournalOptions = {}
): Promise<void> {
  try {
    const config = await loadWorkspaceConfig(context.cwd);
    const vaultPath = resolveObsidianVault({ env: context.env, config });
    if (vaultPath === undefined) {
      return;
    }

    const exporter = new ObsidianJournalExporter();
    const workflows = options.workflows ?? (await loadWorkflows({ cwd: context.cwd }));
    const workflow = workflowForRun(run, workflows);
    const inferredWorkers = await inferJournalWorkers(run, runDirectory, workflow);
    await exporter.exportRun(run, {
      vaultPath,
      runDirectory,
      clock: context.clock,
      ...(workflow === undefined ? {} : { workflow }),
      workers: { ...inferredWorkers, ...(options.workers ?? {}) }
    });
    await exporter.updateIndex(includeRun(await loadRuns(context.cwd), run), { vaultPath });
  } catch (error) {
    context.stderr(`Warning: failed to export Obsidian journal: ${formatError(error)}`);
  }
}

async function loadWorkspaceConfig(cwd: string): Promise<ObsidianVaultConfig | undefined> {
  const configPath = path.join(workspaceDir(cwd), "config.json");

  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
    if (!isObsidianVaultConfig(parsed)) {
      throw new Error(`Invalid Baton config: ${configPath}`);
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function loadRuns(cwd: string): Promise<Run[]> {
  return (await listRuns({ cwd })).runs.map((loadedRun) => loadedRun.run);
}

function includeRun(runs: readonly Run[], run: Run): Run[] {
  const byId = new Map(runs.map((candidate) => [candidate.id, candidate]));
  byId.set(run.id, run);
  return [...byId.values()];
}

async function inferJournalWorkers(run: Run, runDirectory: string, workflow: Workflow | undefined): Promise<JournalWorkers> {
  const workers: JournalWorkers = {};

  for (const step of run.steps) {
    const role = workflow?.steps.find((candidate) => candidate.id === step.id)?.role ?? roleForStepType(step.type);
    const provider = await workerKindFromResult(path.join(runDirectory, "steps", `${step.id}.result.json`));
    if (provider !== undefined) {
      workers[role] = provider;
      continue;
    }

    if (run.dryRun || step.reason === "Completed by stub worker.") {
      workers[role] = "stub";
    }
  }

  return workers;
}

async function workerKindFromResult(resultPath: string): Promise<JournalWorkerKind | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resultPath, "utf8"));
    if (!isRecord(parsed) || !isRecord(parsed.metadata)) {
      return undefined;
    }

    if (isJournalWorkerKind(parsed.metadata.provider)) {
      return parsed.metadata.provider;
    }

    return parsed.metadata.stub === true ? "stub" : undefined;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function workflowForRun(run: Run, workflows: readonly Workflow[]): Workflow | undefined {
  return workflows.find((workflow) => workflow.id === run.workflowId);
}

function roleForStepType(stepType: WorkflowStepType): AgentRole {
  switch (stepType) {
    case "analyze":
      return "analyst";
    case "design":
      return "architect";
    case "implement":
      return "implementer";
    case "test":
      return "tester";
    case "review":
      return "reviewer";
    case "fix":
      return "fixer";
    case "finalize":
      return "release_writer";
    case "approve":
      return "reviewer";
  }
}

function isJournalWorkerKind(value: unknown): value is JournalWorkerKind {
  return value === "codex" || value === "claude" || value === "stub";
}

function isObsidianVaultConfig(value: unknown): value is ObsidianVaultConfig {
  if (!isRecord(value)) {
    return false;
  }

  const obsidian = value.obsidian;
  if (obsidian === undefined) {
    return true;
  }

  if (!isRecord(obsidian)) {
    return false;
  }

  return obsidian.vault === undefined || typeof obsidian.vault === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
