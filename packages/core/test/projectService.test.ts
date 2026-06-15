import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectService, fixedClock } from "../src/index.js";

describe("ProjectService", () => {
  it("adds existing project paths idempotently", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const projectDir = await mkdtemp(path.join(tmpdir(), "baton-project-"));

    const service = new ProjectService({ homeDir, clock: fixedClock("2026-06-15T00:00:00.000Z") });
    const first = await service.add(projectDir);
    const second = await service.add(projectDir);

    expect(first).toEqual(second);
    expect(await service.list()).toEqual([first]);
    expect(JSON.parse(await readFile(path.join(homeDir, "projects.json"), "utf8"))).toHaveLength(1);
  });

  it("throws a clear error for missing project paths", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "baton-home-"));
    const service = new ProjectService({ homeDir });

    await expect(service.add(path.join(tmpdir(), "does-not-exist"))).rejects.toThrow("Project path does not exist");
  });
});
