import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ArtifactStore, CodexExecAdapter, RunStore, StubWorker, createMockProcessRunner, fixedClock } from "@baton/core";
import type { ProcessRunner } from "@baton/core";
import type { AgentRole, Run } from "@baton/schemas";

import { runCli } from "../src/main.js";
import { createCodexWorkerRegistry, createDefaultWorkerRegistry } from "../src/registry.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("@baton/cli", () => {
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
    expect(output.join("\n")).toContain("baton run status <runId>");
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
    const runs = await readdir(path.join(cwd, ".baton", "runs"));
    const runId = runs[0] ?? "";
    expect(mock.calls[0]?.args).toEqual(["worktree", "add", path.join(cwd, ".baton", "worktrees", runId), "-b", `baton/${runId}`, "main"]);
    const run = JSON.parse(await readFile(path.join(cwd, ".baton", "runs", runs[0] ?? "", "run.json"), "utf8")) as Run;
    expect(run.steps[0]?.reason).toBe("Completed by stub worker.");
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

  it("keeps the default registry stubbed and limits the codex registry to implementation roles", () => {
    const roles: AgentRole[] = ["analyst", "architect", "implementer", "tester", "reviewer", "fixer", "release_writer"];
    const defaults = createDefaultWorkerRegistry();
    const codex = createCodexWorkerRegistry();

    for (const role of roles) {
      expect(defaults.registry.resolve(role)).toBeInstanceOf(StubWorker);
    }
    expect(codex.registry.resolve("implementer")).toBeInstanceOf(CodexExecAdapter);
    expect(codex.registry.resolve("fixer")).toBeInstanceOf(CodexExecAdapter);
    expect(codex.registry.resolve("analyst")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("architect")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("tester")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("reviewer")).toBeInstanceOf(StubWorker);
    expect(codex.registry.resolve("release_writer")).toBeInstanceOf(StubWorker);
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

async function writeWorkflow(cwd: string, stepIds: Array<"analyze" | "implement">): Promise<void> {
  const workflowsDir = path.join(cwd, "examples", "workflows");
  await mkdir(workflowsDir, { recursive: true });
  const stepBlocks = stepIds.map((id) => {
    if (id === "implement") {
      return ["  - id: implement", "    name: Implement", "    type: implement", "    role: implementer"].join("\n");
    }
    return ["  - id: analyze", "    name: Analyze", "    type: analyze", "    role: analyst"].join("\n");
  });
  await writeFile(path.join(workflowsDir, "default.workflow.yaml"), ["id: default", "name: Default", "steps:", ...stepBlocks].join("\n"), "utf8");
}
