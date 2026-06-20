import { describe, expect, it } from "vitest";

import { TeamRunRoleUsageSchema, TeamRunSchema, type TeamRun } from "../src/index.js";

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
      diffSummary: "1 file changed, 2 insertions(+)",
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
          explanation: "## 학습 설명\n- 무엇을 했나: 설계를 요약했습니다.",
          usage: {
            inputTokens: 12,
            outputTokens: 4,
            estimated: true
          },
          artifacts: ["/tmp/baton-worktree/logs/architect.stdout.log"]
        }
      ]
    });

    expect(TeamRunSchema.parse(teamRun)).toEqual(teamRun);
  });

  it("accepts team runs when optional role explanations are absent or present", () => {
    expect(TeamRunSchema.parse(teamRunFixture()).roles.every((role) => role.explanation === undefined)).toBe(true);

    const teamRun = teamRunFixture({
      roles: [
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "claude",
          status: "completed",
          explanation: "## 학습 설명\n- 무엇을 했나: 아키텍처를 설명했습니다."
        }
      ]
    });

    expect(TeamRunSchema.parse(teamRun)).toEqual(teamRun);
  });

  it("accepts awaiting-review team runs with a post-run review approval", () => {
    const teamRun = teamRunFixture({
      status: "awaiting-review",
      diffSummary: "2 files changed, 5 insertions(+), 1 deletion(-)",
      approvals: [
        {
          runId: "team-run-1",
          stepId: "pre-dispatch",
          status: "approved",
          createdAt: "2026-06-17T00:00:00.000Z",
          decidedAt: "2026-06-17T00:00:00.000Z"
        },
        {
          runId: "team-run-1",
          stepId: "post-run-review",
          status: "pending",
          createdAt: "2026-06-17T00:01:00.000Z"
        }
      ]
    });

    expect(TeamRunSchema.parse(teamRun)).toEqual(teamRun);
  });

  it("accepts awaiting-checkpoint team runs with a checkpoint approval", () => {
    const teamRun = teamRunFixture({
      status: "awaiting-checkpoint",
      roles: [
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "claude",
          status: "completed",
          explanation: "## 학습 설명\n- 무엇을 했나: 설계를 완료했습니다."
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
          status: "approved",
          createdAt: "2026-06-17T00:00:00.000Z",
          decidedAt: "2026-06-17T00:00:00.000Z"
        },
        {
          runId: "team-run-1",
          stepId: "checkpoint:architect",
          status: "pending",
          createdAt: "2026-06-17T00:01:00.000Z"
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

  it("accepts optional role usage and rejects invalid token counts", () => {
    expect(TeamRunRoleUsageSchema.parse({ inputTokens: 0, outputTokens: 1, estimated: false })).toEqual({
      inputTokens: 0,
      outputTokens: 1,
      estimated: false
    });
    expect(TeamRunRoleUsageSchema.safeParse({ inputTokens: -1, outputTokens: 1, estimated: true }).success).toBe(false);
    expect(TeamRunRoleUsageSchema.safeParse({ inputTokens: 1.5, outputTokens: 1, estimated: true }).success).toBe(false);

    const teamRun = teamRunFixture({
      roles: [
        {
          roleId: "architect",
          name: "Architect",
          assignedAgentId: "claude",
          status: "completed",
          usage: {
            inputTokens: 9,
            outputTokens: 3,
            estimated: false
          }
        }
      ]
    });

    expect(TeamRunSchema.parse(teamRun)).toEqual(teamRun);
  });
});
