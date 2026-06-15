import path from "node:path";

import { describe, expect, it } from "vitest";

import { batonHome, runDir, runsDir, workspaceDir } from "../src/index.js";

describe("paths", () => {
  it("uses BATON_HOME when provided", () => {
    expect(batonHome({ BATON_HOME: "/tmp/custom-baton" })).toBe(path.resolve("/tmp/custom-baton"));
  });

  it("resolves workspace and run directories", () => {
    const cwd = "/tmp/project";

    expect(workspaceDir(cwd)).toBe(path.join(cwd, ".baton"));
    expect(runsDir(cwd)).toBe(path.join(cwd, ".baton", "runs"));
    expect(runDir("run-1", cwd)).toBe(path.join(cwd, ".baton", "runs", "run-1"));
  });
});
