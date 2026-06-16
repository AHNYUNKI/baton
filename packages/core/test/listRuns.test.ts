import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listRuns, summarizeRuns } from "../src/index.js";
import type { Run } from "@baton/schemas";

describe("listRuns", () => {
  it("returns schema-validated runs in deterministic order", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-"));
    await writeRun(cwd, runFixture({ id: "run-c", createdAt: "2026-06-15T00:00:00.000Z" }));
    await writeRun(cwd, runFixture({ id: "run-latest", createdAt: "2026-06-16T00:00:00.000Z" }));
    await writeRun(cwd, runFixture({ id: "run-a", createdAt: "2026-06-15T00:00:00.000Z" }));

    const result = await listRuns({ cwd });

    expect(result.skipped).toBe(0);
    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["run-latest", "run-a", "run-c"]);
    expect(result.runs[0]?.directory).toBe(path.join(cwd, ".baton", "runs", "run-latest"));
  });

  it("applies status filtering before limit", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-"));
    await writeRun(cwd, runFixture({ id: "completed-old", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }));
    await writeRun(cwd, runFixture({ id: "failed-new", status: "failed", createdAt: "2026-06-17T00:00:00.000Z" }));
    await writeRun(cwd, runFixture({ id: "completed-new", status: "completed", createdAt: "2026-06-16T00:00:00.000Z" }));

    const result = await listRuns({ cwd, status: "completed", limit: 1 });

    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["completed-new"]);
    expect(result.skipped).toBe(0);
  });

  it("skips missing, malformed, and schema-invalid run state", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-"));
    await writeRun(cwd, runFixture({ id: "valid" }));
    await writeFile(path.join(cwd, ".baton", "runs", "note.md"), "# Not a run\n", "utf8");
    await mkdir(path.join(cwd, ".baton", "runs", "missing-run-json"), { recursive: true });
    await mkdir(path.join(cwd, ".baton", "runs", "bad-json"), { recursive: true });
    await mkdir(path.join(cwd, ".baton", "runs", "bad-schema"), { recursive: true });
    await writeFile(path.join(cwd, ".baton", "runs", "bad-json", "run.json"), "{", "utf8");
    await writeFile(path.join(cwd, ".baton", "runs", "bad-schema", "run.json"), JSON.stringify({ id: 1 }), "utf8");

    const result = await listRuns({ cwd });

    expect(result.runs.map((loadedRun) => loadedRun.run.id)).toEqual(["valid"]);
    expect(result.skipped).toBe(3);
  });

  it("returns an empty result when no run directory exists", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-list-runs-"));

    await expect(listRuns({ cwd })).resolves.toEqual({ runs: [], skipped: 0 });
  });
});

describe("summarizeRuns", () => {
  it("counts total runs and runs by status", () => {
    const runs = [
      { run: runFixture({ id: "planned", status: "planned" }), directory: "/runs/planned" },
      { run: runFixture({ id: "completed-1", status: "completed" }), directory: "/runs/completed-1" },
      { run: runFixture({ id: "completed-2", status: "completed" }), directory: "/runs/completed-2" },
      { run: runFixture({ id: "failed", status: "failed" }), directory: "/runs/failed" }
    ];

    expect(summarizeRuns(runs)).toEqual({
      total: 4,
      byStatus: {
        planned: 1,
        running: 0,
        "awaiting-approval": 0,
        completed: 2,
        failed: 1,
        cancelled: 0
      }
    });
  });
});

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
