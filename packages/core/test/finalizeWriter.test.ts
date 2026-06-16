import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Run } from "@baton/schemas";
import { describe, expect, it } from "vitest";

import { FinalizeWriter, normalizePrTitle } from "../src/index.js";

describe("FinalizeWriter", () => {
  it("creates final_summary.md and pr_description.md from run state and artifacts", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-"));
    const run = runFixture();
    await writeRun(runDirectory, run);
    await writeFile(path.join(runDirectory, "analysis.md"), "# Analysis\n\nFindings", "utf8");
    await writeFile(path.join(runDirectory, "design.md"), "# Design\n\nPlan", "utf8");
    await writeFile(
      path.join(runDirectory, "test_result.md"),
      ["# Test Result", "", "- Command: `[\"pnpm\",\"test\"]`", "- Exit code: 0", "- Summary: PASS", ""].join("\n"),
      "utf8"
    );
    await writeFile(path.join(runDirectory, "review.md"), "# Review\n\nLooks good", "utf8");

    const result = await new FinalizeWriter().run({
      cwd: "/repo/worktree",
      prompt: "unused",
      metadata: { runDirectory }
    });

    const finalSummaryPath = path.join(runDirectory, "final_summary.md");
    const prDescriptionPath = path.join(runDirectory, "pr_description.md");
    expect(result).toMatchObject({
      success: true,
      exitCode: 0,
      stderr: "",
      durationMs: 0,
      metadata: { provider: "finalize" }
    });
    expect(result.artifacts).toEqual([finalSummaryPath, prDescriptionPath]);

    const finalSummary = await readFile(finalSummaryPath, "utf8");
    expect(finalSummary).toContain("# Final Summary");
    expect(finalSummary).toContain("## Request");
    expect(finalSummary).toContain("## Workflow");
    expect(finalSummary).toContain("| finalize | finalize | running |");
    expect(finalSummary).toContain("| Summary | PASS |");
    expect(finalSummary).toContain("analysis.md, design.md, test_result.md, review.md");
    expect(finalSummary).toContain("- Run status at finalize: running");

    const prDescription = await readFile(prDescriptionPath, "utf8");
    expect(prDescription).toContain("# Build Baton finalize outputs");
    expect(prDescription).toContain("## Step Overview");
    expect(prDescription).toContain("## Test Status");
    expect(prDescription).toContain("- final_summary.md");
    expect(prDescription).toContain("- pr_description.md");
  });

  it("handles missing optional source artifacts without failing", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-missing-"));
    await writeRun(runDirectory, runFixture({ steps: [{ id: "finalize", type: "finalize", status: "running" }] }));

    const result = await new FinalizeWriter().run({
      cwd: "/repo/worktree",
      prompt: "",
      metadata: { runDirectory }
    });

    expect(result.success).toBe(true);
    const finalSummary = await readFile(path.join(runDirectory, "final_summary.md"), "utf8");
    expect(finalSummary).toContain("Present source artifacts: (none)");
    expect(finalSummary).toContain("| analysis.md | not present |");
    expect(finalSummary).toContain("- test_result.md: not present.");
  });

  it("is deterministic and idempotent for unchanged inputs", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-idempotent-"));
    await writeRun(runDirectory, runFixture());
    await writeFile(path.join(runDirectory, "test_result.md"), "- Summary: PASS\n", "utf8");
    const adapter = new FinalizeWriter();
    const input = { cwd: "/repo/worktree", prompt: "", metadata: { runDirectory } };

    await adapter.run(input);
    const firstSummary = await readFile(path.join(runDirectory, "final_summary.md"), "utf8");
    const firstPr = await readFile(path.join(runDirectory, "pr_description.md"), "utf8");

    await adapter.run(input);
    const secondSummary = await readFile(path.join(runDirectory, "final_summary.md"), "utf8");
    const secondPr = await readFile(path.join(runDirectory, "pr_description.md"), "utf8");

    expect(secondSummary).toBe(firstSummary);
    expect(secondPr).toBe(firstPr);
  });

  it("returns unsuccessful results when run.json is missing or invalid", async () => {
    const missingRunDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-no-run-"));
    const invalidRunDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-bad-run-"));
    await writeFile(path.join(invalidRunDirectory, "run.json"), "{", "utf8");
    const adapter = new FinalizeWriter();

    await expect(adapter.run({ cwd: "/repo/worktree", prompt: "", metadata: { runDirectory: missingRunDirectory } })).resolves.toMatchObject({
      success: false,
      exitCode: null,
      stderr: expect.stringContaining("Run state not found")
    });
    await expect(adapter.run({ cwd: "/repo/worktree", prompt: "", metadata: { runDirectory: invalidRunDirectory } })).resolves.toMatchObject({
      success: false,
      exitCode: null,
      stderr: expect.stringContaining("Invalid run state")
    });
  });

  it("returns an unsuccessful result for write failures without throwing", async () => {
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-readonly-"));
    await writeRun(runDirectory, runFixture());
    await chmod(runDirectory, 0o500);

    try {
      const result = await new FinalizeWriter().run({
        cwd: "/repo/worktree",
        prompt: "",
        metadata: { runDirectory }
      });

      expect(result).toMatchObject({
        success: false,
        exitCode: null,
        metadata: { provider: "finalize" }
      });
      expect(result.stderr.length).toBeGreaterThan(0);
    } finally {
      await chmod(runDirectory, 0o700);
    }
  });

  it("writes only inside the run directory and preserves unrelated files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-finalize-cwd-"));
    const runDirectory = await mkdtemp(path.join(tmpdir(), "baton-finalize-contained-"));
    const cwdSentinel = path.join(cwd, "final_summary.md");
    const runSentinel = path.join(runDirectory, "keep.md");
    await writeFile(cwdSentinel, "do not touch", "utf8");
    await writeFile(runSentinel, "keep me", "utf8");
    await writeRun(runDirectory, runFixture());

    const result = await new FinalizeWriter().run({
      cwd,
      prompt: "",
      metadata: { runDirectory }
    });

    expect(result.success).toBe(true);
    for (const artifact of result.artifacts) {
      expect(path.resolve(artifact).startsWith(`${path.resolve(runDirectory)}${path.sep}`)).toBe(true);
    }
    expect(await readFile(cwdSentinel, "utf8")).toBe("do not touch");
    expect(await readFile(runSentinel, "utf8")).toBe("keep me");
  });

  it("normalizes PR titles to one bounded line", () => {
    expect(normalizePrTitle("# Build\nBaton\tFinalize")).toBe("Build Baton Finalize");
    expect(normalizePrTitle("x".repeat(90))).toBe(`${"x".repeat(77)}...`);
  });
});

async function writeRun(runDirectory: string, run: Run): Promise<void> {
  await writeFile(path.join(runDirectory, "run.json"), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

function runFixture(overrides: Partial<Run> = {}): Run {
  return {
    id: "run-1",
    request: "Build Baton finalize outputs",
    workflowId: "default",
    status: "running",
    dryRun: false,
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    worktreePath: "/repo/worktree",
    baseBranch: "main",
    steps: [
      { id: "analyze", type: "analyze", status: "completed", artifacts: ["/runs/run-1/analysis.md"] },
      { id: "design", type: "design", status: "completed", artifacts: ["/runs/run-1/design.md"] },
      { id: "test", type: "test", status: "completed", artifacts: ["/runs/run-1/test_result.md"] },
      { id: "review", type: "review", status: "completed", artifacts: ["/runs/run-1/review.md"] },
      { id: "finalize", type: "finalize", status: "running" }
    ],
    ...overrides
  };
}
