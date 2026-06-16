import { describe, expect, it } from "vitest";
import {
  AgentProfileSchema,
  ApprovalSchema,
  ArtifactSchema,
  ProjectSchema,
  RunSchema,
  RunStatusSchema,
  RunStepStatusSchema,
  WorkflowSchema
} from "../src/index.js";

describe("@baton/schemas", () => {
  it("validates projects", () => {
    const parsed = ProjectSchema.parse({
      id: "project-1",
      name: "Baton",
      path: "/tmp/baton",
      createdAt: "2026-06-15T00:00:00.000Z"
    });

    expect(parsed.id).toBe("project-1");
    expect(ProjectSchema.safeParse({ name: "missing fields" }).success).toBe(false);
  });

  it("validates agent profiles", () => {
    expect(
      AgentProfileSchema.safeParse({
        id: "implementer",
        role: "implementer",
        name: "Codex Implementer",
        provider: "codex",
        model: "codex"
      }).success
    ).toBe(true);

    const invalid = AgentProfileSchema.safeParse({
      id: "bad",
      role: "unknown",
      name: "Bad",
      provider: "codex"
    });
    expect(invalid.success).toBe(false);
  });

  it("validates workflows", () => {
    const workflow = WorkflowSchema.parse({
      id: "default",
      name: "Default",
      steps: [{ id: "analyze", name: "Analyze", type: "analyze", role: "analyst" }]
    });

    expect(workflow.steps).toHaveLength(1);
    expect(WorkflowSchema.safeParse({ id: "empty", name: "Empty", steps: [] }).success).toBe(false);
  });

  it("validates runs", () => {
    expect(
      RunSchema.safeParse({
        id: "run-1",
        request: "Build it",
        workflowId: "default",
        status: "awaiting-approval",
        dryRun: true,
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:01.000Z",
        worktreePath: "/tmp/worktree",
        baseBranch: "main",
        steps: [
          {
            id: "analyze",
            type: "analyze",
            status: "completed",
            startedAt: "2026-06-15T00:00:00.000Z",
            completedAt: "2026-06-15T00:00:01.000Z",
            reason: "done",
            artifacts: ["/tmp/artifact.md"],
            attempts: 1
          }
        ]
      }).success
    ).toBe(true);

    expect(RunStatusSchema.options).toContain("awaiting-approval");
    expect(RunStepStatusSchema.safeParse("skipped").success).toBe(true);
    expect(RunStepStatusSchema.safeParse("cancelled").success).toBe(false);
    expect(
      RunSchema.safeParse({
        id: "run-1",
        request: "Build it",
        workflowId: "default",
        status: "running",
        dryRun: true,
        createdAt: "2026-06-15T00:00:00.000Z",
        steps: [{ id: "test", type: "test", status: "running", attempts: 0 }]
      }).success
    ).toBe(false);
    expect(
      RunSchema.safeParse({
        id: "run-1",
        request: "Build it",
        workflowId: "default",
        status: "queued",
        dryRun: true,
        createdAt: "2026-06-15T00:00:00.000Z",
        steps: []
      }).success
    ).toBe(false);
  });

  it("parses v0.1 run json without v0.2 optional fields", () => {
    expect(
      RunSchema.safeParse({
        id: "run-1",
        request: "Build it",
        workflowId: "default",
        status: "planned",
        dryRun: true,
        createdAt: "2026-06-15T00:00:00.000Z",
        steps: [{ id: "analyze", type: "analyze", status: "planned" }]
      }).success
    ).toBe(true);
  });

  it("validates artifacts", () => {
    expect(
      ArtifactSchema.safeParse({
        runId: "run-1",
        name: "request.md",
        path: ".baton/runs/run-1/request.md",
        kind: "request"
      }).success
    ).toBe(true);

    expect(ArtifactSchema.safeParse({ runId: "run-1", name: "x", path: "x", kind: "binary" }).success).toBe(false);
  });

  it("validates approvals", () => {
    expect(
      ApprovalSchema.safeParse({
        runId: "run-1",
        stepId: "approve",
        status: "approved",
        createdAt: "2026-06-15T00:00:00.000Z",
        decidedAt: "2026-06-15T00:01:00.000Z",
        note: "Looks good"
      }).success
    ).toBe(true);

    expect(ApprovalSchema.safeParse({ runId: "run-1", stepId: "approve", status: "waiting" }).success).toBe(false);
  });
});
