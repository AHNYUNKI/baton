import { describe, expect, it } from "vitest";

import { AGENT_CATALOG, AgentCatalogSchema, ProjectSchema } from "../src/index.js";

describe("ProjectSchema", () => {
  it("validates local and github project sources", () => {
    expect(
      ProjectSchema.safeParse({
        id: "project-local",
        name: "Baton",
        source: { kind: "local", value: "/tmp/baton" },
        agentIds: ["codex"],
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(true);

    expect(
      ProjectSchema.safeParse({
        id: "project-github",
        name: "Baton",
        source: { kind: "github", value: "https://github.com/example/baton" },
        agentIds: ["codex", "claude"],
        leadAgentId: "claude",
        createdAt: "2026-06-15T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("rejects invalid project fields and lead rules", () => {
    const base = {
      id: "project-1",
      name: "Baton",
      source: { kind: "local", value: "/tmp/baton" },
      agentIds: ["codex"],
      leadAgentId: "codex",
      createdAt: "2026-06-15T00:00:00.000Z"
    };

    expect(ProjectSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, source: { kind: "local", value: "   " } }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, source: { kind: "github", value: "/tmp/baton" } }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, agentIds: [] }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, agentIds: ["cursor"] }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, agentIds: ["codex", "claude"], leadAgentId: undefined }).success).toBe(false);
    expect(ProjectSchema.safeParse({ ...base, agentIds: ["codex"], leadAgentId: "claude" }).success).toBe(false);
  });
});

describe("AgentCatalogSchema", () => {
  it("contains the v0.16 AI catalog", () => {
    expect(AgentCatalogSchema.safeParse(AGENT_CATALOG).success).toBe(true);
    expect(AGENT_CATALOG.map((entry) => entry.id)).toEqual(["codex", "claude"]);
  });
});
