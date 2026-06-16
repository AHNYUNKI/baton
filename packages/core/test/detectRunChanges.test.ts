import { describe, expect, it } from "vitest";

import { detectRunChanges } from "../src/index.js";
import type { RunSummaryJson } from "@baton/schemas";

describe("detectRunChanges", () => {
  it("detects created runs", () => {
    expect(detectRunChanges([], [runSummaryFixture({ runId: "run-a" })])).toEqual([
      {
        type: "run.created",
        runId: "run-a",
        status: "running",
        run: runSummaryFixture({ runId: "run-a" })
      }
    ]);
  });

  it("detects removed runs", () => {
    expect(detectRunChanges([runSummaryFixture({ runId: "run-a", status: "failed" })], [])).toEqual([
      {
        type: "run.removed",
        runId: "run-a",
        status: "failed",
        run: runSummaryFixture({ runId: "run-a", status: "failed" })
      }
    ]);
  });

  it("detects status changes before update changes", () => {
    expect(
      detectRunChanges(
        [runSummaryFixture({ runId: "run-a", status: "running", updatedAt: "2026-06-15T00:00:00.000Z" })],
        [runSummaryFixture({ runId: "run-a", status: "completed", updatedAt: "2026-06-15T00:01:00.000Z" })]
      )
    ).toEqual([
      {
        type: "run.status-changed",
        runId: "run-a",
        previousStatus: "running",
        status: "completed",
        run: runSummaryFixture({ runId: "run-a", status: "completed", updatedAt: "2026-06-15T00:01:00.000Z" })
      }
    ]);
  });

  it("detects updated runs when status is unchanged", () => {
    expect(
      detectRunChanges(
        [runSummaryFixture({ runId: "run-a", status: "running", updatedAt: "2026-06-15T00:00:00.000Z" })],
        [runSummaryFixture({ runId: "run-a", status: "running", updatedAt: "2026-06-15T00:01:00.000Z" })]
      )
    ).toEqual([
      {
        type: "run.updated",
        runId: "run-a",
        status: "running",
        previousUpdatedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:01:00.000Z",
        run: runSummaryFixture({ runId: "run-a", status: "running", updatedAt: "2026-06-15T00:01:00.000Z" })
      }
    ]);
  });

  it("returns no events when summaries do not change", () => {
    const runs = [runSummaryFixture({ runId: "run-a" })];

    expect(detectRunChanges(runs, runs)).toEqual([]);
  });

  it("sorts mixed events by run id deterministically", () => {
    const previous = [
      runSummaryFixture({ runId: "run-c", status: "running" }),
      runSummaryFixture({ runId: "run-a", status: "completed" }),
      runSummaryFixture({ runId: "run-b", status: "running", updatedAt: "2026-06-15T00:00:00.000Z" })
    ];
    const current = [
      runSummaryFixture({ runId: "run-d", status: "planned" }),
      runSummaryFixture({ runId: "run-c", status: "completed" }),
      runSummaryFixture({ runId: "run-b", status: "running", updatedAt: "2026-06-15T00:01:00.000Z" })
    ];

    expect(detectRunChanges(previous, current).map((event) => [event.runId, event.type])).toEqual([
      ["run-a", "run.removed"],
      ["run-b", "run.updated"],
      ["run-c", "run.status-changed"],
      ["run-d", "run.created"]
    ]);
  });
});

function runSummaryFixture(overrides: Partial<RunSummaryJson> = {}): RunSummaryJson {
  return {
    runId: "run-1",
    status: "running",
    dryRun: false,
    workflowId: "default",
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    stepCount: 1,
    ...overrides
  };
}
