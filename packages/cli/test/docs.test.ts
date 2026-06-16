import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { runCli, usage } from "../src/main.js";

describe("Baton docs", () => {
  it("documents CLI commands and flags that exist in help output", async () => {
    const runHelp: string[] = [];
    expect(await runCli(["run", "--help"], { stdout: (line) => runHelp.push(line) })).toBe(0);

    const helpText = [usage(), runHelp.join("\n")].join("\n");
    const docsText = await readDocsText();

    for (const snippet of [
      "baton init",
      "baton project add <path>",
      "baton project list",
      "baton config set <dotted.key> <value>",
      "baton agent list",
      "baton workflow list",
      "baton run <request>",
      "baton run list",
      "baton run show <runId>",
      "baton run status <runId>",
      "baton run resume <runId>",
      "baton run approve <runId>",
      "baton run clean <runId>",
      "baton journal sync",
      "baton codex doctor",
      "baton claude doctor"
    ]) {
      expect(helpText).toContain(snippet);
    }

    for (const snippet of [
      "baton init",
      "baton config set workers.codex true",
      "baton config set workers.claude true",
      "baton config set workers.test true",
      "baton config set test.command",
      "baton config set obsidian.vault",
      "baton run approve <runId>",
      "baton run list",
      "baton run show <runId>",
      "baton journal sync",
      "--codex",
      "--claude",
      "--test",
      "--test-command",
      "--fix",
      "--max-fix-attempts"
    ]) {
      expect(docsText).toContain(snippet);
    }
  });

  it("links docs from README and states hermetic E2E limits honestly", async () => {
    const usageDoc = await readFile(new URL("../../../docs/USAGE.md", import.meta.url), "utf8");
    const architectureDoc = await readFile(new URL("../../../docs/ARCHITECTURE.md", import.meta.url), "utf8");
    const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
    const combined = [usageDoc, architectureDoc, readme].join("\n");

    expect(readme).toContain("docs/USAGE.md");
    expect(readme).toContain("docs/ARCHITECTURE.md");
    expect(combined).toContain("analysis.md");
    expect(combined).toContain("design.md");
    expect(combined).toContain("review.md");
    expect(combined).toContain("--claude");
    expect(combined).toContain("mock `ProcessRunner`");
    const blockedPatterns = [
      new RegExp(`danger-${"full"}-${"access"}`, "u"),
      new RegExp(`~/${escapeRegExp([".co", "dex"].join(""))}/auth[.]json`, "u"),
      new RegExp(`session ${"token"}`, "iu")
    ];
    for (const pattern of blockedPatterns) {
      expect(pattern.test(combined)).toBe(false);
    }
  });
});

async function readDocsText(): Promise<string> {
  const files = ["docs/USAGE.md", "docs/ARCHITECTURE.md", "README.md"];
  const contents = await Promise.all(files.map((file) => readFile(new URL(`../../../${file}`, import.meta.url), "utf8")));
  return contents.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
