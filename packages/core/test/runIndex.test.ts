import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RunIndex, type DbClient, type DbQueryParams } from "../src/index.js";
import type { Run, RunStatus } from "@baton/schemas";

describe("RunIndex", () => {
  it("upserts run metadata idempotently", async () => {
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });

    await index.upsert(runFixture({ id: "run-1", status: "running", updatedAt: "2026-06-15T00:00:01.000Z" }));
    await index.upsert(runFixture({ id: "run-1", status: "completed", updatedAt: "2026-06-15T00:00:02.000Z" }));

    expect(await index.count()).toBe(1);
    expect(db.row("run-1")).toMatchObject({
      id: "run-1",
      status: "completed",
      dry_run: 0,
      workflow_id: "default",
      step_count: 1,
      outcome: "completed"
    });
  });

  it("lists runs with file-scan ordering, status filtering, and limits", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-run-index-"));
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });
    const runs = [
      runFixture({ id: "run-c", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }),
      runFixture({ id: "run-b", status: "failed", createdAt: "2026-06-17T00:00:00.000Z" }),
      runFixture({ id: "run-a", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }),
      runFixture({ id: "run-latest", status: "completed", createdAt: "2026-06-18T00:00:00.000Z" })
    ];

    for (const run of runs) {
      await writeRun(cwd, run);
      await index.upsert(run);
    }

    const result = await index.list({ cwd, status: "completed", limit: 2 });

    expect(result.skipped).toBe(0);
    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["run-latest", "run-a"]);
    expect(result.runs[0]?.directory).toBe(path.join(cwd, ".baton", "runs", "run-latest"));
  });

  it("rebuilds the index from valid run.json files and skips invalid run directories", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-run-index-reindex-"));
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });
    await index.upsert(runFixture({ id: "stale" }));
    await writeRun(cwd, runFixture({ id: "run-1", createdAt: "2026-06-16T00:00:00.000Z" }));
    await writeRun(cwd, runFixture({ id: "run-2", createdAt: "2026-06-17T00:00:00.000Z" }));
    await mkdir(path.join(cwd, ".baton", "runs", "bad-json"), { recursive: true });
    await writeFile(path.join(cwd, ".baton", "runs", "bad-json", "run.json"), "{", "utf8");
    await mkdir(path.join(cwd, ".baton", "runs", "missing-run-json"), { recursive: true });

    const result = await index.reindex(cwd);
    const listed = await index.list({ cwd });

    expect(result).toEqual({ indexed: 2, skipped: 2 });
    expect(await index.count()).toBe(2);
    expect(db.row("stale")).toBeUndefined();
    expect(listed.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["run-2", "run-1"]);
  });
});

type FakeRunRow = {
  id: string;
  status: RunStatus;
  dry_run: number;
  workflow_id: string;
  created_at: string;
  updated_at: string | null;
  step_count: number;
  outcome: RunStatus | null;
};

class FakeRunDbClient implements DbClient {
  private readonly rows = new Map<string, FakeRunRow>();

  public row(id: string): FakeRunRow | undefined {
    return this.rows.get(id);
  }

  public async execute(sql: string, params: DbQueryParams = []): Promise<void> {
    if (sql.includes("CREATE TABLE IF NOT EXISTS runs")) {
      return;
    }
    if (sql.trim() === "DELETE FROM runs") {
      this.rows.clear();
      return;
    }
    if (sql.includes("INSERT INTO runs")) {
      const row = toFakeRunRow(params);
      this.rows.set(row.id, row);
      return;
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }

  public async query<T extends Record<string, unknown>>(sql: string, params: DbQueryParams = []): Promise<T[]> {
    if (sql.includes("COUNT(*) AS count")) {
      return [{ count: this.rows.size } as unknown as T];
    }

    if (!sql.includes("FROM runs")) {
      throw new Error(`Unexpected SQL: ${sql}`);
    }

    let rows = [...this.rows.values()];
    if (sql.includes("WHERE status = ?")) {
      rows = rows.filter((row) => row.status === params[0]);
    }
    rows = rows.sort(compareRows);
    if (sql.includes("LIMIT ?")) {
      rows = rows.slice(0, Number(params[params.length - 1]));
    }

    return rows.map((row) => ({ ...row }) as unknown as T);
  }

  public async close(): Promise<void> {
    return undefined;
  }
}

function toFakeRunRow(params: DbQueryParams): FakeRunRow {
  return {
    id: stringParam(params, 0),
    status: runStatusParam(params, 1),
    dry_run: numberParam(params, 2),
    workflow_id: stringParam(params, 3),
    created_at: stringParam(params, 4),
    updated_at: nullableStringParam(params, 5),
    step_count: numberParam(params, 6),
    outcome: nullableRunStatusParam(params, 7)
  };
}

function compareRows(left: FakeRunRow, right: FakeRunRow): number {
  const createdAtDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

async function writeRun(cwd: string, run: Run): Promise<void> {
  const runDirectory = path.join(cwd, ".baton", "runs", run.id);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(path.join(runDirectory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

function runFixture(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    request: "Build Baton",
    workflowId: "default",
    status: "running",
    dryRun: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    steps: [{ id: "analyze", type: "analyze", status: "planned" }],
    ...overrides
  };
}

function stringParam(params: DbQueryParams, index: number): string {
  const value = params[index];
  if (typeof value !== "string") {
    throw new Error(`Expected string param at ${index}`);
  }
  return value;
}

function nullableStringParam(params: DbQueryParams, index: number): string | null {
  const value = params[index];
  if (value === null || typeof value === "string") {
    return value;
  }
  throw new Error(`Expected nullable string param at ${index}`);
}

function numberParam(params: DbQueryParams, index: number): number {
  const value = params[index];
  if (typeof value !== "number") {
    throw new Error(`Expected number param at ${index}`);
  }
  return value;
}

function runStatusParam(params: DbQueryParams, index: number): RunStatus {
  const value = stringParam(params, index);
  return runStatus(value);
}

function nullableRunStatusParam(params: DbQueryParams, index: number): RunStatus | null {
  const value = params[index];
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return runStatus(value);
  }
  throw new Error(`Expected nullable run status param at ${index}`);
}

function runStatus(value: string): RunStatus {
  const parsed = ["planned", "running", "awaiting-approval", "completed", "failed", "cancelled"].find((status) => status === value);
  if (parsed === undefined) {
    throw new Error(`Invalid run status: ${value}`);
  }

  return parsed as RunStatus;
}
