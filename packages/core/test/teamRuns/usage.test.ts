import { describe, expect, it } from "vitest";

import { aggregateTeamRunUsage, estimateTokens, readOrEstimateUsage, type WorkerRunResult } from "../../src/index.js";
import type { TeamRun } from "@baton/schemas";

describe("team run usage", () => {
  it("estimates token counts from text length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("abcdefghijkl")).toBe(3);
  });

  it("prefers measured metadata usage when available", () => {
    expect(
      readOrEstimateUsage("prompt text", result({ stdout: "output text", metadata: { usage: { inputTokens: 42, outputTokens: 7 } } }))
    ).toEqual({
      inputTokens: 42,
      outputTokens: 7,
      estimated: false
    });
  });

  it("falls back to estimates when metadata usage is missing or invalid", () => {
    expect(readOrEstimateUsage("12345", result({ stdout: "123456789" }))).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      estimated: true
    });
    expect(readOrEstimateUsage("1234", result({ stdout: "1234", metadata: { usage: { inputTokens: -1, outputTokens: 1 } } }))).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      estimated: true
    });
    expect(readOrEstimateUsage("1234", result({ stdout: "1234", metadata: { usage: { inputTokens: "1", outputTokens: 1 } } }))).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      estimated: true
    });
    expect(readOrEstimateUsage("1234", result({ stdout: "1234", metadata: { usage: { inputTokens: 1.5, outputTokens: 1 } } }))).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      estimated: true
    });
  });

  it("aggregates usage by assigned agent id and total", () => {
    expect(aggregateTeamRunUsage(teamRunFixture())).toEqual({
      byPlatform: {
        codex: { inputTokens: 15, outputTokens: 6, totalTokens: 21, roles: 2 },
        claude: { inputTokens: 20, outputTokens: 4, totalTokens: 24, roles: 1 }
      },
      total: { inputTokens: 35, outputTokens: 10, totalTokens: 45 },
      anyEstimated: true
    });
  });

  it("excludes roles without usage and only marks anyEstimated when present", () => {
    expect(
      aggregateTeamRunUsage(
        teamRunFixture({
          roles: [
            {
              roleId: "lead",
              name: "Lead",
              assignedAgentId: "codex",
              status: "completed",
              usage: { inputTokens: 1, outputTokens: 2, estimated: false }
            },
            {
              roleId: "reviewer",
              name: "Reviewer",
              assignedAgentId: "claude",
              status: "skipped"
            }
          ]
        })
      )
    ).toEqual({
      byPlatform: {
        codex: { inputTokens: 1, outputTokens: 2, totalTokens: 3, roles: 1 }
      },
      total: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      anyEstimated: false
    });
  });
});

function result(overrides: Partial<WorkerRunResult> = {}): WorkerRunResult {
  return {
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    artifacts: [],
    ...overrides
  };
}

function teamRunFixture(overrides: Partial<TeamRun> = {}): TeamRun {
  return {
    id: "team-run-1",
    projectId: "project-1",
    status: "completed",
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:01.000Z",
    order: ["lead", "architect", "reviewer", "implementer"],
    roles: [
      {
        roleId: "lead",
        name: "Lead",
        assignedAgentId: "codex",
        status: "completed",
        usage: { inputTokens: 10, outputTokens: 3, estimated: false }
      },
      {
        roleId: "architect",
        name: "Architect",
        assignedAgentId: "claude",
        status: "completed",
        usage: { inputTokens: 20, outputTokens: 4, estimated: true }
      },
      {
        roleId: "reviewer",
        name: "Reviewer",
        assignedAgentId: "claude",
        status: "skipped"
      },
      {
        roleId: "implementer",
        name: "Implementer",
        assignedAgentId: "codex",
        status: "completed",
        usage: { inputTokens: 5, outputTokens: 3, estimated: false }
      }
    ],
    ...overrides
  };
}
