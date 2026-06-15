import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ArtifactStore } from "../src/index.js";

describe("ArtifactStore", () => {
  it("creates run directories with logs and round-trips artifacts", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-artifacts-"));
    const store = new ArtifactStore({ workspaceRoot });

    const artifactPath = await store.writeArtifact("run-1", "logs/output.log", "hello");
    const content = await store.readArtifact("run-1", "logs/output.log");

    expect(artifactPath).toBe(path.join(workspaceRoot, ".baton", "runs", "run-1", "logs", "output.log"));
    expect(content).toBe("hello");
  });

  it("rejects artifact paths that escape the run directory", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-artifacts-"));
    const store = new ArtifactStore({ workspaceRoot });

    await expect(store.writeArtifact("run-1", "../outside.txt", "no")).rejects.toThrow("escapes run directory");
  });
});
