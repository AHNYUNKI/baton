import { describe, expect, it } from "vitest";

import {
  JsonEnvelopeSchema,
  ProjectListEnvelopeSchema,
  RunListEnvelopeSchema,
  WatchEventEnvelopeSchema,
  WatchEventSchema,
  makeEnvelope,
  TeamRunEnvelopeSchema,
  TeamRunListEnvelopeSchema,
  TeamRunStreamEventSchema,
  type RunSummaryJson,
  type TeamRun
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

  it("validates project-list envelopes", () => {
    const envelope = makeEnvelope("project-list", [
      {
        id: "project-1",
        name: "Baton",
        source: { kind: "github", value: "https://github.com/example/baton" },
        agentIds: ["codex", "claude"],
        leadAgentId: "claude",
        createdAt: "2026-06-15T00:00:00.000Z"
      }
    ]);

    expect(ProjectListEnvelopeSchema.parse(envelope).data).toHaveLength(1);
  });

  it("validates team-run and team-run-list envelopes", () => {
    const teamRun = teamRunFixture();
    const summary = {
      teamRunId: teamRun.id,
      projectId: teamRun.projectId,
      status: teamRun.status,
      createdAt: teamRun.createdAt,
      updatedAt: teamRun.updatedAt,
      roleCount: teamRun.roles.length,
      completedRoleCount: 0
    };

    expect(TeamRunEnvelopeSchema.parse(makeEnvelope("team-run", teamRun))).toEqual({
      schemaVersion: 1,
      kind: "team-run",
      data: teamRun
    });
    expect(TeamRunListEnvelopeSchema.parse(makeEnvelope("team-run-list", { teamRuns: [summary] }))).toEqual({
      schemaVersion: 1,
      kind: "team-run-list",
      data: { teamRuns: [summary] }
    });
    expect(TeamRunEnvelopeSchema.safeParse(makeEnvelope("team-run", { ...teamRun, status: "waiting" })).success).toBe(false);
    expect(TeamRunListEnvelopeSchema.safeParse(makeEnvelope("team-run-list", { teamRuns: [{ ...summary, roleCount: -1 }] })).success).toBe(false);
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

  it("validates team-run stream events in event envelopes", () => {
    const outputEvent = {
      type: "teamRun.role.output",
      runId: "team-run-1",
      roleId: "implementer",
      chunk: "live output\n"
    };
    const completedEvent = {
      type: "teamRun.role.completed",
      runId: "team-run-1",
      roleId: "implementer",
      exitCode: 0,
      usage: { inputTokens: 1, outputTokens: 2, estimated: true }
    };
    const runEvent = {
      type: "teamRun.completed",
      runId: "team-run-1"
    };

    expect(TeamRunStreamEventSchema.parse(outputEvent)).toEqual(outputEvent);
    expect(WatchEventEnvelopeSchema.parse(makeEnvelope("event", outputEvent))).toEqual({
      schemaVersion: 1,
      kind: "event",
      data: outputEvent
    });
    expect(WatchEventEnvelopeSchema.parse(makeEnvelope("event", completedEvent)).data).toEqual(completedEvent);
    expect(WatchEventEnvelopeSchema.parse(makeEnvelope("event", runEvent)).data).toEqual(runEvent);
    expect(TeamRunStreamEventSchema.safeParse({ type: "run.created", runId: "run-1" }).success).toBe(false);
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

function teamRunFixture(): TeamRun {
  return {
    id: "team-run-1",
    projectId: "project-1",
    status: "awaiting-approval",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:01.000Z",
    order: ["lead"],
    roles: [
      {
        roleId: "lead",
        name: "Lead",
        assignedAgentId: "claude",
        status: "completed",
        explanation: "## 학습 설명\n- 무엇을 했나: 리드 역할을 설명했습니다.",
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          estimated: true
        }
      }
    ]
  };
}
