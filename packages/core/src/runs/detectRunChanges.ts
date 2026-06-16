import type { RunSummaryJson, WatchEvent } from "@baton/schemas";

export function detectRunChanges(previous: readonly RunSummaryJson[], current: readonly RunSummaryJson[]): WatchEvent[] {
  const previousById = toRunSummaryMap(previous);
  const currentById = toRunSummaryMap(current);
  const runIds = [...new Set([...previousById.keys(), ...currentById.keys()])].sort(compareString);
  const events: WatchEvent[] = [];

  for (const runId of runIds) {
    const previousRun = previousById.get(runId);
    const currentRun = currentById.get(runId);

    if (previousRun === undefined && currentRun !== undefined) {
      events.push({
        type: "run.created",
        runId,
        status: currentRun.status,
        run: currentRun
      });
      continue;
    }

    if (previousRun !== undefined && currentRun === undefined) {
      events.push({
        type: "run.removed",
        runId,
        status: previousRun.status,
        run: previousRun
      });
      continue;
    }

    if (previousRun === undefined || currentRun === undefined) {
      continue;
    }

    if (previousRun.status !== currentRun.status) {
      events.push({
        type: "run.status-changed",
        runId,
        previousStatus: previousRun.status,
        status: currentRun.status,
        run: currentRun
      });
      continue;
    }

    if ((previousRun.updatedAt ?? "") !== (currentRun.updatedAt ?? "")) {
      events.push({
        type: "run.updated",
        runId,
        status: currentRun.status,
        ...(previousRun.updatedAt === undefined ? {} : { previousUpdatedAt: previousRun.updatedAt }),
        ...(currentRun.updatedAt === undefined ? {} : { updatedAt: currentRun.updatedAt }),
        run: currentRun
      });
    }
  }

  return events;
}

function toRunSummaryMap(runs: readonly RunSummaryJson[]): Map<string, RunSummaryJson> {
  return new Map(runs.map((run) => [run.runId, run]));
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
