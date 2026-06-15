import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactStore, RunStore, fixedClock } from "../src/index.js";
import type { Run } from "@baton/schemas";

function runFixture(): Run {
  return {
    id: "run-1",
    request: "Build Baton",
    workflowId: "default",
    status: "running",
    dryRun: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    steps: [{ id: "analyze", type: "analyze", status: "planned" }]
  };
}

describe("RunStore", () => {
  it("saves run.json atomically and loads it through the schema", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-run-store-"));
    const store = new RunStore({
      artifactStore: new ArtifactStore({ workspaceRoot }),
      clock: fixedClock("2026-06-15T00:00:01.000Z")
    });

    const saved = await store.save(runFixture());
    const loaded = await store.load("run-1");
    const runDirectoryEntries = await readdir(path.join(workspaceRoot, ".baton", "runs", "run-1"));

    expect(saved.updatedAt).toBe("2026-06-15T00:00:01.000Z");
    expect(loaded).toEqual(saved);
    expect(runDirectoryEntries.some((entry) => entry.startsWith("run.json.tmp-"))).toBe(false);
  });

  it("reports missing and invalid state clearly", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-run-store-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new RunStore({ artifactStore });

    await expect(store.load("missing")).rejects.toThrow("Run state not found: missing");

    await artifactStore.ensureRunDir("bad");
    await writeFile(path.join(artifactStore.getRunDir("bad"), "run.json"), "{\"id\": 1}", "utf8");
    await expect(store.load("bad")).rejects.toThrow("Invalid run state for bad");
  });

  it("writes parseable json", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-run-store-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:01.000Z") });

    await store.save(runFixture());

    expect(JSON.parse(await readFile(path.join(artifactStore.getRunDir("run-1"), "run.json"), "utf8"))).toMatchObject({
      id: "run-1",
      updatedAt: "2026-06-15T00:00:01.000Z"
    });
  });

  it("marks a run as cleaned while preserving the run record", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-run-store-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:01.000Z") });
    await store.save({ ...runFixture(), status: "completed" });

    const cleaned = await store.markCleaned("run-1");

    expect(cleaned.cleanedAt).toBe("2026-06-15T00:00:01.000Z");
    expect((await store.load("run-1")).cleanedAt).toBe("2026-06-15T00:00:01.000Z");
    expect(await readFile(path.join(artifactStore.getRunDir("run-1"), "run.json"), "utf8")).toContain("cleanedAt");
  });
});
