import { describe, expect, it } from "vitest";

import { JournalNoteMeta } from "../src/index.js";

describe("JournalNoteMeta", () => {
  it("validates Dataview-friendly journal note metadata", () => {
    const parsed = JournalNoteMeta.parse({
      runId: "run-1",
      status: "planned",
      dryRun: true,
      workflow: "default",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:01:00.000Z",
      outcome: "planned",
      roles: ["analyst", "implementer"],
      workers: {
        analyst: "stub",
        implementer: "codex"
      },
      stepCount: 2,
      tags: ["baton", "baton/planned", "baton/dry-run"]
    });

    expect(parsed.runId).toBe("run-1");
    expect(parsed.workers.implementer).toBe("codex");
  });

  it("rejects missing required fields and unsupported statuses", () => {
    expect(
      JournalNoteMeta.safeParse({
        runId: "run-1",
        status: "queued",
        dryRun: true,
        workflow: "default",
        createdAt: "2026-06-15T00:00:00.000Z",
        roles: [],
        workers: {},
        stepCount: 0,
        tags: ["baton"]
      }).success
    ).toBe(false);

    expect(
      JournalNoteMeta.safeParse({
        status: "planned",
        dryRun: true,
        workflow: "default",
        createdAt: "2026-06-15T00:00:00.000Z",
        roles: [],
        workers: {},
        stepCount: 0,
        tags: ["baton"]
      }).success
    ).toBe(false);
  });
});
