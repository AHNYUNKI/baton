import type { DbClient, DbQueryParams } from "./DbClient.js";

export type OpenDatabaseOptions = {
  path: string;
};

export function openDatabase(options: OpenDatabaseOptions): DbClient {
  const databasePath = options.path;

  return {
    async execute(_sql: string, _params: DbQueryParams = []): Promise<void> {
      void databasePath;
    },
    async query<T extends Record<string, unknown>>(_sql: string, _params: DbQueryParams = []): Promise<T[]> {
      void databasePath;
      return [];
    },
    async close(): Promise<void> {
      void databasePath;
    }
  };
}
