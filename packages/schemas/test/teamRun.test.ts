import { describe, expect, it } from "vitest";

import { TeamRunSchema, type TeamRun } from "../src/index.js";

function teamRunFixture(overrides: Partial<TeamRun> = {}): TeamRun {
  return {
    id: "team-run-1",
    projectId: "project-1",
    status: "awaiting-approval",
    createdAt: "2026-06-17T00:00:00.000Z",
    order: ["architect", "implementer"],
    roles: [
      {
        roleId: "architect",
        name: "Architect",
        assignedAgentId: "claude",
        status: "planned"
      },
      {
        roleId: "implementer",
        name: "Implementer",
        assignedAgentId: "codex",
        status: "planned"
      }
    ],
    approvals: [
      {
        runId: "team-run-1",
        stepId: "pre-dispatch",
        status: "pending",
        createdAt: "2026-06-17T00:00:00.000Z"
      }
    ],
    ...overrides
  };
}

describe("TeamRun schema", () => {
  it("accepts a valid team run with optional execution fields", () => {
    const teamRun = teamRunFixture({
      status: "completed",
      updatedAt: "2026-06-17T00:01:00.000Z",
      worktreePath: "/tmp/baton-worktree",
      baseBranch: "origin/main",
      roles: [
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "claude",
          status: "completed",
          startedAt: "2026-06-17T00:00:10.000Z",
          completedAt: "2026-06-17T00:00:20.000Z",
          reason: "Completed by stub worker.",
          summary: "Design summary.",
          artifacts: ["/tmp/baton-worktree/logs/architect.stdout.log"]
        }
      ]
    });

    expect(TeamRunSchema.parse(teamRun)).toEqual(teamRun);
  });

  it("rejects missing required fields and invalid statuses", () => {
    expect(TeamRunSchema.safeParse({ ...teamRunFixture(), id: "" }).success).toBe(false);
    expect(TeamRunSchema.safeParse({ ...teamRunFixture(), status: "waiting" }).success).toBe(false);
    expect(
      TeamRunSchema.safeParse({
        ...teamRunFixture(),
        roles: [{ roleId: "architect", name: "Architect", assignedAgentId: "claude", status: "waiting" }]
      }).success
    ).toBe(false);
  });
});
