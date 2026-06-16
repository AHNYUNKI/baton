import type { DbClient } from "./DbClient.js";
import { NodeSqliteClient, isNodeSqliteModule } from "./NodeSqliteClient.js";

export type OpenDatabaseOptions = {
  path: string;
  loadSqliteModule?: () => Promise<unknown>;
};

const nodeSqliteModuleName = "node:sqlite";

export async function openDatabase(options: OpenDatabaseOptions): Promise<DbClient | undefined> {
  try {
    const sqlite = await (options.loadSqliteModule ?? loadNodeSqliteModule)();
    if (!isNodeSqliteModule(sqlite)) {
      return undefined;
    }

    return new NodeSqliteClient({ path: options.path, sqlite });
  } catch {
    return undefined;
  }
}

async function loadNodeSqliteModule(): Promise<unknown> {
  return import(nodeSqliteModuleName);
}
