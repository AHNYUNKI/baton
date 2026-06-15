export type DbQueryParams = readonly unknown[];

export type DbClient = {
  execute(sql: string, params?: DbQueryParams): Promise<void>;
  query<T extends Record<string, unknown>>(sql: string, params?: DbQueryParams): Promise<T[]>;
  close(): Promise<void>;
};
