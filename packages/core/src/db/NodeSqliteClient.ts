import type { DbClient, DbQueryParams } from "./DbClient.js";

export type SqliteStatementSync = {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
};

export type SqliteDatabaseSync = {
  prepare(sql: string): SqliteStatementSync;
  close(): void;
};

export type SqliteDatabaseSyncConstructor = new (path: string) => SqliteDatabaseSync;

export type NodeSqliteModule = {
  DatabaseSync: SqliteDatabaseSyncConstructor;
};

export type NodeSqliteClientOptions = {
  path: string;
  sqlite: NodeSqliteModule;
};

export class NodeSqliteClient implements DbClient {
  private readonly database: SqliteDatabaseSync;

  public constructor(options: NodeSqliteClientOptions) {
    this.database = new options.sqlite.DatabaseSync(options.path);
  }

  public async execute(sql: string, params: DbQueryParams = []): Promise<void> {
    this.database.prepare(sql).run(...[...params]);
  }

  public async query<T extends Record<string, unknown>>(sql: string, params: DbQueryParams = []): Promise<T[]> {
    return this.database.prepare(sql).all(...[...params]) as T[];
  }

  public async close(): Promise<void> {
    this.database.close();
  }
}

export function isNodeSqliteModule(value: unknown): value is NodeSqliteModule {
  if (typeof value !== "object" || value === null || !("DatabaseSync" in value)) {
    return false;
  }

  return typeof value.DatabaseSync === "function";
}
