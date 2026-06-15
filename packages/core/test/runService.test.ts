import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ArtifactStore,
  RunService,
  fixedClock,
  type WorktreeManager,
  type WorkerAdapter
} from "../src/index.js";
import type { Workflow } from "@baton/schemas";

const workflows: Workflow[] = [
  {
    id: "default",
    name: "Default",
    steps: [
      { id: "analyze", name: "Analyze", type: "analyze", role: "analyst" },
      { id: "implement", name: "Implement", type: "implement", role: "implementer" }
    ]
  }
];

describe("RunService", () => {
  it("creates dry-run artifacts without invoking worker or worktree manager", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-run-"));
    const worker: WorkerAdapter = { run: vi.fn() };
    const worktreeManager: WorktreeManager = {
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      list: vi.fn()
    };
    const service = new RunService({
      artifactStore: new ArtifactStore({ workspaceRoot }),
      workflows,
      clock: fixedClock("2026-06-15T00:00:00.000Z"),
      idGenerator: () => "run-1",
      worker,
      worktreeManager
    });

    const result = await service.createRun("Build Baton", { dryRun: true });

    expect(result.run.status).toBe("planned");
    expect(result.plannedSteps.map((step) => step.id)).toEqual(["analyze", "implement"]);
    expect(await new ArtifactStore({ workspaceRoot }).readArtifact("run-1", "request.md")).toBe("Build Baton\n");
    expect(JSON.parse(await new ArtifactStore({ workspaceRoot }).readArtifact("run-1", "run.json"))).toMatchObject({
      id: "run-1",
      status: "planned",
      dryRun: true
    });
    expect(worker.run).not.toHaveBeenCalled();
    expect(worktreeManager.createWorktree).not.toHaveBeenCalled();
  });
});
