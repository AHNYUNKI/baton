import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactStore, TeamRunStore, fixedClock } from "../../src/index.js";
import type { TeamRun } from "@baton/schemas";

describe("TeamRunStore", () => {
  it("saves team-run.json atomically and loads it through the schema", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-team-run-store-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new TeamRunStore({
      artifactStore,
      clock: fixedClock("2026-06-17T00:00:01.000Z")
    });

    const saved = await store.save(teamRunFixture());
    const loaded = await store.load("team-run-1");
    const runDirectoryEntries = await readdir(path.join(workspaceRoot, ".baton", "runs", "team-run-1"));

    expect(saved.updatedAt).toBe("2026-06-17T00:00:01.000Z");
    expect(loaded).toEqual(saved);
    expect(runDirectoryEntries.some((entry) => entry.startsWith("team-run.json.tmp-"))).toBe(false);
  });

  it("reports missing and invalid state clearly", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-team-run-store-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new TeamRunStore({ artifactStore });

    await expect(store.load("missing")).rejects.toThrow("TeamRun state not found: missing");

    await artifactStore.ensureRunDir("bad");
    await writeFile(path.join(artifactStore.getRunDir("bad"), "team-run.json"), "{\"id\": 1}", "utf8");
    await expect(store.load("bad")).rejects.toThrow("Invalid TeamRun state for bad");
  });

  it("lists team runs and filters by project id", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-team-run-store-list-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const store = new TeamRunStore({ artifactStore, clock: fixedClock("2026-06-17T00:00:01.000Z") });

    await store.save(teamRunFixture({ id: "team-run-2", projectId: "project-2", createdAt: "2026-06-17T00:00:02.000Z" }));
    await store.save(teamRunFixture({ id: "team-run-1", projectId: "project-1", createdAt: "2026-06-17T00:00:01.000Z" }));
    await artifactStore.writeArtifact("run-1", "run.json", "{}");

    expect((await store.list()).map((teamRun) => teamRun.id)).toEqual(["team-run-1", "team-run-2"]);
    expect((await store.list("project-2")).map((teamRun) => teamRun.id)).toEqual(["team-run-2"]);
    expect(await readFile(path.join(artifactStore.getRunDir("team-run-1"), "team-run.json"), "utf8")).toContain("\"id\": \"team-run-1\"");
  });
});

function teamRunFixture(overrides: Partial<TeamRun> = {}): TeamRun {
  return {
    id: "team-run-1",
    projectId: "project-1",
    status: "awaiting-approval",
    createdAt: "2026-06-17T00:00:00.000Z",
    order: ["lead"],
    roles: [
      {
        roleId: "lead",
        name: "Lead",
        assignedAgentId: "codex",
        status: "planned"
      }
    ],
    ...overrides
  };
}
