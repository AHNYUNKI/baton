import { detectRunChanges } from "@baton/core";
import { makeEnvelope, type RunSummaryJson, type WatchEvent } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";
import { toRunSummaryJson } from "./run.js";
import { listReadApiRuns } from "./state.js";

const DEFAULT_INTERVAL_MS = 2000;

type ParsedWatchArgs = {
  intervalMs: number;
  once: boolean;
};

type StopState = {
  stopped: boolean;
  wake: (() => void) | undefined;
};

export async function watchCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] === "--help" || args[0] === "-h") {
    context.stdout(watchUsage());
    return 0;
  }

  const parsed = parseWatchArgs(args);
  if (parsed === undefined) {
    context.stderr(watchUsage());
    return 1;
  }

  const stopState: StopState = { stopped: false, wake: undefined };
  const unregisterStopHandlers = registerStopHandlers(stopState);
  try {
    let previous = await loadRunSummaries(context.cwd);
    emitEvents(context, detectRunChanges([], previous));

    if (parsed.once) {
      return 0;
    }

    while (!stopState.stopped) {
      await sleepUntilStopped(parsed.intervalMs, stopState);
      if (stopState.stopped) {
        break;
      }

      try {
        const current = await loadRunSummaries(context.cwd);
        emitEvents(context, detectRunChanges(previous, current));
        previous = current;
      } catch (error) {
        context.stderr(`Warning: failed to read Baton run snapshot: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return 0;
  } finally {
    unregisterStopHandlers();
  }
}

function parseWatchArgs(args: readonly string[]): ParsedWatchArgs | undefined {
  let intervalMs = DEFAULT_INTERVAL_MS;
  let once = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--once") {
      once = true;
      continue;
    }

    if (arg === "--interval") {
      const parsed = parseIntervalMs(args[index + 1]);
      if (parsed === undefined) {
        return undefined;
      }
      intervalMs = parsed;
      index += 1;
      continue;
    }

    return undefined;
  }

  return { intervalMs, once };
}

function parseIntervalMs(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return undefined;
  }

  const intervalMs = Math.round(seconds * 1000);
  return Number.isSafeInteger(intervalMs) && intervalMs > 0 ? intervalMs : undefined;
}

async function loadRunSummaries(cwd: string): Promise<RunSummaryJson[]> {
  const result = await listReadApiRuns(cwd);
  return result.runs.map((loadedRun) => toRunSummaryJson(loadedRun.run));
}

function emitEvents(context: CommandContext, events: readonly WatchEvent[]): void {
  for (const event of events) {
    context.stdout(JSON.stringify(makeEnvelope("event", event)));
  }
}

function registerStopHandlers(stopState: StopState): () => void {
  const stop = (): void => {
    stopState.stopped = true;
    stopState.wake?.();
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  return () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  };
}

async function sleepUntilStopped(intervalMs: number, stopState: StopState): Promise<void> {
  if (stopState.stopped) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, intervalMs);
    stopState.wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  stopState.wake = undefined;
}

function watchUsage(): string {
  return ["Usage:", "  baton watch [--interval <s>] [--once]"].join("\n");
}
