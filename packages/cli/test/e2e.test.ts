import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createMockProcessRunner, fixedClock } from "@baton/core";
import type { Run } from "@baton/schemas";

import { runCli } from "../src/main.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const canonicalClock = fixedClock("2026-06-16T00:00:00.000Z");

describe("canonical Baton E2E", () => {
  it("completes the default workflow through public CLI approval gates hermetically", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-e2e-cwd-"));
    const home = await mkdtemp(path.join(tmpdir(), "baton-e2e-home-"));
    const vault = await mkdtemp(path.join(tmpdir(), "baton-e2e-vault-"));
    await copyDefaultWorkflow(cwd);

    const env = testEnv({ BATON_HOME: home, BATON_OBSIDIAN_VAULT: vault });
    const output: string[] = [];
    const errors: string[] = [];
    const mock = createMockProcessRunner([
      { stdout: "created worktree", stderr: "", exitCode: 0, durationMs: 2 },
      { stdout: "canonical tests passed", stderr: "", exitCode: 0, durationMs: 5 }
    ]);

    expect(
      await runCli(["run", "Ship a canonical Baton E2E", "--test", "--test-command", "pnpm test"], {
        cwd,
        env,
        runner: mock.runner,
        clock: canonicalClock,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("awaiting-approval");

    const runId = await onlyRunId(cwd);
    const runDirectory = path.join(cwd, ".baton", "runs", runId);
    const worktreePath = path.join(cwd, ".baton", "worktrees", runId);
    let run = await readRun(runDirectory);
    expect(run).toMatchObject({
      id: runId,
      request: "Ship a canonical Baton E2E",
      workflowId: "default",
      status: "awaiting-approval",
      worktreePath,
      baseBranch: "main"
    });
    expect(run.steps.map((step) => [step.id, step.status])).toEqual([
      ["analyze", "completed"],
      ["design", "completed"],
      ["approve", "planned"],
      ["implement", "planned"],
      ["test", "planned"],
      ["review", "planned"],
      ["finalize", "planned"]
    ]);
    expect(run.approvals).toEqual([
      expect.objectContaining({ stepId: "approve", status: "pending", createdAt: "2026-06-16T00:00:00.000Z" })
    ]);

    output.length = 0;
    expect(
      await runCli(["run", "approve", runId, "--note", "Design approved"], {
        cwd,
        env,
        runner: mock.runner,
        clock: canonicalClock,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("awaiting-approval");
    expect(output.join("\n")).toContain("# implement");

    run = await readRun(runDirectory);
    expect(run.status).toBe("awaiting-approval");
    expect(run.steps.map((step) => [step.id, step.status])).toEqual([
      ["analyze", "completed"],
      ["design", "completed"],
      ["approve", "completed"],
      ["implement", "planned"],
      ["test", "planned"],
      ["review", "planned"],
      ["finalize", "planned"]
    ]);
    expect(run.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: "approve", status: "approved", note: "Design approved" }),
        expect.objectContaining({ stepId: "implement", status: "pending" })
      ])
    );

    output.length = 0;
    expect(
      await runCli(["run", "approve", runId, "--test", "--test-command", "pnpm test", "--note", "Implementation approved"], {
        cwd,
        env,
        runner: mock.runner,
        clock: canonicalClock,
        stdout: (line) => output.push(line),
        stderr: (line) => errors.push(line)
      })
    ).toBe(0);
    expect(output.join("\n")).toContain("completed");

    run = await readRun(runDirectory);
    expect(run.status).toBe("completed");
    expect(run.steps.map((step) => [step.id, step.status])).toEqual([
      ["analyze", "completed"],
      ["design", "completed"],
      ["approve", "completed"],
      ["implement", "completed"],
      ["test", "completed"],
      ["review", "completed"],
      ["finalize", "completed"]
    ]);
    expect(run.approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stepId: "approve", status: "approved", note: "Design approved" }),
        expect.objectContaining({ stepId: "implement", status: "approved", note: "Implementation approved" })
      ])
    );

    await expectArtifact(runDirectory, "request.md", "Ship a canonical Baton E2E\n");
    expect((await readRun(runDirectory)).status).toBe("completed");
    expect(await readFile(path.join(runDirectory, "test_result.md"), "utf8")).toContain("Summary: PASS");
    expect(await readFile(path.join(runDirectory, "test_result.md"), "utf8")).toContain("canonical tests passed");
    expect(await readFile(path.join(runDirectory, "final_summary.md"), "utf8")).toContain("# Final Summary");
    expect(await readFile(path.join(runDirectory, "pr_description.md"), "utf8")).toContain("# Ship a canonical Baton E2E");

    output.length = 0;
    expect(await runCli(["run", "list"], { cwd, env, runner: mock.runner, clock: canonicalClock, stdout: (line) => output.push(line) })).toBe(0);
    expect(output.join("\n")).toContain(runId);
    expect(output.join("\n")).toContain("completed");
    expect(output.join("\n")).toContain("Total: 1");

    output.length = 0;
    expect(await runCli(["run", "show", runId], { cwd, env, runner: mock.runner, clock: canonicalClock, stdout: (line) => output.push(line) })).toBe(0);
    const showOutput = output.join("\n");
    expect(showOutput).toContain("Request: Ship a canonical Baton E2E");
    expect(showOutput).toContain("final_summary.md");
    expect(showOutput).toContain("pr_description.md");
    expect(showOutput).toContain("test_result.md");

    const note = await readFile(path.join(vault, "Baton", "Runs", `${runId}.md`), "utf8");
    const index = await readFile(path.join(vault, "Baton", "Runs.md"), "utf8");
    const exportedSummary = await readFile(path.join(vault, "Baton", "Runs", runId, "final_summary.md"), "utf8");
    expect(note).toContain('status: "completed"');
    expect(note).toContain("Ship a canonical Baton E2E");
    expect(index).toContain("```dataview");
    expect(index).toContain(`[[Baton/Runs/${runId}]]`);
    expect(exportedSummary).toBe(await readFile(path.join(runDirectory, "final_summary.md"), "utf8"));

    expect(mock.calls).toEqual([
      {
        command: "git",
        args: ["worktree", "add", worktreePath, "-b", `baton/${runId}`, "main"],
        options: { cwd }
      },
      {
        command: "pnpm",
        args: ["test"],
        options: { cwd: worktreePath }
      }
    ]);
    expect(mock.calls.some((call) => call.command === "codex" || call.command === "claude")).toBe(false);
    expect(errors.join("\n")).toContain("StubWorker");
    expect(errors.join("\n")).toContain("TestRunnerAdapter");
  });
});

async function copyDefaultWorkflow(cwd: string): Promise<void> {
  const workflowsDir = path.join(cwd, "examples", "workflows");
  await mkdir(workflowsDir, { recursive: true });
  const workflow = await readFile(path.join(repoRoot, "examples", "workflows", "default.workflow.yaml"), "utf8");
  await writeFile(path.join(workflowsDir, "default.workflow.yaml"), workflow, "utf8");
}

async function onlyRunId(cwd: string): Promise<string> {
  const runs = await readdir(path.join(cwd, ".baton", "runs"));
  expect(runs).toHaveLength(1);
  return runs[0] ?? "";
}

async function readRun(runDirectory: string): Promise<Run> {
  return JSON.parse(await readFile(path.join(runDirectory, "run.json"), "utf8")) as Run;
}

async function expectArtifact(runDirectory: string, artifactName: string, expectedContent: string): Promise<void> {
  await expect(readFile(path.join(runDirectory, artifactName), "utf8")).resolves.toBe(expectedContent);
}

function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const { BATON_HOME: _batonHome, BATON_OBSIDIAN_VAULT: _obsidianVault, ...env } = process.env;
  void _batonHome;
  void _obsidianVault;
  return { ...env, ...overrides };
}
