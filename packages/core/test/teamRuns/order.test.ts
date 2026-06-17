import { describe, expect, it } from "vitest";

import { computeExecutionOrder } from "../../src/index.js";
import type { TeamPlan } from "@baton/schemas";

describe("computeExecutionOrder", () => {
  it("returns a single role", () => {
    expect(computeExecutionOrder(plan([{ id: "lead" }]))).toEqual(["lead"]);
  });

  it("orders roots before children breadth-first and preserves sibling plan order", () => {
    expect(
      computeExecutionOrder(
        plan([
          { id: "lead" },
          { id: "ops" },
          { id: "design", reportsTo: "lead" },
          { id: "implementation", reportsTo: "lead" },
          { id: "qa", reportsTo: "implementation" },
          { id: "release", reportsTo: "ops" }
        ])
      )
    ).toEqual(["lead", "ops", "design", "implementation", "release", "qa"]);
  });

  it("keeps flat plans in plan order", () => {
    expect(computeExecutionOrder(plan([{ id: "analysis" }, { id: "design" }, { id: "build" }]))).toEqual(["analysis", "design", "build"]);
  });

  it("treats missing parents as roots", () => {
    expect(computeExecutionOrder(plan([{ id: "orphan", reportsTo: "missing" }, { id: "child", reportsTo: "orphan" }]))).toEqual([
      "orphan",
      "child"
    ]);
  });

  it("treats cyclic ancestry as roots without looping forever", () => {
    expect(computeExecutionOrder(plan([{ id: "a", reportsTo: "b" }, { id: "b", reportsTo: "a" }, { id: "c", reportsTo: "b" }]))).toEqual([
      "a",
      "b",
      "c"
    ]);
  });
});

function plan(roles: Array<{ id: string; reportsTo?: string }>): TeamPlan {
  return {
    roles: roles.map((role) => ({
      id: role.id,
      name: role.id,
      description: `${role.id} description`,
      assignedAgentId: "codex",
      instructions: `${role.id} instructions`,
      ...(role.reportsTo === undefined ? {} : { reportsTo: role.reportsTo })
    }))
  };
}
