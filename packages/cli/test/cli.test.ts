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
import type { ProcessRunner } from "@baton/core";
import type { AgentRole, Run } from "@baton/schemas";

import { runCli } from "../src/main.js";
import { resolveTestCommand } from "../src/commands/run.js";
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
  });

  it("prints run help", async () => {
    const output: string[] = [];

    const code = await runCli(["run", "--help"], { stdout: (line) => output.push(line) });

    expect(code).toBe(0);
    expect(output.join("\n")).toContain("baton run list");
    expect(output.join("\n")).toContain("baton run show <runId>");
    expect(output.join("\n")).toContain("baton run status <runId>");
    expect(output.join("\n")).toContain("--test-command <command>");
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

  it("initializes a workspace idempotently", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-init-"));
    const output: string[] = [];

    expect(await runCli(["init"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["init"], { cwd, stdout: (line) => output.push(line) })).toBe(0);
    expect(JSON.parse(await readFile(path.join(cwd, ".baton", "config.json"), "utf8"))).toEqual({ version: 1 });
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

    const parsed = JSON.parse(output.join("\n")) as unknown;
    expect(parsed).toEqual([
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
    ]);
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

  it("returns non-zero when run show cannot find the run", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-show-missing-"));
    const errors: string[] = [];

    expect(await runCli(["run", "show", "missing"], { cwd, stderr: (line) => errors.push(line) })).toBe(1);

    expect(errors.join("\n")).toContain("Run state not found: missing");
  });

  it("keeps run list and show read-only", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-cli-readonly-"));
    await saveRun(cwd, runFixture({ id: "run-1", status: "completed" }));
    const runPath = path.join(cwd, ".baton", "runs", "run-1", "run.json");
    const before = await readFile(runPath, "utf8");
    const mock = createMockProcessRunner();
    const output: string[] = [];

    expect(await runCli(["run", "list"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);
    expect(await runCli(["run", "show", "run-1"], { cwd, runner: mock.runner, stdout: (line) => output.push(line) })).toBe(0);

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

function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const { BATON_OBSIDIAN_VAULT: _obsidianVault, ...env } = process.env;
  void _obsidianVault;
  return { ...env, ...overrides };
}
