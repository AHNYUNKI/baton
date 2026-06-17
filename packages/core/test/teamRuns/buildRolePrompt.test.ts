import { describe, expect, it } from "vitest";

import { buildRolePrompt } from "../../src/index.js";
import type { Project, TeamPlan } from "@baton/schemas";

describe("buildRolePrompt", () => {
  it("includes project overview, role instructions, and artifact guidance", () => {
    const project = projectFixture();
    const teamPlan = teamPlanFixture();
    const role = roleFixture(teamPlan);

    const prompt = buildRolePrompt({
      project,
      role,
      teamPlan,
      runDirectory: "/repo/baton/.baton/runs/team-run-1"
    });

    expect(prompt).toContain("Build a safe execution engine.");
    expect(prompt).toContain("작은 변경으로 구현해 주세요.");
    expect(prompt).toContain("reportsTo: architect");
    expect(prompt).toContain("/repo/baton/.baton/runs/team-run-1");
  });

  it("omits upstream context when no upstream entries are provided", () => {
    const prompt = buildRolePrompt({
      project: projectFixture(),
      role: roleFixture(teamPlanFixture()),
      teamPlan: teamPlanFixture(),
      runDirectory: "/repo/baton/.baton/runs/team-run-1"
    });

    expect(prompt).not.toContain("## Upstream Context");
  });

  it("includes upstream summaries and artifact paths without artifact contents", () => {
    const teamPlan = teamPlanFixture();
    const prompt = buildRolePrompt({
      project: projectFixture(),
      role: roleFixture(teamPlan),
      teamPlan,
      runDirectory: "/repo/baton/.baton/runs/team-run-1",
      upstream: [
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "claude",
          status: "completed",
          summary: "Architecture summary for downstream role.",
          artifacts: ["/repo/baton/.baton/runs/team-run-1/steps/architect.result.json"]
        }
      ]
    });

    expect(prompt).toContain("## Upstream Context");
    expect(prompt).toContain("Architect (architect, claude, 상태:completed)");
    expect(prompt).toContain("Architecture summary for downstream role.");
    expect(prompt).toContain("/repo/baton/.baton/runs/team-run-1/steps/architect.result.json");
    expect(prompt).not.toContain("artifact file body that should stay out of the prompt");
  });
});

function projectFixture(): Project {
  return {
    id: "project-1",
    name: "Baton",
    source: { kind: "local", value: "/repo/baton" },
    agentIds: ["codex", "claude"],
    leadAgentId: "claude",
    overview: "Build a safe execution engine.",
    createdAt: "2026-06-17T00:00:00.000Z"
  };
}

function teamPlanFixture(): TeamPlan {
  return {
    roles: [
      {
        id: "architect",
        name: "Architect",
        description: "Designs the implementation.",
        assignedAgentId: "claude",
        instructions: "설계를 검토하고 위험을 줄여 주세요."
      },
      {
        id: "implementer",
        name: "Implementer",
        description: "Implements the change.",
        assignedAgentId: "codex",
        instructions: "작은 변경으로 구현해 주세요.",
        reportsTo: "architect"
      }
    ]
  };
}

function roleFixture(teamPlan: TeamPlan) {
  const role = teamPlan.roles[1];
  if (role === undefined) {
    throw new Error("Missing implementer fixture role.");
  }
  return role;
}
