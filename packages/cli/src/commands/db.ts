import { mkdir } from "node:fs/promises";

import { RunIndex, batonDbPath, openDatabase, workspaceDir, type DbClient, type DbQueryParams } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export type DbCommandDependencies = {
  openDatabase?: (options: { path: string }) => Promise<DbClient | undefined>;
};

export async function dbCommand(args: readonly string[], context: CommandContext, dependencies: DbCommandDependencies = {}): Promise<CommandResult> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    context.stdout(dbUsage());
    return args.length === 0 ? 1 : 0;
  }

  const [subcommand, ...rest] = args;
  if (rest.length > 0) {
    context.stderr(dbUsage());
    return 1;
  }

  switch (subcommand) {
    case "status":
      return statusCommand(context, dependencies);
    case "reindex":
      return reindexCommand(context, dependencies);
    default:
      context.stderr(`Unknown db command: ${subcommand ?? ""}`);
      context.stderr(dbUsage());
      return 1;
  }
}

export function dbUsage(): string {
  return ["Usage: baton db <command>", "", "Commands:", "  baton db status", "  baton db reindex"].join("\n");
}

async function statusCommand(context: CommandContext, dependencies: DbCommandDependencies): Promise<CommandResult> {
  const opened = await openRunIndex(context, dependencies);
  context.stdout(`DB path: ${opened.path}`);

  if (opened.db === undefined) {
    context.stdout("SQLite: unavailable; Baton will use run.json file scanning.");
    return 0;
  }

  try {
    const count = await opened.index.count();
    context.stdout("SQLite: available");
    context.stdout(`runs rows: ${count}`);
    return 0;
  } finally {
    await opened.db.close();
  }
}

async function reindexCommand(context: CommandContext, dependencies: DbCommandDependencies): Promise<CommandResult> {
  const opened = await openRunIndex(context, dependencies);
  if (opened.db === undefined) {
    context.stderr(`SQLite is unavailable for ${opened.path}; run.json files were not modified.`);
    return 1;
  }

  try {
    const result = await opened.index.reindex(context.cwd);
    context.stdout(`Reindexed ${result.indexed} runs into ${opened.path}.`);
    if (result.skipped > 0) {
      context.stdout(`Skipped ${result.skipped} invalid run directories.`);
    }
    return 0;
  } finally {
    await opened.db.close();
  }
}

async function openRunIndex(
  context: CommandContext,
  dependencies: DbCommandDependencies
): Promise<{ path: string; db: DbClient | undefined; index: RunIndex }> {
  const path = batonDbPath(context.cwd);
  await mkdir(workspaceDir(context.cwd), { recursive: true });
  const db = await (dependencies.openDatabase ?? openDatabase)({ path });
  return {
    path,
    db,
    index: new RunIndex({ db: db ?? unavailableDbClient() })
  };
}

function unavailableDbClient(): DbClient {
  return {
    async execute(_sql: string, _params: DbQueryParams = []): Promise<void> {
      throw new Error("SQLite is unavailable.");
    },
    async query<T extends Record<string, unknown>>(_sql: string, _params: DbQueryParams = []): Promise<T[]> {
      throw new Error("SQLite is unavailable.");
    },
    async close(): Promise<void> {
      return undefined;
    }
  };
}
