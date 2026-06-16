import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RunIndex, listRuns, type DbClient, type DbQueryParams } from "../src/index.js";
import type { Run, RunStatus } from "@baton/schemas";

describe("listRuns with an index", () => {
  it("returns the same result as the file scan when the index is current", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-index-"));
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });
    const runs = [
      runFixture({ id: "completed-old", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }),
      runFixture({ id: "failed-new", status: "failed", createdAt: "2026-06-17T00:00:00.000Z" }),
      runFixture({ id: "completed-new", status: "completed", createdAt: "2026-06-16T00:00:00.000Z" })
    ];

    for (const run of runs) {
      await writeRun(cwd, run);
      await index.upsert(run);
    }

    const fromFiles = await listRuns({ cwd, status: "completed", limit: 1 });
    const fromIndex = await listRuns({ cwd, status: "completed", limit: 1, index });

    expect(fromIndex).toEqual(fromFiles);
  });

  it("falls back to files when the index is empty", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-empty-index-"));
    const index = new RunIndex({ db: new FakeRunDbClient() });
    await writeRun(cwd, runFixture({ id: "run-1" }));

    const result = await listRuns({ cwd, index });

    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["run-1"]);
    expect(result.skipped).toBe(0);
  });

  it("falls back to files when the index is missing run directories", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-partial-index-"));
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });
    const indexed = runFixture({ id: "indexed", createdAt: "2026-06-15T00:00:00.000Z" });
    const missing = runFixture({ id: "missing", createdAt: "2026-06-16T00:00:00.000Z" });
    await writeRun(cwd, indexed);
    await writeRun(cwd, missing);
    await index.upsert(indexed);

    const result = await listRuns({ cwd, index });

    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["missing", "indexed"]);
  });

  it("falls back to files when the index query fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-bad-index-"));
    await writeRun(cwd, runFixture({ id: "run-1" }));

    const result = await listRuns({
      cwd,
      index: {
        async list() {
          throw new Error("index unavailable");
        }
      }
    });

    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["run-1"]);
  });

  it("falls back to files when an indexed row no longer matches run.json", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-stale-index-"));
    const db = new FakeRunDbClient();
    const index = new RunIndex({ db });
    await index.upsert(runFixture({ id: "run-1", status: "running" }));
    await writeRun(cwd, runFixture({ id: "run-1", status: "completed" }));

    const result = await listRuns({ cwd, index });

    expect(result.runs.map((loadedRun) => loadedRun.run.status)).toEqual(["completed"]);
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

  public async execute(sql: string, params: DbQueryParams = []): Promise<void> {
    if (sql.includes("CREATE TABLE IF NOT EXISTS runs")) {
      return;
    }
    if (sql.includes("INSERT INTO runs")) {
      const row = toFakeRunRow(params);
      this.rows.set(row.id, row);
      return;
    }
    if (sql.trim() === "DELETE FROM runs") {
      this.rows.clear();
      return;
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  }

  public async query<T extends Record<string, unknown>>(sql: string, params: DbQueryParams = []): Promise<T[]> {
    if (sql.includes("COUNT(*) AS count")) {
      return [{ count: this.rows.size } as unknown as T];
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
  return runStatus(stringParam(params, index));
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
