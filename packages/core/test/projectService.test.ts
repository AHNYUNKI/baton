import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectService, fixedClock } from "../src/index.js";

describe("ProjectService", () => {
  it("creates projects with local and github sources", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir, clock: fixedClock("2026-06-15T00:00:00.000Z") });

    const local = await service.create({
      name: " Local App ",
      source: { kind: "local", value: "." },
      agentIds: ["codex"]
    });
    const github = await service.create({
      name: "GitHub App",
      source: { kind: "github", value: "https://github.com/example/app" },
      agentIds: ["codex", "claude"],
      leadAgentId: "claude"
    });

    expect(local).toEqual({
      id: expect.stringMatching(/^project-/u),
      name: "Local App",
      source: { kind: "local", value: process.cwd() },
      agentIds: ["codex"],
      leadAgentId: "codex",
      createdAt: "2026-06-15T00:00:00.000Z"
    });
    expect(github.source).toEqual({ kind: "github", value: "https://github.com/example/app" });
    expect(github.agentIds).toEqual(["codex", "claude"]);
    expect(github.leadAgentId).toBe("claude");
    expect(await service.list()).toEqual([local, github]);
  });

  it("returns the existing project for duplicate sources", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir, clock: fixedClock("2026-06-15T00:00:00.000Z") });

    const first = await service.create({
      name: "First",
      source: { kind: "github", value: "https://github.com/example/app" },
      agentIds: ["claude"]
    });
    const second = await service.create({
      name: "Second",
      source: { kind: "github", value: "https://github.com/example/app" },
      agentIds: ["codex"]
    });

    expect(second).toEqual(first);
    expect(await service.list()).toHaveLength(1);
  });

  it("rejects invalid create input with clear errors", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir });
    const valid = {
      name: "Baton",
      source: { kind: "github" as const, value: "https://github.com/example/baton" },
      agentIds: ["codex"]
    };

    await expect(service.create({ ...valid, name: "   " })).rejects.toThrow("Invalid project: name");
    await expect(service.create({ ...valid, agentIds: [] })).rejects.toThrow("Invalid project: agentIds");
    await expect(service.create({ ...valid, agentIds: ["cursor"] })).rejects.toThrow("Invalid project: agentIds");
    await expect(service.create({ ...valid, agentIds: ["codex", "claude"] })).rejects.toThrow("leadAgentId");
    await expect(service.create({ ...valid, agentIds: ["codex"], leadAgentId: "claude" })).rejects.toThrow("leadAgentId");
    await expect(service.create({ ...valid, source: { kind: "github", value: "/tmp/not-github" } })).rejects.toThrow("GitHub project source");
    expect(await service.list()).toEqual([]);
  });

  it("adds existing project paths idempotently", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const projectDir = await mkdtemp(path.join(tmpdir(), "baton-project-"));

    const service = new ProjectService({ homeDir, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const first = await service.add(projectDir);
    const second = await service.add(projectDir);

    expect(first).toEqual(second);
    expect(first.source).toEqual({ kind: "local", value: projectDir });
    expect(first.agentIds).toEqual(["codex"]);
    expect(first.leadAgentId).toBe("codex");
    expect(await service.list()).toEqual([first]);
    expect(JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8"))).toHaveLength(1);
  });

  it("throws a clear error for missing project paths", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir });

    await expect(service.add(path.join(tmpdir(), "does-not-exist"))).rejects.toThrow("Project path does not exist");
  });

  it("stores and retrieves a validated TeamPlan", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const project = await service.create({
      name: "Baton",
      source: { kind: "github", value: "https://github.com/example/baton" },
      agentIds: ["codex", "claude"],
      leadAgentId: "claude"
    });
    const plan = {
      roles: [
        {
          id: "planner",
          name: "Planner",
          description: "Plans the work",
          assignedAgentId: "claude",
          instructions: "Draft a plan."
        }
      ]
    };

    const updated = await service.setTeamPlan(project.id, plan, { overview: "Build team planning." });

    expect(updated.overview).toBe("Build team planning.");
    expect(updated.teamPlan).toEqual(plan);
    expect(await service.getTeamPlan(project.id)).toEqual(plan);
    expect(JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8"))[0].teamPlan).toEqual(plan);
  });

  it("rejects TeamPlans assigned to agents outside the project", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir });
    const project = await service.create({
      name: "Baton",
      source: { kind: "github", value: "https://github.com/example/baton" },
      agentIds: ["codex"]
    });

    await expect(
      service.setTeamPlan(project.id, {
        roles: [
          {
            id: "planner",
            name: "Planner",
            description: "Plans the work",
            assignedAgentId: "claude",
            instructions: "Draft a plan."
          }
        ]
      })
    ).rejects.toThrow("project.agentIds");
  });
});
