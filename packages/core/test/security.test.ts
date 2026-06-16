import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packagesRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("security regressions", () => {
  it("does not add blocked local auth paths or elevated sandbox defaults under packages", async () => {
    const files = await sourceFiles(packagesRoot);
    const content = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
    const blockedPatterns = [
      new RegExp(`auth[.]json`, "u"),
      new RegExp(`(^|[/\\\\])${escapeRegExp(".codex")}([/\\\\]|$)`, "u"),
      new RegExp(`creden${"tial"}`, "iu"),
      new RegExp(`danger-${"full"}-${"access"}`, "u"),
      new RegExp(`${escapeRegExp([".clau", "de"].join(""))}.*${["to", "ken"].join("")}`, "iu")
    ];

    for (const pattern of blockedPatterns) {
      expect(pattern.test(content)).toBe(false);
    }
  });

  it("keeps run artifact allow-list patterns trackable", async () => {
    const content = await readFile(path.join(repoRoot, ".gitignore"), "utf8");

    expect(content).toContain(".baton/baton.db");
    expect(content).toContain(".baton/baton.db-wal");
    expect(content).toContain(".baton/baton.db-shm");
    expect(content).toContain(".baton/runs/*");
    expect(content).not.toContain(".baton/runs/\n");
    expect(content).toContain("!.baton/runs/codex-exec-v0.3/");
    expect(content).toContain("!.baton/runs/claude-adapter-v0.4/");
    expect(content).toContain("!.baton/runs/obsidian-journal-v0.5/");
  });

  it("keeps run index SQL parameterized", async () => {
    const runIndex = await readFile(path.join(packagesRoot, "core", "src", "runs", "RunIndex.ts"), "utf8");
    const client = await readFile(path.join(packagesRoot, "core", "src", "db", "NodeSqliteClient.ts"), "utf8");

    expect(runIndex).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    expect(runIndex).toContain("WHERE status = ?");
    expect(runIndex).toContain("LIMIT ?");
    expect(client).toContain(".run(...[...params])");
    expect(client).toContain(".all(...[...params])");
    expect(runIndex).not.toMatch(/WHERE status = [`'"]/u);
    expect(runIndex).not.toMatch(/LIMIT \$\{/u);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== "dist" && entry.name !== "node_modules") {
        return sourceFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    })
  );

  return files.flat();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
