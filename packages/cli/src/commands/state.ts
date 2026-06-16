import { access } from "node:fs/promises";

import { RunIndex, batonDbPath, listRuns, openDatabase, summarizeRuns, type ListRunsResult } from "@baton/core";
import { RunStatusSchema, makeEnvelope, type StateJson } from "@baton/schemas";

import type { CommandContext, CommandResult } from "./context.js";
import { toRunSummaryJson } from "./run.js";

const DEFAULT_RECENT_LIMIT = 5;

type ParsedStateArgs = {
  json: boolean;
};

export async function stateCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  if (args[0] === "--help" || args[0] === "-h") {
    context.stdout(stateUsage());
    return 0;
  }

  const parsed = parseStateArgs(args);
  if (parsed === undefined) {
    context.stderr(stateUsage());
    return 1;
  }

  const result = await listReadApiRuns(context.cwd);
  const runSummary = summarizeRuns(result.runs);
  const runSummaries = result.runs.map((loadedRun) => toRunSummaryJson(loadedRun.run));
  const data: StateJson = {
    total: runSummary.total,
    byStatus: runSummary.byStatus,
    recent: runSummaries.slice(0, DEFAULT_RECENT_LIMIT)
  };

  if (parsed.json) {
    context.stdout(JSON.stringify(makeEnvelope("state", data), null, 2));
    return 0;
  }

  context.stdout(`Total: ${data.total}`);
  context.stdout("By status:");
  for (const status of RunStatusSchema.options) {
    context.stdout(`- ${status}: ${data.byStatus[status]}`);
  }
  context.stdout("Recent runs:");
  if (data.recent.length === 0) {
    context.stdout("- none");
  } else {
    for (const run of data.recent) {
      context.stdout(`- ${run.runId}: ${run.status} (${run.workflowId}) ${run.createdAt}`);
    }
  }
  if (result.skipped > 0) {
    context.stdout(`${result.skipped} skipped run(s) with missing or invalid run.json.`);
  }
  return 0;
}

export async function listReadApiRuns(cwd: string): Promise<ListRunsResult> {
  const dbPath = batonDbPath(cwd);
  const db = (await fileExists(dbPath)) ? await openDatabase({ path: dbPath }) : undefined;
  const index = db === undefined ? undefined : new RunIndex({ db });
  try {
    return await listRuns({
      cwd,
      ...(index === undefined ? {} : { index })
    });
  } finally {
    await db?.close();
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function parseStateArgs(args: readonly string[]): ParsedStateArgs | undefined {
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

function stateUsage(): string {
  return ["Usage:", "  baton state [--json]"].join("\n");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
