import type { Dirent, Stats } from "node:fs";
import { copyFile, lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  JournalNoteMeta,
  type JournalNoteMeta as JournalNoteMetaType,
  type JournalWorkerKind,
  type Run,
  type Workflow,
  type WorkflowStepType
} from "@baton/schemas";

import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";
import { renderJournalIndex, renderJournalNote, type JournalIndexEntry } from "./render.js";

export type ExportRunJournalOptions = {
  vaultPath: string;
  runDirectory: string;
  clock?: Clock;
  workflow?: Workflow;
  workers?: Partial<Record<string, JournalWorkerKind>>;
};

export type ExportRunJournalResult = {
  notePath: string;
  artifactDirectory: string;
  copiedArtifacts: string[];
  embeddedArtifacts: string[];
  safeRunId: string;
};

export type UpdateJournalIndexOptions = {
  vaultPath: string;
};

export type UpdateJournalIndexResult = {
  indexPath: string;
  runCount: number;
};

export type JournalFileSystem = {
  copyFile(source: string, destination: string): Promise<void>;
  lstat(targetPath: string): Promise<Stats>;
  mkdir(targetPath: string, options: { recursive: true }): Promise<unknown>;
  readdir(targetPath: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  writeFile(targetPath: string, content: string, encoding: "utf8"): Promise<void>;
};

export type ObsidianJournalExporterOptions = {
  fileSystem?: JournalFileSystem;
};

type JournalPaths = {
  batonDirectory: string;
  runsDirectory: string;
  indexPath: string;
};

const embeddedArtifactNames = new Set(["analysis.md", "design.md", "review.md"]);
const nodeFileSystem: JournalFileSystem = {
  copyFile,
  lstat,
  mkdir,
  readdir,
  writeFile
};

export class ObsidianJournalExporter {
  private readonly fileSystem: JournalFileSystem;

  public constructor(options: ObsidianJournalExporterOptions = {}) {
    this.fileSystem = options.fileSystem ?? nodeFileSystem;
  }

  public async exportRun(run: Run, options: ExportRunJournalOptions): Promise<ExportRunJournalResult> {
    const safeRunId = sanitizeRunId(run.id);
    const journalPaths = resolveJournalPaths(options.vaultPath);
    const notePath = assertWithinBaton(path.join(journalPaths.runsDirectory, `${safeRunId}.md`), journalPaths.batonDirectory);
    const artifactDirectory = assertWithinBaton(path.join(journalPaths.runsDirectory, safeRunId), journalPaths.batonDirectory);
    const sourceDirectory = path.resolve(options.runDirectory);
    const copiedArtifacts = await listRegularFiles(this.fileSystem, sourceDirectory, journalPaths.batonDirectory);

    await this.fileSystem.mkdir(artifactDirectory, { recursive: true });
    await this.fileSystem.mkdir(path.dirname(notePath), { recursive: true });

    const copiedArtifactNames: string[] = [];
    for (const artifact of copiedArtifacts) {
      const destinationPath = assertWithinBaton(path.join(artifactDirectory, ...artifact.split("/")), journalPaths.batonDirectory);
      await this.fileSystem.mkdir(path.dirname(destinationPath), { recursive: true });
      await this.fileSystem.copyFile(path.join(sourceDirectory, ...artifact.split("/")), destinationPath);
      copiedArtifactNames.push(artifact);
    }

    const embeddedArtifacts = copiedArtifactNames.filter((artifact) => embeddedArtifactNames.has(artifact));
    const meta = createJournalNoteMeta(run, safeRunId, options.clock ?? systemClock, options.workflow, options.workers ?? {});
    const note = renderJournalNote({
      run,
      meta,
      safeRunId,
      copiedArtifacts: copiedArtifactNames,
      embeddedArtifacts
    });
    await this.fileSystem.writeFile(notePath, note, "utf8");

    return {
      notePath,
      artifactDirectory,
      copiedArtifacts: copiedArtifactNames,
      embeddedArtifacts,
      safeRunId
    };
  }

  public async updateIndex(runs: readonly Run[], options: UpdateJournalIndexOptions): Promise<UpdateJournalIndexResult> {
    const journalPaths = resolveJournalPaths(options.vaultPath);
    const indexPath = assertWithinBaton(journalPaths.indexPath, journalPaths.batonDirectory);
    const entries = sortRunsForIndex(runs).map<JournalIndexEntry>((run) => ({
      runId: run.id,
      safeRunId: sanitizeRunId(run.id),
      status: run.status,
      dryRun: run.dryRun,
      workflow: run.workflowId,
      createdAt: run.createdAt,
      outcome: run.status
    }));

    await this.fileSystem.mkdir(path.dirname(indexPath), { recursive: true });
    await this.fileSystem.writeFile(indexPath, renderJournalIndex(entries), "utf8");

    return {
      indexPath,
      runCount: entries.length
    };
  }
}

export function sanitizeRunId(runId: string): string {
  const sanitized = runId
    .trim()
    .replace(/[\\/]+/gu, "-")
    .replace(/\.\.+/gu, "-")
    .replace(/[\u0000-\u001f\u007f:]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");

  return sanitized.length === 0 || sanitized === "." ? "run" : sanitized;
}

function createJournalNoteMeta(
  run: Run,
  safeRunId: string,
  clock: Clock,
  workflow: Workflow | undefined,
  workerOverrides: Partial<Record<string, JournalWorkerKind>>
): JournalNoteMetaType {
  const roles = rolesForRun(run, workflow);
  const workers = Object.fromEntries(roles.map((role) => [role, workerOverrides[role] ?? workerForRole(role, run.dryRun)]));
  return JournalNoteMeta.parse({
    runId: safeRunId,
    status: run.status,
    dryRun: run.dryRun,
    workflow: run.workflowId,
    createdAt: run.createdAt,
    updatedAt: clock.now().toISOString(),
    outcome: run.status,
    roles,
    workers,
    stepCount: run.steps.length,
    tags: run.dryRun ? ["baton", `baton/${run.status}`, "baton/dry-run"] : ["baton", `baton/${run.status}`]
  });
}

function rolesForRun(run: Run, workflow: Workflow | undefined): string[] {
  const roles = run.steps.map((step) => workflow?.steps.find((candidate) => candidate.id === step.id)?.role ?? roleForStepType(step.type));
  return [...new Set(roles)];
}

function roleForStepType(stepType: WorkflowStepType): string {
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

function workerForRole(role: string, dryRun: boolean): JournalWorkerKind {
  if (dryRun) {
    return "stub";
  }

  if (role === "analyst" || role === "architect") {
    return "claude";
  }

  if (role === "implementer" || role === "fixer") {
    return "codex";
  }

  return "stub";
}

function resolveJournalPaths(vaultPath: string): JournalPaths {
  const batonDirectory = path.resolve(vaultPath, "Baton");
  return {
    batonDirectory,
    runsDirectory: assertWithinBaton(path.join(batonDirectory, "Runs"), batonDirectory),
    indexPath: assertWithinBaton(path.join(batonDirectory, "Runs.md"), batonDirectory)
  };
}

function assertWithinBaton(targetPath: string, batonDirectory: string): string {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBaton = path.resolve(batonDirectory);

  if (resolvedTarget !== resolvedBaton && !resolvedTarget.startsWith(`${resolvedBaton}${path.sep}`)) {
    throw new Error(`Journal path escapes Baton directory: ${targetPath}`);
  }

  return resolvedTarget;
}

async function listRegularFiles(fileSystem: JournalFileSystem, rootDirectory: string, skipDirectory: string): Promise<string[]> {
  const root = path.resolve(rootDirectory);
  const skip = path.resolve(skipDirectory);
  const files: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    const resolvedCurrent = path.resolve(currentPath);
    if (isWithinOrEqual(resolvedCurrent, skip)) {
      return;
    }

    const stats = await fileSystem.lstat(resolvedCurrent);
    if (stats.isSymbolicLink()) {
      return;
    }

    if (stats.isFile()) {
      files.push(toPosixPath(path.relative(root, resolvedCurrent)));
      return;
    }

    if (!stats.isDirectory()) {
      return;
    }

    const entries = await fileSystem.readdir(resolvedCurrent, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await visit(path.join(resolvedCurrent, entry.name));
    }
  }

  await visit(root);
  return files.sort();
}

function isWithinOrEqual(candidatePath: string, parentPath: string): boolean {
  const candidate = path.resolve(candidatePath);
  const parent = path.resolve(parentPath);
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function sortRunsForIndex(runs: readonly Run[]): Run[] {
  return runs
    .map((run, index) => ({ run, index }))
    .sort((left, right) => {
      const createdCompare = right.run.createdAt.localeCompare(left.run.createdAt);
      return createdCompare === 0 ? left.index - right.index : createdCompare;
    })
    .map((entry) => entry.run);
}
