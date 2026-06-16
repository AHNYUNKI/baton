import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { ObsidianJournalExporter, fixedClock, sanitizeRunId } from "../src/index.js";
import type { Run } from "@baton/schemas";

const clock = fixedClock("2026-06-15T01:00:00.000Z");

describe("ObsidianJournalExporter", () => {
  it("exports a self-contained run note with copied artifacts and embeds", async () => {
    const { run, runDirectory, vaultPath } = await createRunFixture("run-1");
    const exporter = new ObsidianJournalExporter();

    const result = await exporter.exportRun(run, { vaultPath, runDirectory, clock });

    expect(result.notePath).toBe(path.join(vaultPath, "Baton", "Runs", "run-1.md"));
    expect(result.artifactDirectory).toBe(path.join(vaultPath, "Baton", "Runs", "run-1"));
    expect(result.copiedArtifacts).toEqual(["analysis.md", "design.md", "logs/stdout.log", "request.md", "review.md", "run.json"]);
    expect(result.embeddedArtifacts).toEqual(["analysis.md", "design.md", "review.md"]);
    await expect(readdir(path.join(vaultPath, "Baton", "Runs", "run-1", "linked"))).rejects.toThrow();

    const note = await readFile(result.notePath, "utf8");
    const frontmatter = parse(note.slice(note.indexOf("---") + 3, note.indexOf("---", 3)));

    expect(frontmatter).toMatchObject({
      runId: "run-1",
      status: "planned",
      dryRun: true,
      workflow: "default",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T01:00:00.000Z",
      outcome: "planned",
      roles: ["analyst", "implementer"],
      workers: {
        analyst: "stub",
        implementer: "stub"
      },
      stepCount: 2,
      tags: ["baton", "baton/planned", "baton/dry-run"]
    });
    expect(note).toContain("Build Baton");
    expect(note).toContain("| analyze | analyze | planned |");
    expect(note).toContain("![[run-1/analysis.md]]");
    expect(note).toContain("![[run-1/design.md]]");
    expect(note).toContain("![[run-1/review.md]]");
    expect(await readFile(path.join(vaultPath, "Baton", "Runs", "run-1", "analysis.md"), "utf8")).toBe("# Analysis\n");
  });

  it("sanitizes malicious run ids and keeps all writes below the Baton directory", async () => {
    const { run, runDirectory, vaultPath } = await createRunFixture("../evil/../../run");
    const exporter = new ObsidianJournalExporter();

    const result = await exporter.exportRun(run, { vaultPath, runDirectory, clock });

    expect(result.safeRunId).toBe("evil-run");
    expect(result.notePath).toBe(path.join(vaultPath, "Baton", "Runs", "evil-run.md"));
    expect(result.notePath.startsWith(path.join(vaultPath, "Baton") + path.sep)).toBe(true);
    expect(result.artifactDirectory.startsWith(path.join(vaultPath, "Baton") + path.sep)).toBe(true);
    await expect(readFile(path.join(vaultPath, "evil", "run.md"), "utf8")).rejects.toThrow();
  });

  it("is idempotent for the same run and fixed clock", async () => {
    const { run, runDirectory, vaultPath } = await createRunFixture("run-2");
    const exporter = new ObsidianJournalExporter();

    const first = await exporter.exportRun(run, { vaultPath, runDirectory, clock });
    await writeFile(path.join(first.artifactDirectory, "user-note.md"), "keep me", "utf8");
    const firstNote = await readFile(first.notePath, "utf8");
    const second = await exporter.exportRun(run, { vaultPath, runDirectory, clock });
    const secondNote = await readFile(second.notePath, "utf8");

    expect(secondNote).toBe(firstNote);
    expect(second.copiedArtifacts).toEqual(first.copiedArtifacts);
    expect(await readFile(path.join(first.artifactDirectory, "user-note.md"), "utf8")).toBe("keep me");
    expect((await readdir(path.join(vaultPath, "Baton", "Runs"))).filter((entry) => entry === "run-2.md")).toHaveLength(1);
  });

  it("updates the MOC index with Dataview and a deterministic static table", async () => {
    const vaultPath = await mkdtemp(path.join(tmpdir(), "baton-vault-"));
    const exporter = new ObsidianJournalExporter();
    const older = createRun("run-a", "2026-06-15T00:00:00.000Z");
    const newer = createRun("run-b", "2026-06-16T00:00:00.000Z", "completed");

    const first = await exporter.updateIndex([older, newer], { vaultPath });
    const firstIndex = await readFile(first.indexPath, "utf8");
    const second = await exporter.updateIndex([older, newer], { vaultPath });
    const secondIndex = await readFile(second.indexPath, "utf8");

    expect(first.indexPath).toBe(path.join(vaultPath, "Baton", "Runs.md"));
    expect(first.runCount).toBe(2);
    expect(firstIndex).toBe(secondIndex);
    expect(second.runCount).toBe(2);
    expect(firstIndex).toContain("```dataview");
    expect(firstIndex).toContain("FROM \"Baton/Runs\"");
    expect(firstIndex).toContain("| Run | Status | Workflow | Created | Dry Run | Outcome |");
    expect(firstIndex.indexOf("[[Baton/Runs/run-b]]")).toBeLessThan(firstIndex.indexOf("[[Baton/Runs/run-a]]"));
  });

  it("normalizes empty and path-like run ids", () => {
    expect(sanitizeRunId("")).toBe("run");
    expect(sanitizeRunId("..")).toBe("run");
    expect(sanitizeRunId("a/b\\c")).toBe("a-b-c");
  });
});

async function createRunFixture(runId: string): Promise<{ run: Run; runDirectory: string; vaultPath: string }> {
  const workspace = await mkdtemp(path.join(tmpdir(), "baton-run-"));
  const vaultPath = await mkdtemp(path.join(tmpdir(), "baton-vault-"));
  const runDirectory = path.join(workspace, ".baton", "runs", sanitizeRunId(runId));
  await mkdir(path.join(runDirectory, "logs"), { recursive: true });
  await writeFile(path.join(runDirectory, "request.md"), "Build Baton\n", "utf8");
  await writeFile(path.join(runDirectory, "run.json"), "{}\n", "utf8");
  await writeFile(path.join(runDirectory, "analysis.md"), "# Analysis\n", "utf8");
  await writeFile(path.join(runDirectory, "design.md"), "# Design\n", "utf8");
  await writeFile(path.join(runDirectory, "review.md"), "# Review\n", "utf8");
  await writeFile(path.join(runDirectory, "logs", "stdout.log"), "ok\n", "utf8");
  await symlink(path.join(workspace, "outside"), path.join(runDirectory, "linked"));

  return {
    run: createRun(runId, "2026-06-15T00:00:00.000Z"),
    runDirectory,
    vaultPath
  };
}

function createRun(runId: string, createdAt: string, status: Run["status"] = "planned"): Run {
  return {
    id: runId,
    request: "Build Baton",
    workflowId: "default",
    status,
    dryRun: true,
    createdAt,
    steps: [
      { id: "analyze", type: "analyze", status: "planned" },
      { id: "implement", type: "implement", status: "planned" }
    ]
  };
}
