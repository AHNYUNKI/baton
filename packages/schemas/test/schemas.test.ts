import { describe, expect, it } from "vitest";
import {
  AgentProfileSchema,
  ApprovalSchema,
  ArtifactSchema,
  ProjectSchema,
  RunSchema,
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
        status: "planned",
        dryRun: true,
        createdAt: "2026-06-15T00:00:00.000Z",
        steps: [{ id: "analyze", type: "analyze", status: "planned" }]
      }).success
    ).toBe(true);

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
        status: "pending",
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(true);

    expect(ApprovalSchema.safeParse({ runId: "run-1", stepId: "approve", status: "waiting" }).success).toBe(false);
  });
});
