import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ArtifactStore,
  ClaudeCodeAdapter,
  CodexExecAdapter,
  FinalizeWriter,
  RunStore,
  StubWorker,
  TestRunnerAdapter,
  createMockProcessRunner,
  fixedClock
} from "@baton/core";
import type { DbClient, DbQueryParams, ProcessRunner } from "@baton/core";
import {
  ProjectListEnvelopeSchema,
  RunDetailEnvelopeSchema,
  RunListEnvelopeSchema,
  StateEnvelopeSchema,
  TeamPlanEnvelopeSchema,
  TeamRunEnvelopeSchema,
  TeamRunListEnvelopeSchema,
  WatchEventEnvelopeSchema,
  type AgentRole,
  type Run,
  type TeamRun
} from "@baton/schemas";

import { runCli } from "../src/main.js";
import { dbCommand } from "../src/commands/db.js";
import { resolveRunOptions, resolveTestCommand } from "../src/commands/run.js";
import { createCodexWorkerRegistry, createDefaultWorkerRegistry, createWorkerRegistry } from "../src/registry.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("@baton/cli", () => {
  beforeEach(() => {
    delete process.env.BATON_OBSIDIAN_VAULT;
  });

  it("prints help", async () => {
    const output: string[] = [];

    const code = await runCli(["--help"], { stdout: (line) => output.push(line) });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("baton run <request> [--dry-run]");
    expect(output.join("\n")).toContain("baton config list");
    expect(output.join("\n")).toContain("baton db status");
    expect(output.join("\n")).toContain("baton state [--json]");
    expect(output.join("\n")).toContain("baton watch [--interval <s>] [--once]");
    expect(output.join("\n")).toContain("baton project plan run start");
  });

  it("prints db help", async () => {
    const output: string[] = [];

    const code = await runCli(["db", "--help"], { stdout: (line) => output.push(line) });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("baton db status");
    expect(output.join("\n")).toContain("baton db reindex");
  });

  it("prints run help", async () => {
    const output: string[] = [];

    const code = await runCli(["run", "--help"], { stdout: (line) => output.push(line) });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("baton run list");
    expect(output.join("\n")).toContain("baton run show <runId> [--json]");
    expect(output.join("\n")).toContain("baton run status <runId> [--json]");
    expect(output.join("\n")).toContain("--test-command <command>");
    expect(output.join("\n")).toContain("--no-codex");
    expect(output.join("\n")).toContain("--fix");
    expect(output.join("\n")).toContain("--max-fix-attempts <n>");
  });

  it("resolves test commands from flag before config", () => {
    expect(resolveTestCommand({ flag: "pnpm --filter @baton/core test" })).toEqual({
      command: "pnpm",
      args: ["--filter", "@baton/core", "test"]
    });
    expect(
      resolveTestCommand({
        flag: "npm test",
        config: { test: { command: ["pnpm", "test"] } }
      })
    ).toEqual({ command: "npm", args: ["test"] });
    expect(resolveTestCommand({ config: { test: { command: ["corepack", "pnpm", "test"] } } })).toEqual({
      command: "corepack",
      args: ["pnpm", "test"]
    });
    expect(resolveTestCommand({ config: { test: { command: "pnpm test" } } })).toBeUndefined();
    expect(resolveTestCommand({})).toBeUndefined();
  });

  it("resolves run options from flags before config before defaults", () => {
    expect(resolveRunOptions({ flags: {} })).toEqual({
      useCodex: false,
      useClaude: false,
      useTest: false,
      fixEnabled: false,
      maxFixAttempts: 1
    });

    expect(
      resolveRunOptions({
        flags: {},
        config: {
          version: 1,
          workers: { codex: true, claude: true, test: true, fix: true, maxFixAttempts: 3 },
          test: { command: ["pnpm", "test"] }
        }
      })
    ).toEqual({
      useCodex: true,
      useClaude: true,
      useTest: true,
      fixEnabled: true,
      maxFixAttempts: 3,
      testCommand: { command: "pnpm", args: ["test"] }
    });

    expect(
      resolveRunOptions({
        flags: {
          useCodex: false,
          useClaude: true,
          useTest: true,
          fixEnabled: false,
          maxFixAttempts: 2,
          testCommandFlag: "npm test"
        },
        config: {
          version: 1,
          workers: { codex: true, claude: false, test: false, fix: true, maxFixAttempts: 5 },
          test: { command: ["pnpm", "test"] }
        }
      })
    ).toEqual({
      useCodex: false,
      useClaude: true,
      useTest: true,
      fixEnabled: false,
      maxFixAttempts: 2,
      testCommand: { command: "npm", args: ["test"] }
    });
  });

  it("rejects --test-command when the resolved test worker is disabled", () => {
    expect(() => resolveRunOptions({ flags: { testCommandFlag: "pnpm test" } })).toThrow("test worker is disabled");
    expect(() => resolveRunOptions({ flags: { useTest: false, testCommandFlag: "pnpm test" }, config: { version: 1, workers: { test: true } } })).toThrow(
      "test worker is disabled"
    );
  });

  it("initializes a workspace idempotently", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-init-"));
    const output: string[] = [];

    expect(await runCli(["init"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["init"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(JSON.parse(await readFile(path.join(cwd, ".baton", "config.json"), "utf8"))).toEqual({
      version: 1,
      obsidian: { vault: "" },
      test: { command: ["corepack", "pnpm", "test"] },
      workers: { codex: false, claude: false, test: false, fix: false, maxFixAttempts: 1 }
    });
  });

  it("keeps an existing init config unchanged", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-init-existing-"));
    const configPath = path.join(cwd, ".baton", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ version: 1, workers: { codex: true } }, null, 2)}\n`, "utf8");

    expect(await runCli(["init"], { cwd })).toBe(0);

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({ version: 1, workers: { codex: true } });
  });

  it("lists, gets, and sets project config values", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-config-"));
    const configPath = path.join(cwd, ".baton", "config.json");
    const output: string[] = [];
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ version: 1, obsidian: { vault: "/tmp/vault" } }, null, 2)}\n`, "utf8");

    expect(await runCli(["config", "set", "workers.codex", "true"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["config", "set", "workers.maxFixAttempts", "3"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["config", "set", "test.command", "[\"pnpm\",\"test\"]"], { cwd, stdout: (line) => output.push(line) })).toBe(0);

    const stored = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    expect(stored).toEqual({
      version: 1,
      obsidian: { vault: "/tmp/vault" },
      workers: { codex: true, maxFixAttempts: 3 },
      test: { command: ["pnpm", "test"] }
    });

    output.length = 0;
    expect(await runCli(["config", "get", "workers.codex"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toBe("true");

    output.length = 0;
    expect(await runCli(["config", "list"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(JSON.parse(output.join("\n"))).toEqual(stored);
  });

  it("rejects invalid config set values and unknown keys without writing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-config-invalid-"));
    const configPath = path.join(cwd, ".baton", "config.json");
    const errors: string[] = [];
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify({ version: 1, workers: { maxFixAttempts: 2 } }, null, 2)}\n`, "utf8");
    const before = await readFile(configPath, "utf8");

    expect(await runCli(["config", "set", "workers.maxFixAttempts", "9"], { cwd, stderr: (line) => errors.push(line) })).toBe(1);
    expect(await readFile(configPath, "utf8")).toBe(before);
    expect(errors.join("\n")).toContain("workers.maxFixAttempts");

    errors.length = 0;
    expect(await runCli(["config", "get", "workers.codex"], { cwd, stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("Baton config key is not set");

    errors.length = 0;
    expect(await runCli(["config", "set", "workers.unknown", "true"], { cwd, stderr: (line) => errors.push(line) })).toBe(1);
    expect(await readFile(configPath, "utf8")).toBe(before);
    expect(errors.join("\n")).toContain("Unknown Baton config key");
  });

  it("adds and lists projects using BATON_HOME", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const projectDir = await mkdtemp(path.join(tmpdir(), "baton-cli-project-"));
    const output: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };

    expect(await runCli(["project", "add", projectDir], { env, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["project", "list"], { env, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain(projectDir);
  });

  it("creates projects and lists them as a JSON envelope", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const localDir = await mkdtemp(path.join(tmpdir(), "baton-cli-local-"));
    const output: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };

    expect(
      await runCli(
        [
          "project",
          "create",
          "--name",
          "Local Project",
          "--source-kind",
          "local",
          "--source",
          localDir,
          "--agent",
          "codex"
        ],
        { env, stdout: (line) => output.push(line) }
      )
    ).toBe(0);
    expect(
      await runCli(
        [
          "project",
          "create",
          "--name",
          "GitHub Project",
          "--source-kind",
          "github",
          "--source",
          "https://github.com/example/baton",
          "--agent",
          "codex",
          "--agent",
          "claude",
          "--lead",
          "claude"
        ],
        { env, stdout: (line) => output.push(line) }
      )
    ).toBe(0);

    output.length = 0;
    expect(await runCli(["project", "list", "--json"], { env, stdout: (line) => output.push(line) })).toBe(0);

    const envelope = ProjectListEnvelopeSchema.parse(JSON.parse(output.join("\n")));
    expect(envelope.kind).toBe("project-list");
    expect(envelope.data.map((project) => project.name)).toEqual(["Local Project", "GitHub Project"]);
    expect(envelope.data[0]?.source).toEqual({ kind: "local", value: localDir });
    expect(envelope.data[0]?.leadAgentId).toBe("codex");
    expect(envelope.data[1]?.source).toEqual({ kind: "github", value: "https://github.com/example/baton" });
    expect(envelope.data[1]?.leadAgentId).toBe("claude");
  });

  it("rejects invalid project create arguments", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const errors: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };

    expect(await runCli(["project", "create", "--name", "Bad", "--source-kind", "github", "--source", "https://github.com/example/baton"], { env, stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("Invalid project");

    errors.length = 0;
    expect(await runCli(["project", "create", "--name", "Bad", "--source-kind", "git", "--source", "x", "--agent", "codex"], { env, stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("baton project create");
  });

  it("generates and stores a project TeamPlan as a JSON envelope", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const localDir = await mkdtemp(path.join(tmpdir(), "baton-cli-local-"));
    const output: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };
    const mock = createMockProcessRunner([
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      {
        stdout: JSON.stringify({
          roles: [
            {
              id: "planner",
              name: "Planner",
              description: "Plans work",
              assignedAgentId: "claude",
              instructions: "Create the plan."
            }
          ]
        }),
        stderr: "",
        exitCode: 0,
        durationMs: 1
      }
    ]);

    expect(
      await runCli(
        [
          "project",
          "create",
          "--name",
          "Team Project",
          "--source-kind",
          "local",
          "--source",
          localDir,
          "--agent",
          "codex",
          "--agent",
          "claude",
          "--lead",
          "claude"
        ],
        { env }
      )
    ).toBe(0);

    const projectId = (JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8")) as Array<{ id: string }>)[0]?.id ?? "";
    expect(
      await runCli(["project", "plan", "generate", projectId, "--overview", "Build a team plan."], {
        env,
        runner: mock.runner,
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    const envelope = TeamPlanEnvelopeSchema.parse(JSON.parse(output.join("\n")));
    expect(envelope.kind).toBe("team-plan");
    expect(envelope.data.roles[0]?.assignedAgentId).toBe("claude");
    expect(mock.calls.map((call) => [call.command, call.args])).toEqual([
      ["claude", ["--version"]],
      ["claude", ["--print"]]
    ]);
    expect(mock.calls[1]?.options?.cwd).toBe(localDir);
    expect(JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8"))[0].overview).toBe("Build a team plan.");
  });

  it("shows and sets a project TeamPlan through stdin", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const output: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };

    expect(
      await runCli(["project", "create", "--name", "Team Project", "--source-kind", "github", "--source", "https://github.com/example/baton", "--agent", "codex"], { env })
    ).toBe(0);

    const projectId = (JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8")) as Array<{ id: string }>)[0]?.id ?? "";
    const plan = {
      roles: [
        {
          id: "implementer",
          name: "Implementer",
          description: "Implements changes",
          assignedAgentId: "codex",
          instructions: "Keep changes small."
        }
      ]
    };

    expect(
      await runCli(["project", "plan", "set", projectId], {
        env,
        stdin: JSON.stringify(plan),
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    output.length = 0;
    expect(await runCli(["project", "plan", "show", projectId, "--json"], { env, stdout: (line) => output.push(line) })).toBe(0);
    expect(TeamPlanEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data).toEqual(plan);
  });

  it("runs a project TeamPlan through TeamRun start, approve, show, and list using StubWorker", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const localDir = await mkdtemp(path.join(tmpdir(), "baton-cli-team-run-"));
    const env = { ...process.env, BATON_HOME: homeDir };
    const output: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    const projectId = await createProjectWithPlan({ env, cwd: localDir });

    expect(
      await runCli(["project", "plan", "run", "start", projectId, "--json"], {
        cwd: localDir,
        env,
        runner: mock.runner,
        clock: fixedClock("2026-06-17T00:00:00.000Z"),
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    const started = TeamRunEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;
    expect(started.status).toBe("awaiting-approval");
    expect(started.roles.map((role) => role.status)).toEqual(["planned", "planned"]);
    expect(started.baseBranch).toBe("origin/main");
    expect(mock.calls).toEqual([
      {
        command: "git",
        args: ["worktree", "add", path.join(localDir, ".baton", "worktrees", started.id), "-b", `baton/${started.id}`, "origin/main"],
        options: { cwd: localDir }
      }
    ]);

    output.length = 0;
    expect(
      await runCli(["project", "plan", "run", "approve", started.id, "--note", "go", "--json"], {
        cwd: localDir,
        env,
        runner: mock.runner,
        clock: fixedClock("2026-06-17T00:00:00.000Z"),
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    const approved = TeamRunEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;
    expect(approved.status).toBe("completed");
    expect(approved.roles.map((role) => role.status)).toEqual(["completed", "completed"]);
    expect(approved.roles.every((role) => role.reason === "Completed by stub worker.")).toBe(true);
    expect(approved.roles.every((role) => role.usage !== undefined && role.usage.estimated)).toBe(true);
    expect(mock.calls.some((call) => call.command === "codex")).toBe(false);
    expect(mock.calls.some((call) => call.command === "claude")).toBe(false);
    const approvedUsage = usageTotals(approved);

    output.length = 0;
    expect(await runCli(["project", "plan", "run", "show", started.id, "--json"], { cwd: localDir, env, stdout: (line) => output.push(line) })).toBe(0);
    const shown = TeamRunEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;
    expect(shown.status).toBe("completed");
    expect(shown.roles.map((role) => role.usage)).toEqual(approved.roles.map((role) => role.usage));

    output.length = 0;
    expect(await runCli(["project", "plan", "run", "show", started.id], { cwd: localDir, env, stdout: (line) => output.push(line) })).toBe(0);
    const showText = output.join("\n");
    expect(showText).toContain("토큰 사용량(추정/실측)");
    expect(showText).toContain("플랫폼\t입력\t출력\t합계\t역할수");
    expect(showText).toContain(
      `codex\t${approvedUsage.inputTokens}\t${approvedUsage.outputTokens}\t${approvedUsage.totalTokens}\t${approvedUsage.roles}`
    );
    expect(showText).toContain(
      `총합\t${approvedUsage.inputTokens}\t${approvedUsage.outputTokens}\t${approvedUsage.totalTokens}\t${approvedUsage.roles}`
    );
    expect(showText).toContain("※ 추정치 포함(실측 디스패치 시 정확)");

    output.length = 0;
    expect(await runCli(["project", "plan", "run", "list", projectId, "--json"], { cwd: localDir, env, stdout: (line) => output.push(line) })).toBe(0);
    const list = TeamRunListEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;
    expect(list.teamRuns).toEqual([
      {
        teamRunId: started.id,
        projectId,
        status: "completed",
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
        roleCount: 2,
        completedRoleCount: 2
      }
    ]);
  });

  it("rejects a project TeamRun before dispatch", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const localDir = await mkdtemp(path.join(tmpdir(), "baton-cli-team-run-reject-"));
    const env = { ...process.env, BATON_HOME: homeDir };
    const output: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);
    const projectId = await createProjectWithPlan({ env, cwd: localDir });

    expect(
      await runCli(["project", "plan", "run", "start", projectId, "--json"], {
        cwd: localDir,
        env,
        runner: mock.runner,
        stdout: (line) => output.push(line)
      })
    ).toBe(0);
    const started = TeamRunEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;

    output.length = 0;
    expect(
      await runCli(["project", "plan", "run", "reject", started.id, "--note", "stop", "--json"], {
        cwd: localDir,
        env,
        runner: mock.runner,
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    const rejected = TeamRunEnvelopeSchema.parse(JSON.parse(output.join("\n"))).data;
    expect(rejected.status).toBe("cancelled");
    expect(rejected.roles.map((role) => role.status)).toEqual(["skipped", "skipped"]);
    expect(mock.calls.some((call) => call.command === "codex" || call.command === "claude")).toBe(false);
  });

  it("fails project plan run start when no TeamPlan is stored", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const localDir = await mkdtemp(path.join(tmpdir(), "baton-cli-team-run-missing-plan-"));
    const env = { ...process.env, BATON_HOME: homeDir };
    const errors: string[] = [];
    const mock = createMockProcessRunner();

    expect(
      await runCli(["project", "create", "--name", "No Plan", "--source-kind", "local", "--source", localDir, "--agent", "codex"], {
        cwd: localDir,
        env
      })
    ).toBe(0);
    const projectId = (JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8")) as Array<{ id: string }>)[0]?.id ?? "";

    expect(
      await runCli(["project", "plan", "run", "start", projectId], {
        cwd: localDir,
        env,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(1);

    expect(errors.join("\n")).toContain(`TeamPlan not found for project: ${projectId}`);
    expect(mock.calls).toHaveLength(0);
  });

  it("fails plan generation before invoking the lead when preflight fails", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-cli-home-"));
    const errors: string[] = [];
    const env = { ...process.env, BATON_HOME: homeDir };
    const mock = createMockProcessRunner([{ stdout: "", stderr: "missing", exitCode: 1, durationMs: 1 }]);

    expect(
      await runCli(
        [
          "project",
          "create",
          "--name",
          "Team Project",
          "--source-kind",
          "github",
          "--source",
          "https://github.com/example/baton",
          "--agent",
          "codex",
          "--agent",
          "claude",
          "--lead",
          "claude"
        ],
        { env }
      )
    ).toBe(0);

    const projectId = (JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8")) as Array<{ id: string }>)[0]?.id ?? "";
    expect(
      await runCli(["project", "plan", "generate", projectId, "--overview", "Build a team plan."], {
        env,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(1);

    expect(errors.join("\n")).toContain("Lead AI claude is not available");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.args).toEqual(["--version"]);
  });

  it("lists bundled agents and workflows", async () => {
    const output: string[] = [];

    expect(await runCli(["agent", "list"], { cwd: repoRoot, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["workflow", "list"], { cwd: repoRoot, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("implementer");
    expect(output.join("\n")).toContain("default");
  });

  it("creates dry-run artifacts and prints planned steps", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-run-"));
    await writeWorkflow(cwd, ["analyze"]);
    const output: string[] = [];

    expect(await runCli(["run", "Build", "Baton", "--dry-run"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("planned");
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    expect(runs).toHaveLength(1);
    expect(await readFile(path.join(cwd, ".baton", "runs", runs[0] ?? "", "request.md"), "utf8")).toBe("Build Baton\n");
  });

  it("executes a run with the default StubWorker registry", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-run-"));
    await writeWorkflow(cwd, ["analyze"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    const code = await runCli(["run", "Build", "Baton"], {
      cwd,
      runner: mock.runner,
      stdout: (line) => output.push(line),
      stderr: (line) => errors.push(line)
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("completed");
    expect(errors.join("\n")).toContain("StubWorker");
    expect(mock.calls.some((call) => call.command === "codex")).toBe(false);
    expect(mock.calls.some((call) => call.command === "claude")).toBe(false);
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    expect(mock.calls[0]?.args).toEqual(["worktree", "add", path.join(cwd, ".baton", "worktrees", runId), "-b", `baton/${runId}`, "main"]);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runs[0] ?? "", "run.json"), "utf8")) as Run;
    expect(run.steps[0]?.reason).toBe("Completed by stub worker.");
  });

  it("generates finalize artifacts on a successful run and exports them to the journal", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-finalize-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["analyze", "finalize"]);
    const output: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(
      await runCli(["run", "Build", "Baton"], {
        cwd,
        env: testEnv({ BATON_OBSIDIAN_VAULT: vault }),
        runner: mock.runner,
        stdout: (line) => output.push(line)
      })
    ).toBe(0);

    const runId = await onlyRunId(cwd);
    const runDirectory = path.join(cwd, ".baton", "runs", runId);
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    const run = JSON.parse(await readFile(path.join(runDirectory, "run.json"), "utf8")) as Run;
    const finalSummary = await readFile(path.join(runDirectory, "final_summary.md"), "utf8");
    const prDescription = await readFile(path.join(runDirectory, "pr_description.md"), "utf8");

    expect(output.join("\n")).toContain("completed");
    expect(run.status).toBe("completed");
    expect(run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
    expect(run.steps[1]?.artifacts).toEqual(
      expect.arrayContaining([path.join(runDirectory, "final_summary.md"), path.join(runDirectory, "pr_description.md")])
    );
    expect(finalSummary).toContain("# Final Summary");
    expect(finalSummary).toContain("Present source artifacts: (none)");
    expect(prDescription).toContain("# Build Baton");
    expect(await readFile(path.join(runDirectory, "logs", "finalize.stdout.log"), "utf8")).toContain(`cwd: ${worktreePath}`);
    expect(await readFile(path.join(vault, "Baton", "Runs", runId, "final_summary.md"), "utf8")).toBe(finalSummary);
    expect(await readFile(path.join(vault, "Baton", "Runs", runId, "pr_description.md"), "utf8")).toBe(prDescription);
  });

  it("keeps the tester role stubbed when --test is not provided", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-stub-"));
    await writeWorkflow(cwd, ["test"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(await runCli(["run", "Build"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(0);

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.command).toBe("git");
    expect(mock.calls.some((call) => call.command === "pnpm")).toBe(false);
    expect(errors.join("\n")).toContain("StubWorker");
  });

  it("runs the tester step in the worktree when --test and --test-command are provided", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-runner-"));
    await writeWorkflow(cwd, ["test"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "tests passed", stderr: "", exitCode: 0, durationMs: 5 }
    ]);

    expect(
      await runCli(["run", "Build", "--test", "--test-command", "pnpm test"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const runId = await onlyRunId(cwd);
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    const testCall = mock.calls.find((call) => call.command === "pnpm");
    expect(testCall).toEqual({
      command: "pnpm",
      args: ["test"],
      options: { cwd: worktreePath }
    });
    expect(output.join("\n")).toContain("completed");
    expect(errors.join("\n")).toContain("TestRunnerAdapter for tester");
    const testResult = await readFile(path.join(cwd, ".baton", "runs", runId, "test_result.md"), "utf8");
    expect(testResult).toContain("Summary: PASS");
    expect(testResult).toContain("tests passed");
  });

  it("uses config test.command when --test-command is omitted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-config-"));
    await writeWorkflow(cwd, ["test"]);
    await mkdir(path.join(cwd, ".baton"), { recursive: true });
    await writeFile(path.join(cwd, ".baton", "config.json"), `${JSON.stringify({ version: 1, test: { command: ["corepack", "pnpm", "test"] } }, null, 2)}\n`, "utf8");
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "ok", stderr: "", exitCode: 0, durationMs: 5 }
    ]);

    expect(await runCli(["run", "Build", "--test"], { cwd, runner: mock.runner })).toBe(0);

    const runId = await onlyRunId(cwd);
    expect(mock.calls.find((call) => call.command === "corepack")).toEqual({
      command: "corepack",
      args: ["pnpm", "test"],
      options: { cwd: path.join(cwd, ".baton", "worktrees", runId) }
    });
  });

  it("uses config worker defaults when run flags are omitted", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-run-config-"));
    await writeWorkflow(cwd, ["test"]);
    await mkdir(path.join(cwd, ".baton"), { recursive: true });
    await writeFile(
      path.join(cwd, ".baton", "config.json"),
      `${JSON.stringify({ version: 1, workers: { test: true }, test: { command: ["pnpm", "test"] } }, null, 2)}\n`,
      "utf8"
    );
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "ok", stderr: "", exitCode: 0, durationMs: 5 }
    ]);

    expect(await runCli(["run", "Build"], { cwd, runner: mock.runner })).toBe(0);

    const runId = await onlyRunId(cwd);
    expect(mock.calls.find((call) => call.command === "pnpm")).toEqual({
      command: "pnpm",
      args: ["test"],
      options: { cwd: path.join(cwd, ".baton", "worktrees", runId) }
    });
  });

  it("lets negative flags override config worker defaults", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-run-config-off-"));
    await writeWorkflow(cwd, ["test"]);
    await mkdir(path.join(cwd, ".baton"), { recursive: true });
    await writeFile(
      path.join(cwd, ".baton", "config.json"),
      `${JSON.stringify({ version: 1, workers: { test: true }, test: { command: ["pnpm", "test"] } }, null, 2)}\n`,
      "utf8"
    );
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(await runCli(["run", "Build", "--no-test"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(0);

    const runId = await onlyRunId(cwd);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runId, "run.json"), "utf8")) as Run;
    expect(mock.calls.some((call) => call.command === "pnpm")).toBe(false);
    expect(run.steps[0]?.reason).toBe("Completed by stub worker.");
    expect(errors.join("\n")).toContain("StubWorker");
  });

  it("rejects conflicting positive and negative worker flags", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-run-conflict-"));
    const errors: string[] = [];
    const mock = createMockProcessRunner();

    expect(await runCli(["run", "Build", "--codex", "--no-codex"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(1);

    expect(errors.join("\n")).toContain("Cannot combine --codex and --no-codex");
    expect(mock.calls).toHaveLength(0);
  });

  it("warns and keeps tester stubbed when --test has no command", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-missing-"));
    await writeWorkflow(cwd, ["test"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(await runCli(["run", "Build", "--test"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(0);

    const runId = await onlyRunId(cwd);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runId, "run.json"), "utf8")) as Run;
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls.some((call) => call.command === "pnpm")).toBe(false);
    expect(errors.join("\n")).toContain("--test requested but no test command was configured");
    expect(run.steps[0]?.reason).toBe("Completed by stub worker.");
  });

  it("marks the test step failed and skips remaining steps when the command exits non-zero", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-fail-"));
    await writeWorkflow(cwd, ["test", "review"]);
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "failing test", stderr: "assertion failed", exitCode: 1, durationMs: 5 }
    ]);

    expect(await runCli(["run", "Build", "--test", "--test-command", "pnpm test"], { cwd, runner: mock.runner })).toBe(1);

    const runId = await onlyRunId(cwd);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runId, "run.json"), "utf8")) as Run;
    expect(run.status).toBe("failed");
    expect(run.steps[0]).toMatchObject({ id: "test", status: "failed" });
    expect(run.steps[1]).toMatchObject({ id: "review", status: "skipped", reason: "Previous step failed: test" });
    expect(await readFile(path.join(cwd, ".baton", "runs", runId, "test_result.md"), "utf8")).toContain("Summary: FAIL");
  });

  it("uses --fix with codex to run fixer once and retry a failed test", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-fix-codex-"));
    await writeWorkflow(cwd, ["test", "review"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "failing test", stderr: "assertion failed", exitCode: 1, durationMs: 5 },
      { stdout: "fixed", stderr: "", exitCode: 0, durationMs: 6 },
      { stdout: "tests passed", stderr: "", exitCode: 0, durationMs: 5 }
    ]);

    expect(
      await runCli(["run", "Build", "--codex", "--test", "--test-command", "pnpm test", "--fix"], {
        cwd,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const runId = await onlyRunId(cwd);
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runId, "run.json"), "utf8")) as Run;
    const codexExecCalls = mock.calls.filter((call) => call.command === "codex" && call.args[0] === "exec");
    const testCalls = mock.calls.filter((call) => call.command === "pnpm");

    expect(run.status).toBe("completed");
    expect(run.steps[0]).toMatchObject({ id: "test", status: "completed", attempts: 1 });
    expect(codexExecCalls).toHaveLength(1);
    expect(codexExecCalls[0]?.options?.cwd).toBe(worktreePath);
    expect(codexExecCalls[0]?.options?.input).toContain("Fix attempt: 1 of 1");
    expect(testCalls).toHaveLength(2);
    expect(testCalls.map((call) => call.options?.cwd)).toEqual([worktreePath, worktreePath]);
    expect(errors.join("\n")).not.toContain("--fix requested without --codex");
  });

  it("bounds --fix retries to --max-fix-attempts and warns when fixer is stubbed", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-fix-stub-"));
    await writeWorkflow(cwd, ["test", "review"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "failing test", stderr: "assertion failed", exitCode: 1, durationMs: 5 },
      { stdout: "still failing", stderr: "assertion failed", exitCode: 1, durationMs: 5 },
      { stdout: "still failing", stderr: "assertion failed", exitCode: 1, durationMs: 5 }
    ]);

    expect(
      await runCli(["run", "Build", "--test", "--test-command", "pnpm test", "--fix", "--max-fix-attempts", "2"], {
        cwd,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(1);

    const runId = await onlyRunId(cwd);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runId, "run.json"), "utf8")) as Run;
    const testCalls = mock.calls.filter((call) => call.command === "pnpm");

    expect(run.status).toBe("failed");
    expect(run.steps[0]).toMatchObject({ id: "test", status: "failed", attempts: 2 });
    expect(run.steps[1]).toMatchObject({ id: "review", status: "skipped" });
    expect(testCalls).toHaveLength(3);
    expect(mock.calls.some((call) => call.command === "codex")).toBe(false);
    expect(errors.join("\n")).toContain("--fix requested without --codex");
  });

  it("rejects invalid --max-fix-attempts values before creating a run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-fix-invalid-"));
    await writeWorkflow(cwd, ["test"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner();

    expect(
      await runCli(["run", "Build", "--fix", "--max-fix-attempts", "0"], {
        cwd,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(1);

    expect(errors.join("\n")).toContain("Usage:");
    expect(errors.join("\n")).toContain("--max-fix-attempts <n>");
    expect(mock.calls).toHaveLength(0);
    await expect(readdir(path.join(cwd, ".baton", "runs"))).rejects.toThrow();
  });

  it("automatically exports an actual run journal with the selected worker registry", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-run-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["analyze"]);
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(
      await runCli(["run", "Build", "Baton"], {
        cwd,
        env: testEnv({ BATON_OBSIDIAN_VAULT: vault }),
        runner: mock.runner,
        clock: fixedClock("2026-06-15T00:00:00.000Z")
      })
    ).toBe(0);

    const runId = await onlyRunId(cwd);
    const note = await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8");
    const index = await readFile(path.join(vault, "Baton", "Runs.md"), "utf8");

    expect(note).toContain('status: "completed"');
    expect(note).toContain('  "analyst": "stub"');
    expect(note).toContain("updatedAt: \"2026-06-15T00:00:00.000Z\"");
    expect(await readFile(path.join(vault, "Baton", "Runs", runId, "request.md"), "utf8")).toBe("Build Baton\n");
    expect(index).toContain("```dataview");
    expect(index).toContain(`[[Baton/Runs/${runId}]]`);
  });

  it("records claude workers in journal frontmatter when claude is selected", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-claude-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["analyze"]);
    const mock = createMockProcessRunner([
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "# Analysis", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(
      await runCli(["run", "Build", "--claude"], {
        cwd,
        env: testEnv({ BATON_OBSIDIAN_VAULT: vault }),
        runner: mock.runner,
        clock: fixedClock("2026-06-15T00:00:00.000Z")
      })
    ).toBe(0);

    const runId = await onlyRunId(cwd);
    const note = await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8");
    expect(note).toContain('  "analyst": "claude"');
    expect(note).toContain(`![[${runId}/analysis.md]]`);
    expect(await readFile(path.join(vault, "Baton", "Runs", runId, "analysis.md"), "utf8")).toBe("# Analysis");
  });

  it("prints run status from persisted state", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-status-"));
    await writeWorkflow(cwd, ["analyze"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const output: string[] = [];
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "completed",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      steps: [{ id: "analyze", type: "analyze", status: "completed" }]
    });

    expect(await runCli(["run", "status", "run-1"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("Run run-1 completed");
    expect(output.join("\n")).toContain("analyze");
  });

  it("lists runs in createdAt order with a summary", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-list-"));
    const output: string[] = [];
    await saveRun(cwd, runFixture({ id: "run-old", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }));
    await saveRun(cwd, runFixture({ id: "run-new", status: "failed", createdAt: "2026-06-16T00:00:00.000Z" }));

    expect(await runCli(["run", "list"], { cwd, stdout: (line) => output.push(line) })).toBe(0);

    const text = output.join("\n");
    expect(text).toContain("Run ID");
    expect(text).toContain("Workflow");
    expect(text).toContain("Steps");
    expect(text.indexOf("run-new")).toBeLessThan(text.indexOf("run-old"));
    expect(text).toContain("Total: 2");
    expect(text).toContain("completed: 1");
    expect(text).toContain("failed: 1");
  });

  it("supports run list status, limit, and json output", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-list-json-"));
    const output: string[] = [];
    await saveRun(cwd, runFixture({ id: "completed-old", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }));
    await saveRun(cwd, runFixture({ id: "failed-new", status: "failed", createdAt: "2026-06-17T00:00:00.000Z" }));
    await saveRun(cwd, runFixture({ id: "completed-new", status: "completed", createdAt: "2026-06-16T00:00:00.000Z" }));

    expect(await runCli(["run", "list", "--status", "completed", "--limit", "1", "--json"], { cwd, stdout: (line) => output.push(line) })).toBe(0);

    const parsed = RunListEnvelopeSchema.parse(JSON.parse(output.join("\n")));
    expect(parsed).toEqual({
      schemaVersion: 1,
      kind: "run-list",
      data: {
        runs: [
          {
            runId: "completed-new",
            status: "completed",
            dryRun: false,
            workflowId: "default",
            createdAt: "2026-06-16T00:00:00.000Z",
            updatedAt: "2026-06-15T12:00:00.000Z",
            stepCount: 1,
            outcome: "completed"
          }
        ],
        skipped: 0
      }
    });
  });

  it("reports skipped runs and handles empty history", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-list-skip-"));
    const output: string[] = [];
    await saveRun(cwd, runFixture({ id: "valid" }));
    await mkdir(path.join(cwd, ".baton", "runs", "bad-json"), { recursive: true });
    await mkdir(path.join(cwd, ".baton", "runs", "missing-run-json"), { recursive: true });
    await writeFile(path.join(cwd, ".baton", "runs", "bad-json", "run.json"), "{", "utf8");

    expect(await runCli(["run", "list"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("2 skipped");

    const emptyCwd = await mkdtemp(path.join(tmpdir(), "baton-cli-list-empty-"));
    output.length = 0;
    expect(await runCli(["run", "list"], { cwd: emptyCwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain("No runs found.");
  });

  it("prints state as text and as a state json envelope", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-state-"));
    await saveRun(cwd, runFixture({ id: "run-old", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }));
    await saveRun(cwd, runFixture({ id: "run-new", status: "failed", createdAt: "2026-06-16T00:00:00.000Z" }));
    const output: string[] = [];

    expect(await runCli(["state"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    const text = output.join("\n");
    expect(text).toContain("Total: 2");
    expect(text).toContain("- completed: 1");
    expect(text).toContain("- failed: 1");
    expect(text).toContain("Recent runs:");
    expect(text.indexOf("run-new")).toBeLessThan(text.indexOf("run-old"));

    output.length = 0;
    expect(await runCli(["state", "--json"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    const parsed = StateEnvelopeSchema.parse(JSON.parse(output.join("\n")));
    expect(parsed).toEqual({
      schemaVersion: 1,
      kind: "state",
      data: {
        total: 2,
        byStatus: {
          planned: 0,
          running: 0,
          "awaiting-approval": 0,
          completed: 1,
          failed: 1,
          cancelled: 0
        },
        recent: [
          {
            runId: "run-new",
            status: "failed",
            dryRun: false,
            workflowId: "default",
            createdAt: "2026-06-16T00:00:00.000Z",
            updatedAt: "2026-06-15T12:00:00.000Z",
            stepCount: 1,
            outcome: "failed"
          },
          {
            runId: "run-old",
            status: "completed",
            dryRun: false,
            workflowId: "default",
            createdAt: "2026-06-15T00:00:00.000Z",
            updatedAt: "2026-06-15T12:00:00.000Z",
            stepCount: 1,
            outcome: "completed"
          }
        ]
      }
    });
  });

  it("prints watch --once as deterministic event NDJSON", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-watch-"));
    const output: string[] = [];
    await saveRun(cwd, runFixture({ id: "run-b", status: "running", createdAt: "2026-06-16T00:00:00.000Z" }));
    await saveRun(cwd, runFixture({ id: "run-a", status: "completed", createdAt: "2026-06-15T00:00:00.000Z" }));

    expect(await runCli(["watch", "--once"], { cwd, stdout: (line) => output.push(line) })).toBe(0);

    expect(output).toHaveLength(2);
    const events = output.map((line) => WatchEventEnvelopeSchema.parse(JSON.parse(line)));
    expect(events.map((event) => [event.kind, event.data.type, event.data.runId])).toEqual([
      ["event", "run.created", "run-a"],
      ["event", "run.created", "run-b"]
    ]);
    expect(events[0]?.schemaVersion).toBe(1);
    expect(events[0]?.data.status).toBe("completed");
    expect(events[1]?.data.status).toBe("running");
  });

  it("prints detailed run show output", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-show-"));
    const output: string[] = [];
    await saveRun(
      cwd,
      runFixture({
        id: "run-1",
        request: "Build Baton history",
        status: "completed",
        worktreePath: path.join(cwd, ".baton", "worktrees", "run-1"),
        baseBranch: "main",
        cleanedAt: "2026-06-15T13:00:00.000Z",
        approvals: [
          {
            runId: "run-1",
            stepId: "implement",
            status: "approved",
            createdAt: "2026-06-15T10:00:00.000Z",
            decidedAt: "2026-06-15T10:05:00.000Z",
            note: "Looks good"
          }
        ],
        steps: [
          {
            id: "implement",
            type: "implement",
            status: "completed",
            startedAt: "2026-06-15T10:00:00.000Z",
            completedAt: "2026-06-15T10:10:00.000Z",
            reason: "Completed by stub worker."
          }
        ]
      }),
      {
        "request.md": "Build Baton history\n",
        "logs/codex.stdout.log": "done\n"
      }
    );

    expect(await runCli(["run", "show", "run-1"], { cwd, stdout: (line) => output.push(line) })).toBe(0);

    const text = output.join("\n");
    expect(text).toContain("Request: Build Baton history");
    expect(text).toContain("Worktree:");
    expect(text).toContain("Cleaned: 2026-06-15T13:00:00.000Z");
    expect(text).toContain("implement");
    expect(text).toContain("Completed by stub worker.");
    expect(text).toContain("approved");
    expect(text).toContain("Looks good");
    expect(text).toContain("logs/codex.stdout.log");
    expect(text).toContain("run.json");
  });

  it("prints run show and status as run-detail json envelopes", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-show-json-"));
    await saveRun(
      cwd,
      runFixture({
        id: "run-1",
        request: "Build Baton history",
        status: "completed",
        steps: [{ id: "analyze", type: "analyze", status: "completed" }]
      }),
      {
        "request.md": "Build Baton history\n",
        "logs/codex.stdout.log": "done\n"
      }
    );

    const showOutput: string[] = [];
    expect(await runCli(["run", "show", "run-1", "--json"], { cwd, stdout: (line) => showOutput.push(line) })).toBe(0);
    const showParsed = RunDetailEnvelopeSchema.parse(JSON.parse(showOutput.join("\n")));
    expect(showParsed.kind).toBe("run-detail");
    expect(showParsed.data.run.id).toBe("run-1");
    expect(showParsed.data.artifacts).toEqual(["logs/codex.stdout.log", "request.md", "run.json"]);

    const statusOutput: string[] = [];
    expect(await runCli(["run", "status", "run-1", "--json"], { cwd, stdout: (line) => statusOutput.push(line) })).toBe(0);
    const statusParsed = RunDetailEnvelopeSchema.parse(JSON.parse(statusOutput.join("\n")));
    expect(statusParsed).toEqual(showParsed);
  });

  it("returns non-zero when run show cannot find the run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-show-missing-"));
    const errors: string[] = [];

    expect(await runCli(["run", "show", "missing"], { cwd, stderr: (line) => errors.push(line) })).toBe(1);

    expect(errors.join("\n")).toContain("Run state not found: missing");
  });

  it("keeps read API commands read-only", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-readonly-"));
    await saveRun(cwd, runFixture({ id: "run-1", status: "completed" }));
    const runPath = path.join(cwd, ".baton", "runs", "run-1", "run.json");
    const before = await readFile(runPath, "utf8");
    const mock = createMockProcessRunner();
    const output: string[] = [];

    expect(await runCli(["run", "list"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["run", "show", "run-1"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["run", "status", "run-1", "--json"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["state"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["watch", "--once"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);

    expect(await readFile(runPath, "utf8")).toBe(before);
    expect(mock.calls).toHaveLength(0);
  });

  it("approves a gated run and resumes it", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-approve-"));
    await writeWorkflow(cwd, ["implement"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(
      await runCli(["run", "Build", "Baton"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("awaiting-approval");
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";

    output.length = 0;
    expect(
      await runCli(["run", "approve", runId], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("completed");
  });

  it("updates the journal after approval resumes a gated run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-approve-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["implement"]);
    const mock = createMockProcessRunner([
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 }
    ]);

    expect(await runCli(["run", "Build"], { cwd, env: testEnv({ BATON_OBSIDIAN_VAULT: vault }), runner: mock.runner })).toBe(0);
    const runId = await onlyRunId(cwd);
    expect(await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8")).toContain('status: "awaiting-approval"');

    expect(await runCli(["run", "approve", runId], { cwd, env: testEnv({ BATON_OBSIDIAN_VAULT: vault }), runner: mock.runner })).toBe(0);

    const note = await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8");
    expect(note).toContain('status: "completed"');
    expect(note).toContain('  "implementer": "stub"');
  });

  it("rejects a gated run without resuming workers", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-reject-"));
    await writeWorkflow(cwd, ["implement"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(
      await runCli(["run", "Build", "Baton"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    output.length = 0;
    expect(
      await runCli(["run", "approve", runId, "--reject"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("cancelled");
    expect(output.join("\n")).toContain("skipped");
  });

  it("checks codex availability through ProcessRunner", async () => {
    const mock = createMockProcessRunner([{ stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 4 }]);
    const output: string[] = [];

    const code = await runCli(["codex", "doctor"], {
      cwd: repoRoot,
      runner: mock.runner,
      stdout: (line) => output.push(line)
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("Codex available");
    expect(mock.calls[0]).toEqual({
      command: "codex",
      args: ["--version"],
      options: { cwd: repoRoot, timeoutMs: 5000 }
    });
  });

  it("distinguishes missing codex from a command error", async () => {
    const missingRunner: ProcessRunner = {
      async run(): Promise<never> {
        throw new Error("spawn codex ENOENT");
      }
    };
    const missingErrors: string[] = [];
    expect(await runCli(["codex", "doctor"], { cwd: repoRoot, runner: missingRunner, stderr: (line) => missingErrors.push(line) })).toBe(1);
    expect(missingErrors.join("\n")).toContain("not installed");

    const errorMock = createMockProcessRunner([{ stdout: "", stderr: "bad config", exitCode: 2, durationMs: 4 }]);
    const commandErrors: string[] = [];
    expect(await runCli(["codex", "doctor"], { cwd: repoRoot, runner: errorMock.runner, stderr: (line) => commandErrors.push(line) })).toBe(1);
    expect(commandErrors.join("\n")).toContain("returned an error");
  });

  it("checks claude availability through ProcessRunner", async () => {
    const mock = createMockProcessRunner([{ stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 4 }]);
    const output: string[] = [];

    const code = await runCli(["claude", "doctor"], {
      cwd: repoRoot,
      runner: mock.runner,
      stdout: (line) => output.push(line)
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("Claude available");
    expect(mock.calls[0]).toEqual({
      command: "claude",
      args: ["--version"],
      options: { cwd: repoRoot, timeoutMs: 5000 }
    });
  });

  it("distinguishes missing claude from a command error", async () => {
    const missingRunner: ProcessRunner = {
      async run(): Promise<never> {
        throw new Error("spawn claude ENOENT");
      }
    };
    const missingErrors: string[] = [];
    expect(await runCli(["claude", "doctor"], { cwd: repoRoot, runner: missingRunner, stderr: (line) => missingErrors.push(line) })).toBe(1);
    expect(missingErrors.join("\n")).toContain("not installed");

    const errorMock = createMockProcessRunner([{ stdout: "", stderr: "bad config", exitCode: 2, durationMs: 4 }]);
    const commandErrors: string[] = [];
    expect(await runCli(["claude", "doctor"], { cwd: repoRoot, runner: errorMock.runner, stderr: (line) => commandErrors.push(line) })).toBe(1);
    expect(commandErrors.join("\n")).toContain("returned an error");
  });

  it("keeps provider registries scoped and maps release_writer to FinalizeWriter by default", () => {
    const stubbedRoles: AgentRole[] = ["analyst", "architect", "implementer", "tester", "reviewer", "fixer"];
    const defaults = createDefaultWorkerRegistry();
    const codex = createCodexWorkerRegistry();
    const claude = createWorkerRegistry({ claude: true });
    const test = createWorkerRegistry({ test: true, testCommand: { command: "pnpm", args: ["test"] } });
    const testWithoutCommand = createWorkerRegistry({ test: true });
    const combined = createWorkerRegistry({ codex: true, claude: true, test: true, testCommand: { command: "pnpm", args: ["test"] } });

    for (const role of stubbedRoles) {
      expect(defaults.registry.resolve(role)).toBeInstanceOf(StubWorker);
    }
    expect(defaults.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(defaults.stubRoles).not.toContain("release_writer");
    expect(codex.registry.resolve("implementer")).toBeInstanceOf(CodexExecAdapter);
    expect(codex.registry.resolve("fixer")).toBeInstanceOf(CodexExecAdapter);
    expect(codex.registry.resolve("analyst")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("architect")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("tester")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("reviewer")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(claude.registry.resolve("analyst")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(claude.registry.resolve("architect")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(claude.registry.resolve("reviewer")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(claude.registry.resolve("implementer")).toBeInstanceOf(StubWorker);
    expect(claude.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(test.registry.resolve("tester")).toBeInstanceOf(TestRunnerAdapter);
    expect(test.registry.resolve("implementer")).toBeInstanceOf(StubWorker);
    expect(test.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(test.testerRoles).toEqual(["tester"]);
    expect(test.stubRoles).not.toContain("tester");
    expect(testWithoutCommand.registry.resolve("tester")).toBeInstanceOf(StubWorker);
    expect(testWithoutCommand.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(testWithoutCommand.testerRoles).toEqual([]);
    expect(combined.registry.resolve("analyst")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(combined.registry.resolve("architect")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(combined.registry.resolve("reviewer")).toBeInstanceOf(ClaudeCodeAdapter);
    expect(combined.registry.resolve("implementer")).toBeInstanceOf(CodexExecAdapter);
    expect(combined.registry.resolve("fixer")).toBeInstanceOf(CodexExecAdapter);
    expect(combined.registry.resolve("tester")).toBeInstanceOf(TestRunnerAdapter);
    expect(combined.registry.resolve("release_writer")).toBeInstanceOf(FinalizeWriter);
    expect(combined.stubRoles).toEqual([]);
  });

  it("does not create a run or worktree when codex preflight fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-codex-fail-"));
    await writeWorkflow(cwd, ["implement"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "missing", exitCode: 1, durationMs: 2 }]);

    const code = await runCli(["run", "Build", "--codex"], {
      cwd,
      runner: mock.runner,
      stderr: (line) => errors.push(line)
    });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("returned an error");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.command).toBe("codex");
    await expect(readdir(path.join(cwd, ".baton", "runs"))).rejects.toThrow();
  });

  it("does not create a run or worktree when claude preflight fails", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-claude-fail-"));
    await writeWorkflow(cwd, ["analyze"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "missing", exitCode: 1, durationMs: 2 }]);

    const code = await runCli(["run", "Build", "--claude"], {
      cwd,
      runner: mock.runner,
      stderr: (line) => errors.push(line)
    });

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("returned an error");
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]?.command).toBe("claude");
    await expect(readdir(path.join(cwd, ".baton", "runs"))).rejects.toThrow();
  });

  it("runs claude for analysis and design roles when opted in", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-claude-"));
    await writeWorkflow(cwd, ["analyze", "design"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "# Analysis", stderr: "", exitCode: 0, durationMs: 3 },
      { stdout: "# Design", stderr: "", exitCode: 0, durationMs: 4 }
    ]);

    expect(
      await runCli(["run", "Build", "Baton", "--claude"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    const claudeExecCalls = mock.calls.filter((call) => call.command === "claude" && call.args[0] === "--print");

    expect(output.join("\n")).toContain("completed");
    expect(errors.join("\n")).toContain("ClaudeCodeAdapter");
    expect(mock.calls[0]).toMatchObject({ command: "claude", args: ["--version"] });
    expect(claudeExecCalls).toHaveLength(2);
    expect(claudeExecCalls.map((call) => call.options?.cwd)).toEqual([worktreePath, worktreePath]);
    expect(claudeExecCalls[0]?.options?.input).toContain("Step: analyze");
    expect(claudeExecCalls[1]?.options?.input).toContain("Step: design");
    expect(claudeExecCalls[0]?.args.join(" ")).not.toMatch(/write|edit|danger|full.access/i);
    expect(await readFile(path.join(cwd, ".baton", "runs", runId, "analysis.md"), "utf8")).toBe("# Analysis");
    expect(await readFile(path.join(cwd, ".baton", "runs", runId, "design.md"), "utf8")).toBe("# Design");
    expect(mock.calls.some((call) => call.command === "codex")).toBe(false);
  });

  it("runs codex after approval inside the run worktree when opted in", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-codex-"));
    await writeWorkflow(cwd, ["implement"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "done", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(
      await runCli(["run", "Build", "--codex"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    expect(output.join("\n")).toContain("awaiting-approval");

    output.length = 0;
    expect(
      await runCli(["run", "approve", runId, "--codex"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const codexExecCall = mock.calls.find((call) => call.command === "codex" && call.args[0] === "exec");
    expect(codexExecCall).toBeDefined();
    expect(codexExecCall?.args).toEqual(["exec", "--sandbox", "workspace-write"]);
    expect(codexExecCall?.args.join(" ")).not.toContain("Build");
    expect(codexExecCall?.options?.cwd).toBe(worktreePath);
    expect(codexExecCall?.options?.input).toContain("Build");
    expect(await readFile(path.join(cwd, ".baton", "runs", runId, "steps", "implement.prompt.md"), "utf8")).toContain("Build");
  });

  it("combines claude analysis with codex implementation roles", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-combined-"));
    await writeWorkflow(cwd, ["analyze", "implement"]);
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "# Analysis", stderr: "", exitCode: 0, durationMs: 3 },
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "implemented", stderr: "", exitCode: 0, durationMs: 4 }
    ]);

    expect(
      await runCli(["run", "Build", "--codex", "--claude"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    expect(output.join("\n")).toContain("awaiting-approval");
    expect(errors.join("\n")).toContain("CodexExecAdapter");
    expect(errors.join("\n")).toContain("ClaudeCodeAdapter");

    output.length = 0;
    expect(
      await runCli(["run", "approve", runId, "--codex", "--claude"], {
        cwd,
        runner: mock.runner,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const claudeExecCall = mock.calls.find((call) => call.command === "claude" && call.args[0] === "--print");
    const codexExecCall = mock.calls.find((call) => call.command === "codex" && call.args[0] === "exec");
    expect(claudeExecCall?.options?.cwd).toBe(worktreePath);
    expect(claudeExecCall?.options?.input).toContain("Step: analyze");
    expect(codexExecCall?.options?.cwd).toBe(worktreePath);
    expect(codexExecCall?.options?.input).toContain("Step: implement");
  });

  it("supports resume with codex opt-in", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-codex-resume-"));
    await writeWorkflow(cwd, ["implement"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      approvals: [{ runId: "run-1", stepId: "implement", status: "approved", createdAt: "2026-06-15T00:00:00.000Z", decidedAt: "2026-06-15T00:00:00.000Z" }],
      steps: [{ id: "implement", type: "implement", status: "planned" }]
    });
    const mock = createMockProcessRunner([
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "done", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(await runCli(["run", "resume", "run-1", "--codex"], { cwd, runner: mock.runner })).toBe(0);

    const codexExecCall = mock.calls.find((call) => call.command === "codex" && call.args[0] === "exec");
    expect(codexExecCall?.options?.cwd).toBe(worktreePath);
    expect(codexExecCall?.options?.input).toContain("Build Baton");
  });

  it("exports after resume and records codex workers", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-resume-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["implement"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      approvals: [{ runId: "run-1", stepId: "implement", status: "approved", createdAt: "2026-06-15T00:00:00.000Z", decidedAt: "2026-06-15T00:00:00.000Z" }],
      steps: [{ id: "implement", type: "implement", status: "planned" }]
    });
    const mock = createMockProcessRunner([
      { stdout: "codex 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "done", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(await runCli(["run", "resume", "run-1", "--codex"], { cwd, env: testEnv({ BATON_OBSIDIAN_VAULT: vault }), runner: mock.runner })).toBe(0);

    const note = await readFile(path.join(vault, "Baton", "Runs", "run-1.md"), "utf8");
    expect(note).toContain('status: "completed"');
    expect(note).toContain('  "implementer": "codex"');
  });

  it("supports resume with claude opt-in", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-claude-resume-"));
    await writeWorkflow(cwd, ["analyze"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [{ id: "analyze", type: "analyze", status: "planned" }]
    });
    const mock = createMockProcessRunner([
      { stdout: "claude 1.0.0\n", stderr: "", exitCode: 0, durationMs: 1 },
      { stdout: "# Analysis", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(await runCli(["run", "resume", "run-1", "--claude"], { cwd, runner: mock.runner })).toBe(0);

    const claudeExecCall = mock.calls.find((call) => call.command === "claude" && call.args[0] === "--print");
    expect(claudeExecCall?.options?.cwd).toBe(worktreePath);
    expect(claudeExecCall?.options?.input).toContain("Build Baton");
    expect(await readFile(path.join(cwd, ".baton", "runs", "run-1", "analysis.md"), "utf8")).toBe("# Analysis");
  });

  it("supports resume with test opt-in", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-resume-"));
    await writeWorkflow(cwd, ["test"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [{ id: "test", type: "test", status: "planned" }]
    });
    const mock = createMockProcessRunner([{ stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }]);

    expect(await runCli(["run", "resume", "run-1", "--test", "--test-command", "pnpm test"], { cwd, runner: mock.runner })).toBe(0);

    expect(mock.calls[0]).toEqual({
      command: "pnpm",
      args: ["test"],
      options: { cwd: worktreePath }
    });
    expect(await readFile(path.join(cwd, ".baton", "runs", "run-1", "test_result.md"), "utf8")).toContain("Summary: PASS");
  });

  it("supports resume with --fix and retries a failed persisted test step", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-fix-resume-"));
    await writeWorkflow(cwd, ["test"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [{ id: "test", type: "test", status: "planned" }]
    });
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "fail", stderr: "bad", exitCode: 1, durationMs: 3 },
      { stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(
      await runCli(["run", "resume", "run-1", "--test", "--test-command", "pnpm test", "--fix"], {
        cwd,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", "run-1", "run.json"), "utf8")) as Run;
    expect(mock.calls.filter((call) => call.command === "pnpm")).toHaveLength(2);
    expect(run.steps[0]).toMatchObject({ id: "test", status: "completed", attempts: 1 });
    expect(errors.join("\n")).toContain("--fix requested without --codex");
  });

  it("supports approve with test opt-in after a gated implement step", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-test-approve-"));
    await writeWorkflow(cwd, ["implement", "test"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "awaiting-approval",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [
        { id: "implement", type: "implement", status: "planned" },
        { id: "test", type: "test", status: "planned" }
      ]
    });
    const mock = createMockProcessRunner([{ stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }]);

    expect(await runCli(["run", "approve", "run-1", "--test", "--test-command", "pnpm test"], { cwd, runner: mock.runner })).toBe(0);

    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", "run-1", "run.json"), "utf8")) as Run;
    expect(mock.calls[0]).toEqual({
      command: "pnpm",
      args: ["test"],
      options: { cwd: worktreePath }
    });
    expect(run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
  });

  it("supports approve with --fix and retries a failed test after the gate", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-fix-approve-"));
    await writeWorkflow(cwd, ["implement", "test"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "request.md", "Build Baton\n");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "awaiting-approval",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [
        { id: "implement", type: "implement", status: "planned" },
        { id: "test", type: "test", status: "planned" }
      ]
    });
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "fail", stderr: "bad", exitCode: 1, durationMs: 3 },
      { stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }
    ]);

    expect(
      await runCli(["run", "approve", "run-1", "--test", "--test-command", "pnpm test", "--fix"], {
        cwd,
        runner: mock.runner,
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);

    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", "run-1", "run.json"), "utf8")) as Run;
    expect(mock.calls.filter((call) => call.command === "pnpm")).toHaveLength(2);
    expect(run.steps.map((step) => step.status)).toEqual(["completed", "completed"]);
    expect(run.steps[1]).toMatchObject({ id: "test", attempts: 1 });
    expect(errors.join("\n")).toContain("--fix requested without --codex");
  });

  it("cleans only terminal run worktrees and preserves run state", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-clean-"));
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "completed",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [{ id: "analyze", type: "analyze", status: "completed" }]
    });
    const output: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 1 }]);

    expect(await runCli(["run", "clean", "run-1"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);

    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0]).toEqual({
      command: "git",
      args: ["worktree", "remove", worktreePath],
      options: { cwd }
    });
    expect(output.join("\n")).toContain("Cleaned worktree");
    expect((await runStore.load("run-1")).cleanedAt).toBeDefined();
  });

  it("exports after clean without clobbering inferred worker metadata", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-clean-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["analyze"]);
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const worktreePath = path.join(cwd, ".baton", "worktrees", "run-1");
    await artifactStore.writeArtifact("run-1", "steps/analyze.result.json", `${JSON.stringify({ success: true, metadata: { provider: "claude" } }, null, 2)}\n`);
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "completed",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath,
      baseBranch: "main",
      steps: [{ id: "analyze", type: "analyze", status: "completed" }]
    });
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 1 }]);

    expect(await runCli(["run", "clean", "run-1"], { cwd, env: testEnv({ BATON_OBSIDIAN_VAULT: vault }), runner: mock.runner })).toBe(0);

    const note = await readFile(path.join(vault, "Baton", "Runs", "run-1.md"), "utf8");
    const exportedRun = JSON.parse(await readFile(path.join(vault, "Baton", "Runs", "run-1", "run.json"), "utf8")) as Run;
    expect(note).toContain('  "analyst": "claude"');
    expect(exportedRun.cleanedAt).toBeDefined();
  });

  it("treats missing journal config as no-op and keeps export failures non-fatal", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-noop-"));
    await writeWorkflow(cwd, ["analyze"]);
    const errors: string[] = [];
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);

    expect(await runCli(["run", "Build"], { cwd, env: testEnv(), runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(0);
    await expect(readdir(path.join(cwd, "Baton"))).rejects.toThrow();

    const vaultFile = path.join(await mkdtemp(path.join(tmpdir(), "baton-cli-vault-file-")), "vault.md");
    await writeFile(vaultFile, "not a directory", "utf8");
    expect(await runCli(["run", "Build", "again"], { cwd, env: testEnv({ BATON_OBSIDIAN_VAULT: vaultFile }), runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(0);
    expect(errors.join("\n")).toContain("Warning: failed to export Obsidian journal");
  });

  it("backfills existing runs with journal sync", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-journal-sync-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-cli-vault-"));
    await writeWorkflow(cwd, ["analyze"]);
    const mock = createMockProcessRunner([{ stdout: "", stderr: "", exitCode: 0, durationMs: 2 }]);
    const output: string[] = [];

    expect(await runCli(["run", "Build"], { cwd, env: testEnv(), runner: mock.runner })).toBe(0);
    const runId = await onlyRunId(cwd);
    expect(
      await runCli(["journal", "sync"], {
        cwd,
        env: testEnv({ BATON_OBSIDIAN_VAULT: vault }),
        stdout: (line) => output.push(line),
        clock: fixedClock("2026-06-15T00:00:00.000Z")
      })
    ).toBe(0);

    expect(output.join("\n")).toContain("Synced 1 Baton run journal note");
    expect(await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8")).toContain("Build");
    expect(await readFile(path.join(vault, "Baton", "Runs.md"), "utf8")).toContain(`[[Baton/Runs/${runId}]]`);
  });

  it("refuses to clean a non-terminal run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-clean-active-"));
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "running",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath: path.join(cwd, ".baton", "worktrees", "run-1"),
      steps: [{ id: "analyze", type: "analyze", status: "running" }]
    });
    const errors: string[] = [];
    const mock = createMockProcessRunner();

    expect(await runCli(["run", "clean", "run-1"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("Cannot clean");
    expect(mock.calls).toHaveLength(0);
  });

  it("refuses to clean the repository root", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-clean-root-"));
    const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
    const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    await runStore.save({
      id: "run-1",
      request: "Build Baton",
      workflowId: "default",
      status: "completed",
      dryRun: false,
      createdAt: "2026-06-15T00:00:00.000Z",
      worktreePath: cwd,
      steps: [{ id: "analyze", type: "analyze", status: "completed" }]
    });
    const errors: string[] = [];
    const mock = createMockProcessRunner();

    expect(await runCli(["run", "clean", "run-1"], { cwd, runner: mock.runner, stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("Refusing");
    expect(mock.calls).toHaveLength(0);
  });

  it("prints db status with index row count", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-db-status-"));
    const output: string[] = [];
    const db = new FakeDbClient();
    await db.execute("INSERT INTO runs", ["run-1"]);

    const code = await dbCommand(["status"], commandContext(cwd, output), {
      openDatabase: async () => db
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain(path.join(cwd, ".baton", "baton.db"));
    expect(output.join("\n")).toContain("SQLite: available");
    expect(output.join("\n")).toContain("runs rows: 1");
    expect(db.closed).toBe(true);
  });

  it("reports db status as unavailable without failing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-db-status-unavailable-"));
    const output: string[] = [];

    const code = await dbCommand(["status"], commandContext(cwd, output), {
      openDatabase: async () => undefined
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("SQLite: unavailable");
  });

  it("reindexes db rows from run.json files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-db-reindex-"));
    const output: string[] = [];
    const db = new FakeDbClient();
    await saveRun(cwd, runFixture({ id: "run-1", status: "completed" }));

    const code = await dbCommand(["reindex"], commandContext(cwd, output), {
      openDatabase: async () => db
    });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("Reindexed 1 runs");
    expect(db.rowIds()).toEqual(["run-1"]);
    expect(db.closed).toBe(true);
  });

  it("refuses db reindex when sqlite is unavailable", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-db-reindex-unavailable-"));
    const errors: string[] = [];

    const code = await dbCommand(
      ["reindex"],
      commandContext(cwd, [], errors),
      {
        openDatabase: async () => undefined
      }
    );

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("SQLite is unavailable");
  });

  it("rejects unknown db subcommands", async () => {
    const errors: string[] = [];

    expect(await dbCommand(["unknown"], commandContext(process.cwd(), [], errors))).toBe(1);

    expect(errors.join("\n")).toContain("Unknown db command");
    expect(errors.join("\n")).toContain("baton db status");
  });

  it("returns non-zero for unknown commands and missing args", async () => {
    const errors: string[] = [];

    expect(await runCli(["unknown"], { stderr: (line) => errors.push(line) })).toBe(1);
    expect(await runCli(["project", "add"], { stderr: (line) => errors.push(line) })).toBe(1);
    expect(await runCli(["run"], { stderr: (line) => errors.push(line) })).toBe(1);
    expect(await runCli(["run", "status"], { stderr: (line) => errors.push(line) })).toBe(1);
    expect(errors.join("\n")).toContain("Usage:");
  });
});

type WorkflowStepId = "analyze" | "design" | "implement" | "test" | "review" | "finalize";

async function createProjectWithPlan(options: { env: NodeJS.ProcessEnv; cwd: string }): Promise<string> {
  expect(
    await runCli(["project", "create", "--name", "TeamRun Project", "--source-kind", "local", "--source", options.cwd, "--agent", "codex"], {
      cwd: options.cwd,
      env: options.env,
      stdout: () => undefined
    })
  ).toBe(0);

  const projectId = (JSON.parse(await readFile(path.join(options.env.BATON_HOME ?? "", "projects.json"), "utf8")) as Array<{ id: string }>)[0]?.id ?? "";
  const plan = {
    roles: [
      {
        id: "lead",
        name: "Lead",
        description: "Coordinates the run.",
        assignedAgentId: "codex",
        instructions: "Coordinate safely."
      },
      {
        id: "implementer",
        name: "Implementer",
        description: "Implements the run.",
        assignedAgentId: "codex",
        instructions: "Implement safely.",
        reportsTo: "lead"
      }
    ]
  };

  expect(
    await runCli(["project", "plan", "set", projectId], {
      cwd: options.cwd,
      env: options.env,
      stdin: JSON.stringify(plan),
      stdout: () => undefined
    })
  ).toBe(0);

  return projectId;
}

function usageTotals(teamRun: TeamRun): { inputTokens: number; outputTokens: number; totalTokens: number; roles: number } {
  return teamRun.roles.reduce(
    (totals, role) => {
      if (role.usage === undefined) {
        return totals;
      }
      return {
        inputTokens: totals.inputTokens + role.usage.inputTokens,
        outputTokens: totals.outputTokens + role.usage.outputTokens,
        totalTokens: totals.totalTokens + role.usage.inputTokens + role.usage.outputTokens,
        roles: totals.roles + 1
      };
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, roles: 0 }
  );
}

async function writeWorkflow(cwd: string, stepIds: WorkflowStepId[]): Promise<void> {
  const workflowsDir = path.join(cwd, "examples", "workflows");
  await mkdir(workflowsDir, { recursive: true });
  const stepBlocks = stepIds.map((id) => {
    if (id === "implement") {
      return ["  - id: implement", "    name: Implement", "    type: implement", "    role: implementer"].join("\n");
    }
    if (id === "design") {
      return ["  - id: design", "    name: Design", "    type: design", "    role: architect"].join("\n");
    }
    if (id === "test") {
      return ["  - id: test", "    name: Test", "    type: test", "    role: tester"].join("\n");
    }
    if (id === "review") {
      return ["  - id: review", "    name: Review", "    type: review", "    role: reviewer"].join("\n");
    }
    if (id === "finalize") {
      return ["  - id: finalize", "    name: Finalize", "    type: finalize", "    role: release_writer"].join("\n");
    }
    return ["  - id: analyze", "    name: Analyze", "    type: analyze", "    role: analyst"].join("\n");
  });
  await writeFile(path.join(workflowsDir, "default.workflow.yaml"), ["id: default", "name: Default", "steps:", ...stepBlocks].join("\n"), "utf8");
}

async function onlyRunId(cwd: string): Promise<string> {
  const runs = await readdir(path.join(cwd, ".baton", "runs"));
  expect(runs).toHaveLength(1);
  return runs[0] ?? "";
}

async function saveRun(cwd: string, run: Run, artifacts: Record<string, string> = {}): Promise<void> {
  const artifactStore = new ArtifactStore({ workspaceRoot: cwd });
  const runStore = new RunStore({ artifactStore, clock: fixedClock("2026-06-15T12:00:00.000Z") });
  await runStore.save(run);
  for (const [name, content] of Object.entries(artifacts)) {
    await artifactStore.writeArtifact(run.id, name, content);
  }
}

function runFixture(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    request: "Build Baton",
    workflowId: "default",
    status: "running",
    dryRun: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    steps: [{ id: "analyze", type: "analyze", status: "completed" }],
    ...overrides
  };
}

function commandContext(cwd: string, output: string[] = [], errors: string[] = []) {
  return {
    cwd,
    env: testEnv(),
    stdout: (line: string): void => {
      output.push(line);
    },
    stderr: (line: string): void => {
      errors.push(line);
    },
    runner: createMockProcessRunner().runner,
    clock: fixedClock("2026-06-15T00:00:00.000Z")
  };
}

class FakeDbClient implements DbClient {
  public closed = false;
  private readonly rows = new Map<string, DbQueryParams>();

  public rowIds(): string[] {
    return [...this.rows.keys()].sort();
  }

  public async execute(sql: string, params: DbQueryParams = []): Promise<void> {
    if (sql.includes("CREATE TABLE IF NOT EXISTS runs")) {
      return;
    }
    if (sql.trim() === "DELETE FROM runs") {
      this.rows.clear();
      return;
    }
    if (sql.includes("INSERT INTO runs")) {
      const runId = params[0];
      if (typeof runId !== "string") {
        throw new Error("Expected run id parameter.");
      }
      this.rows.set(runId, params);
      return;
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  public async query<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
    if (sql.includes("COUNT(*) AS count")) {
      return [{ count: this.rows.size } as unknown as T];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const { BATON_OBSIDIAN_VAULT: _obsidianVault, ...env } = process.env;
  void _obsidianVault;
  return { ...env, ...overrides };
}
