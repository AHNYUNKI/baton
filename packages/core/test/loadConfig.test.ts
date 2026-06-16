import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/index.js";

describe("loadConfig", () => {
  it("returns an empty version 1 config when the file is missing", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-load-config-missing-"));

    await expect(loadConfig(cwd)).resolves.toEqual({ version: 1 });
  });

  it("loads and validates project local config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-load-config-valid-"));
    await mkdir(path.join(cwd, ".baton"), { recursive: true });
    await writeFile(
      path.join(cwd, ".baton", "config.json"),
      `${JSON.stringify({ version: 1, workers: { codex: true }, test: { command: ["pnpm", "test"] } }, null, 2)}\n`,
      "utf8"
    );

    await expect(loadConfig(cwd)).resolves.toEqual({
      version: 1,
      workers: { codex: true },
      test: { command: ["pnpm", "test"] }
    });
  });

  it("includes the config path in JSON and schema errors", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "baton-load-config-invalid-"));
    const configPath = path.join(cwd, ".baton", "config.json");
    await mkdir(path.dirname(configPath), { recursive: true });

    await writeFile(configPath, "{", "utf8");
    await expect(loadConfig(cwd)).rejects.toThrow(configPath);

    await writeFile(configPath, `${JSON.stringify({ version: 1, workers: { maxFixAttempts: 9 } })}\n`, "utf8");
    await expect(loadConfig(cwd)).rejects.toThrow(configPath);
  });
});
