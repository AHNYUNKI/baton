import { describe, expect, it } from "vitest";

import { BatonConfigSchema } from "../src/index.js";

describe("BatonConfigSchema", () => {
  it("parses minimal and complete version 1 configs", () => {
    expect(BatonConfigSchema.parse({ version: 1 })).toEqual({ version: 1 });

    expect(
      BatonConfigSchema.parse({
        version: 1,
        obsidian: { vault: "/tmp/vault" },
        test: { command: ["corepack", "pnpm", "test"] },
        workers: {
          codex: true,
          claude: true,
          test: true,
          fix: true,
          maxFixAttempts: 3
        }
      })
    ).toEqual({
      version: 1,
      obsidian: { vault: "/tmp/vault" },
      test: { command: ["corepack", "pnpm", "test"] },
      workers: {
        codex: true,
        claude: true,
        test: true,
        fix: true,
        maxFixAttempts: 3
      }
    });
  });

  it("rejects invalid shapes and unknown keys", () => {
    expect(BatonConfigSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, workers: { maxFixAttempts: 0 } }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, workers: { maxFixAttempts: 6 } }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, test: { command: "pnpm test" } }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, workers: { codex: "true" } }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, unknown: true }).success).toBe(false);
    expect(BatonConfigSchema.safeParse({ version: 1, obsidian: { vault: "/tmp/vault", extra: true } }).success).toBe(false);
  });
});
