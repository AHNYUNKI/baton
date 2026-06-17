import type { Project } from "@baton/schemas";
import { describe, expect, it } from "vitest";

import {
  PlanGenerationError,
  buildPlanPrompt,
  extractJson,
  generateTeamPlan,
  normalizeHierarchy,
  type WorkerAdapter,
  type WorkerRunInput,
  type WorkerRunResult
} from "../src/index.js";

const project: Project = {
  id: "project-1",
  name: "Baton",
  source: { kind: "local", value: "/tmp/baton" },
  agentIds: ["codex", "claude"],
  leadAgentId: "claude",
  createdAt: "2026-06-15T00:00:00.000Z"
};

const validPlanJson = JSON.stringify({
  roles: [
    {
      id: "architect",
      name: "Architect",
      description: "Designs the change",
      assignedAgentId: "claude",
      instructions: "Write a small design."
    }
  ]
});

describe("TeamPlan planner", () => {
  it("builds a schema-focused prompt", () => {
    const prompt = buildPlanPrompt({
      projectName: "Baton",
      overview: "Add team planning.",
      agentIds: ["codex", "claude"]
    });

    expect(prompt).toContain("Add team planning.");
    expect(prompt).toContain("- codex");
    expect(prompt).toContain("assignedAgentId");
    expect(prompt).toContain("reportsTo");
    expect(prompt).toContain("한국어");
    expect(prompt).toContain("2~3단계 계층");
    expect(prompt).toContain("대표 직속 매니저");
    expect(prompt).toContain("analysis-design");
    expect(prompt).toContain("Return only one strict JSON object");
  });

  it("extracts JSON from prose and fenced output", () => {
    expect(extractJson(`Here is the plan:\n${validPlanJson}`)).toEqual(JSON.parse(validPlanJson));
    expect(extractJson(`Sure.\n\`\`\`json\n${validPlanJson}\n\`\`\``)).toEqual(JSON.parse(validPlanJson));
  });

  it("generates a plan from clean JSON", async () => {
    const calls: WorkerRunInput[] = [];

    const plan = await generateTeamPlan({
      project,
      overview: "Build Baton planning.",
      leadAdapter: worker(calls, [success(validPlanJson)])
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cwd).toBe("/tmp/baton");
    expect(plan.roles[0]?.assignedAgentId).toBe("claude");
  });

  it("retries once after invalid output and succeeds", async () => {
    const calls: WorkerRunInput[] = [];

    const plan = await generateTeamPlan({
      project,
      overview: "Build Baton planning.",
      leadAdapter: worker(calls, [success("not json"), success(validPlanJson)])
    });

    expect(plan.roles).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.prompt).toContain("Previous output was invalid");
  });

  it("stops at the bounded retry maximum", async () => {
    const calls: WorkerRunInput[] = [];

    await expect(
      generateTeamPlan({
        project,
        overview: "Build Baton planning.",
        leadAdapter: worker(calls, [success("bad"), success("still bad")])
      })
    ).rejects.toThrow(PlanGenerationError);

    expect(calls).toHaveLength(2);
  });

  it("clamps assignedAgentId values outside the project agents", async () => {
    const calls: WorkerRunInput[] = [];
    const plan = await generateTeamPlan({
      project,
      overview: "Build Baton planning.",
      leadAdapter: worker(calls, [
        success(
          JSON.stringify({
            roles: [
              {
                id: "writer",
                name: "Writer",
                description: "Writes instructions",
                assignedAgentId: "outside",
                instructions: "Draft role instructions."
              }
            ]
          })
        )
      ])
    });

    expect(plan.roles[0]?.assignedAgentId).toBe("claude");
  });

  it("normalizes valid hierarchy without mutating the input plan", () => {
    const plan = {
      roles: [
        role("manager", { reportsTo: null }),
        role("builder", { reportsTo: "manager" }),
        role("reviewer", { reportsTo: "builder" })
      ]
    };

    const normalized = normalizeHierarchy(plan);

    expect(normalized).not.toBe(plan);
    expect(normalized.roles.map((current) => current.reportsTo)).toEqual([null, "manager", "builder"]);
    expect(plan.roles.map((current) => current.reportsTo)).toEqual([null, "manager", "builder"]);
  });

  it("normalizes missing hierarchy references to representative roots", () => {
    const normalized = normalizeHierarchy({
      roles: [role("manager", { reportsTo: null }), role("builder", { reportsTo: "missing" })]
    });

    expect(normalized.roles[0]?.reportsTo).toBeNull();
    expect(normalized.roles[1]?.reportsTo).toBeUndefined();
  });

  it("normalizes self references to representative roots", () => {
    const normalized = normalizeHierarchy({
      roles: [role("manager", { reportsTo: "manager" }), role("builder", { reportsTo: "manager" })]
    });

    expect(normalized.roles[0]?.reportsTo).toBeUndefined();
    expect(normalized.roles[1]?.reportsTo).toBe("manager");
  });

  it("normalizes cyclic hierarchy participants to representative roots", () => {
    const normalized = normalizeHierarchy({
      roles: [
        role("manager", { reportsTo: "reviewer" }),
        role("reviewer", { reportsTo: "manager" }),
        role("builder", { reportsTo: "manager" })
      ]
    });

    expect(normalized.roles[0]?.reportsTo).toBeUndefined();
    expect(normalized.roles[1]?.reportsTo).toBeUndefined();
    expect(normalized.roles[2]?.reportsTo).toBe("manager");
  });
});

function worker(calls: WorkerRunInput[], results: readonly WorkerRunResult[]): WorkerAdapter {
  const queued = [...results];
  return {
    async run(input: WorkerRunInput): Promise<WorkerRunResult> {
      calls.push(input);
      return queued.shift() ?? results[results.length - 1] ?? success("");
    }
  };
}

function success(stdout: string): WorkerRunResult {
  return {
    success: true,
    exitCode: 0,
    stdout,
    stderr: "",
    durationMs: 1,
    artifacts: []
  };
}

function role(id: string, overrides: { reportsTo?: string | null } = {}) {
  return {
    id,
    name: id,
    description: `${id} description`,
    assignedAgentId: "codex",
    instructions: `${id} instructions`,
    ...overrides
  };
}
