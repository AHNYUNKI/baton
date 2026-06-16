import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { RunSchema, RunStatusSchema, type Run, type RunStatus } from "@baton/schemas";

import { runsDir } from "../config/paths.js";

export type LoadedRun = {
  run: Run;
  directory: string;
};

export type ListRunsOptions = {
  cwd: string;
  status?: RunStatus;
  limit?: number;
};

export type ListRunsResult = {
  runs: LoadedRun[];
  skipped: number;
};

export type RunSummary = {
  total: number;
  byStatus: Record<RunStatus, number>;
};

type SummarizableRun = LoadedRun | Run;

export async function listRuns(options: ListRunsOptions): Promise<ListRunsResult> {
  const directory = runsDir(options.cwd);
  const entries = await readRunDirectoryEntries(directory);
  if (entries === undefined) {
    return { runs: [], skipped: 0 };
  }

  const loadedRuns: LoadedRun[] = [];
  let skipped = 0;

  for (const entry of entries.sort((left, right) => compareString(left.name, right.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDirectory = path.join(directory, entry.name);
    const run = await readRun(path.join(runDirectory, "run.json"));
    if (run === undefined) {
      skipped += 1;
      continue;
    }

    loadedRuns.push({ run, directory: runDirectory });
  }

  const sortedRuns = loadedRuns.sort(compareLoadedRuns);
  const filteredRuns = options.status === undefined ? sortedRuns : sortedRuns.filter((loadedRun) => loadedRun.run.status === options.status);
  const limitedRuns = options.limit === undefined ? filteredRuns : filteredRuns.slice(0, options.limit);

  return { runs: limitedRuns, skipped };
}

export function summarizeRuns(runs: readonly SummarizableRun[]): RunSummary {
  const byStatus = Object.fromEntries(RunStatusSchema.options.map((status) => [status, 0])) as Record<RunStatus, number>;

  for (const candidate of runs) {
    const run = "run" in candidate ? candidate.run : candidate;
    byStatus[run.status] += 1;
  }

  return {
    total: runs.length,
    byStatus
  };
}

async function readRunDirectoryEntries(directory: string): Promise<Dirent[] | undefined> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readRun(runPath: string): Promise<Run | undefined> {
  let content: string;
  try {
    content = await readFile(runPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    const result = RunSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function compareLoadedRuns(left: LoadedRun, right: LoadedRun): number {
  const createdAtDifference = Date.parse(right.run.createdAt) - Date.parse(left.run.createdAt);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }
  return compareString(left.run.id, right.run.id);
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
