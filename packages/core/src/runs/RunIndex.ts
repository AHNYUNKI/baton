import path from "node:path";

import { RunStatusSchema, type Run, type RunStatus } from "@baton/schemas";
import { z } from "zod";

import type { DbClient } from "../db/DbClient.js";
import { DDL_STATEMENTS } from "../db/ddl.js";
import { runDir } from "../config/paths.js";
import { compareRunIds, listRunsFromFiles, readRunFile, type ListRunsResult } from "./listRuns.js";

export type RunIndexOptions = {
  db: DbClient;
};

export type RunIndexListOptions = {
  cwd: string;
  status?: RunStatus;
  limit?: number;
};

export type RunReindexResult = {
  indexed: number;
  skipped: number;
};

const sqliteIntegerSchema = z.preprocess((value) => (typeof value === "bigint" ? Number(value) : value), z.number().int());
const sqliteNonnegativeIntegerSchema = z.preprocess(
  (value) => (typeof value === "bigint" ? Number(value) : value),
  z.number().int().nonnegative()
);

const RunIndexRowSchema = z.object({
  id: z.string().min(1),
  status: RunStatusSchema,
  dry_run: sqliteIntegerSchema,
  workflow_id: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1).nullable(),
  step_count: sqliteNonnegativeIntegerSchema,
  outcome: RunStatusSchema.nullable()
});

const CountRowSchema = z.object({
  count: sqliteNonnegativeIntegerSchema
});

type RunIndexRow = z.infer<typeof RunIndexRowSchema>;

export class RunIndex {
  private readonly db: DbClient;
  private schemaEnsured = false;

  public constructor(options: RunIndexOptions) {
    this.db = options.db;
  }

  public async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) {
      return;
    }

    await this.db.execute(DDL_STATEMENTS.runs);
    this.schemaEnsured = true;
  }

  public async upsert(run: Run): Promise<void> {
    await this.ensureSchema();
    await this.db.execute(
      `
        INSERT INTO runs (
          id,
          status,
          dry_run,
          workflow_id,
          created_at,
          updated_at,
          step_count,
          outcome
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          dry_run = excluded.dry_run,
          workflow_id = excluded.workflow_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          step_count = excluded.step_count,
          outcome = excluded.outcome;
      `,
      [
        run.id,
        run.status,
        run.dryRun ? 1 : 0,
        run.workflowId,
        run.createdAt,
        run.updatedAt ?? null,
        run.steps.length,
        outcomeForRun(run)
      ]
    );
  }

  public async list(options: RunIndexListOptions): Promise<ListRunsResult> {
    await this.ensureSchema();
    const rows = await this.queryRows(options);
    const runs: ListRunsResult["runs"] = [];

    for (const row of rows) {
      const directory = runDir(row.id, options.cwd);
      const run = await readRunFile(path.join(directory, "run.json"));
      if (run === undefined || !rowMatchesRun(row, run)) {
        throw new RunIndexStaleError(row.id);
      }
      runs.push({ run, directory });
    }

    return { runs, skipped: 0 };
  }

  public async count(): Promise<number> {
    await this.ensureSchema();
    const rows = await this.db.query<Record<string, unknown>>("SELECT COUNT(*) AS count FROM runs", []);
    const row = rows[0];
    if (row === undefined) {
      return 0;
    }

    return CountRowSchema.parse(row).count;
  }

  public async reindex(cwd: string): Promise<RunReindexResult> {
    const result = await listRunsFromFiles({ cwd });
    await this.ensureSchema();
    await this.db.execute("DELETE FROM runs", []);
    for (const loadedRun of result.runs) {
      await this.upsert(loadedRun.run);
    }

    return {
      indexed: result.runs.length,
      skipped: result.skipped
    };
  }

  private async queryRows(options: RunIndexListOptions): Promise<RunIndexRow[]> {
    const rows = await queryRunRows(this.db, options);
    return rows.map((row) => RunIndexRowSchema.parse(row)).sort(compareRunIndexRows);
  }
}

export class RunIndexStaleError extends Error {
  public constructor(runId: string) {
    super(`Run index entry is stale for run: ${runId}`);
  }
}

function queryRunRows(db: DbClient, options: RunIndexListOptions): Promise<Record<string, unknown>[]> {
  if (options.status !== undefined && options.limit !== undefined) {
    return db.query<Record<string, unknown>>(
      `
        SELECT id, status, dry_run, workflow_id, created_at, updated_at, step_count, outcome
        FROM runs
        WHERE status = ?
        ORDER BY created_at DESC, id ASC
        LIMIT ?
      `,
      [options.status, options.limit]
    );
  }

  if (options.status !== undefined) {
    return db.query<Record<string, unknown>>(
      `
        SELECT id, status, dry_run, workflow_id, created_at, updated_at, step_count, outcome
        FROM runs
        WHERE status = ?
        ORDER BY created_at DESC, id ASC
      `,
      [options.status]
    );
  }

  if (options.limit !== undefined) {
    return db.query<Record<string, unknown>>(
      `
        SELECT id, status, dry_run, workflow_id, created_at, updated_at, step_count, outcome
        FROM runs
        ORDER BY created_at DESC, id ASC
        LIMIT ?
      `,
      [options.limit]
    );
  }

  return db.query<Record<string, unknown>>(
    `
      SELECT id, status, dry_run, workflow_id, created_at, updated_at, step_count, outcome
      FROM runs
      ORDER BY created_at DESC, id ASC
    `,
    []
  );
}

function compareRunIndexRows(left: RunIndexRow, right: RunIndexRow): number {
  const createdAtDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return compareRunIds(left.id, right.id);
}

function rowMatchesRun(row: RunIndexRow, run: Run): boolean {
  return (
    row.id === run.id &&
    row.status === run.status &&
    row.dry_run === (run.dryRun ? 1 : 0) &&
    row.workflow_id === run.workflowId &&
    row.created_at === run.createdAt &&
    row.updated_at === (run.updatedAt ?? null) &&
    row.step_count === run.steps.length &&
    row.outcome === outcomeForRun(run)
  );
}

function outcomeForRun(run: Run): RunStatus | null {
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return run.status;
  }

  return null;
}
