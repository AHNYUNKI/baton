import { describe, expect, it } from "vitest";

import { ProjectSchema, TeamPlanSchema, assertPlanAgents } from "../src/index.js";

const validPlan = {
  roles: [
    {
      id: "planner",
      name: "Planner",
      description: "Plans work",
      assignedAgentId: "claude",
      instructions: "Create a small plan."
    }
  ]
};

describe("TeamPlanSchema", () => {
  it("validates free-form team roles", () => {
    const parsed = TeamPlanSchema.parse(validPlan);

    expect(parsed.roles[0]?.id).toBe("planner");
    expect(parsed.roles[0]?.name).toBe("Planner");
    expect(parsed.roles[0]?.checkpoint).toBeUndefined();
  });

  it("accepts optional role checkpoints", () => {
    const parsed = TeamPlanSchema.parse({
      roles: [
        {
          ...validPlan.roles[0],
          checkpoint: true
        }
      ]
    });

    expect(parsed.roles[0]?.checkpoint).toBe(true);
  });

  it("accepts optional and nullable role hierarchy references", () => {
    const parsed = TeamPlanSchema.parse({
      roles: [
        {
          ...validPlan.roles[0],
          id: "manager",
          reportsTo: null
        },
        {
          ...validPlan.roles[0],
          id: "builder",
          reportsTo: " manager "
        },
        {
          ...validPlan.roles[0],
          id: "reviewer"
        }
      ]
    });

    expect(parsed.roles[0]?.reportsTo).toBeNull();
    expect(parsed.roles[1]?.reportsTo).toBe("manager");
    expect(parsed.roles[2]?.reportsTo).toBeUndefined();
  });

  it("rejects empty roles, empty names, and duplicate role ids", () => {
    expect(TeamPlanSchema.safeParse({ roles: [] }).success).toBe(false);
    expect(
      TeamPlanSchema.safeParse({
        roles: [{ ...validPlan.roles[0], name: "   " }]
      }).success
    ).toBe(false);
    expect(
      TeamPlanSchema.safeParse({
        roles: [validPlan.roles[0], { ...validPlan.roles[0], name: "Reviewer" }]
      }).success
    ).toBe(false);
    expect(
      TeamPlanSchema.safeParse({
        roles: [{ ...validPlan.roles[0], reportsTo: "   " }]
      }).success
    ).toBe(false);
  });

  it("asserts that assigned agents belong to the project", () => {
    expect(() => assertPlanAgents(TeamPlanSchema.parse(validPlan), ["codex", "claude"])).not.toThrow();
    expect(() => assertPlanAgents(TeamPlanSchema.parse(validPlan), ["codex"])).toThrow("project.agentIds");
  });

  it("keeps Project additive for overview and teamPlan", () => {
    expect(
      ProjectSchema.safeParse({
        id: "project-1",
        name: "Baton",
        source: { kind: "local", value: "/tmp/baton" },
        agentIds: ["codex"],
        leadAgentId: "codex",
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(true);

    expect(
      ProjectSchema.safeParse({
        id: "project-1",
        name: "Baton",
        source: { kind: "local", value: "/tmp/baton" },
        agentIds: ["codex", "claude"],
        leadAgentId: "claude",
        overview: "Build Baton.",
        teamPlan: validPlan,
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(true);

    expect(
      ProjectSchema.safeParse({
        id: "project-1",
        name: "Baton",
        source: { kind: "local", value: "/tmp/baton" },
        agentIds: ["codex"],
        leadAgentId: "codex",
        teamPlan: validPlan,
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(false);
  });
});
