import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveObsidianVault } from "../src/index.js";

describe("resolveObsidianVault", () => {
  it("prefers BATON_OBSIDIAN_VAULT over config", () => {
    expect(
      resolveObsidianVault({
        env: { BATON_OBSIDIAN_VAULT: "env vault" },
        config: { obsidian: { vault: "config vault" } }
      })
    ).toBe(path.resolve("env vault"));
  });

  it("falls back to config when env is unset or blank", () => {
    expect(
      resolveObsidianVault({
        env: { BATON_OBSIDIAN_VAULT: "  " },
        config: { obsidian: { vault: "한글 vault" } }
      })
    ).toBe(path.resolve("한글 vault"));
  });

  it("returns undefined when no vault is configured", () => {
    expect(resolveObsidianVault({ env: {}, config: {} })).toBeUndefined();
    expect(resolveObsidianVault()).toBeUndefined();
  });
});
