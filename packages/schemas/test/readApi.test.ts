import { describe, expect, it } from "vitest";

import {
  JsonEnvelopeSchema,
  RunListEnvelopeSchema,
  WatchEventEnvelopeSchema,
  WatchEventSchema,
  makeEnvelope,
  type RunSummaryJson
} from "../src/index.js";

describe("read API schemas", () => {
  it("validates versioned JSON envelopes", () => {
    const envelope = makeEnvelope("state", { total: 0 });

    expect(JsonEnvelopeSchema.parse(envelope)).toEqual({
      schemaVersion: 1,
      kind: "state",
      data: { total: 0 }
    });
    expect(JsonEnvelopeSchema.safeParse({ schemaVersion: 2, kind: "state", data: {} }).success).toBe(false);
    expect(JsonEnvelopeSchema.safeParse({ schemaVersion: 1, kind: "", data: {} }).success).toBe(false);
  });

  it("validates run-list envelopes", () => {
    const summary = runSummaryFixture({ runId: "run-1" });

    expect(RunListEnvelopeSchema.parse(makeEnvelope("run-list", { runs: [summary], skipped: 0 }))).toEqual({
      schemaVersion: 1,
      kind: "run-list",
      data: { runs: [summary], skipped: 0 }
    });
    expect(RunListEnvelopeSchema.safeParse(makeEnvelope("run-list", { runs: [summary], skipped: -1 })).success).toBe(false);
  });

  it("validates watch events and event envelopes", () => {
    const created = {
      type: "run.created",
      runId: "run-1",
      status: "running",
      run: runSummaryFixture({ runId: "run-1", status: "running" })
    };
    const changed = {
      type: "run.status-changed",
      runId: "run-1",
      previousStatus: "running",
      status: "completed",
      run: runSummaryFixture({ runId: "run-1", status: "completed" })
    };
    const updated = {
      type: "run.updated",
      runId: "run-1",
      status: "running",
      previousUpdatedAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:01:00.000Z",
      run: runSummaryFixture({ runId: "run-1", updatedAt: "2026-06-15T00:01:00.000Z" })
    };
    const removed = {
      type: "run.removed",
      runId: "run-1",
      status: "failed",
      run: runSummaryFixture({ runId: "run-1", status: "failed" })
    };

    expect(WatchEventSchema.parse(created)).toEqual(created);
    expect(WatchEventSchema.parse(changed)).toEqual(changed);
    expect(WatchEventSchema.parse(updated)).toEqual(updated);
    expect(WatchEventSchema.parse(removed)).toEqual(removed);
    expect(WatchEventEnvelopeSchema.parse(makeEnvelope("event", created))).toEqual({
      schemaVersion: 1,
      kind: "event",
      data: created
    });
    expect(WatchEventSchema.safeParse({ type: "run.unknown", runId: "run-1" }).success).toBe(false);
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
