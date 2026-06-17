import { describe, expect, it } from "vitest";

import { collectUpstreamRoleIds } from "../../src/index.js";
import type { TeamPlan } from "@baton/schemas";

describe("collectUpstreamRoleIds", () => {
  it("returns no upstream roles for a root role", () => {
    expect(collectUpstreamRoleIds("lead", plan([{ id: "lead" }]))).toEqual([]);
  });

  it("returns the direct parent for a two-level chain", () => {
    expect(collectUpstreamRoleIds("implementer", plan([{ id: "lead" }, { id: "implementer", reportsTo: "lead" }]))).toEqual([
      "lead"
    ]);
  });

  it("returns ancestors root-first for a deeper chain", () => {
    expect(
      collectUpstreamRoleIds(
        "reviewer",
        plan([
          { id: "lead" },
          { id: "architect", reportsTo: "lead" },
          { id: "implementer", reportsTo: "architect" },
          { id: "reviewer", reportsTo: "implementer" }
        ])
      )
    ).toEqual(["lead", "architect", "implementer"]);
  });

  it("stops at a missing parent", () => {
    expect(collectUpstreamRoleIds("orphan", plan([{ id: "orphan", reportsTo: "missing" }]))).toEqual([]);
    expect(
      collectUpstreamRoleIds("child", plan([{ id: "orphan", reportsTo: "missing" }, { id: "child", reportsTo: "orphan" }]))
    ).toEqual(["orphan"]);
  });

  it("defends against cyclic ancestry without looping", () => {
    expect(collectUpstreamRoleIds("a", plan([{ id: "a", reportsTo: "b" }, { id: "b", reportsTo: "a" }]))).toEqual([]);
    expect(
      collectUpstreamRoleIds("c", plan([{ id: "a", reportsTo: "b" }, { id: "b", reportsTo: "a" }, { id: "c", reportsTo: "b" }]))
    ).toEqual([]);
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
