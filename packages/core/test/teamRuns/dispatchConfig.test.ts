import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ArtifactStore,
  createTeamRunDispatchConfig,
  readTeamRunDispatchConfig,
  shouldPersistTeamRunDispatchConfig,
  teamRunDispatchConfigArtifactName,
  writeTeamRunDispatchConfig
} from "../../src/index.js";

describe("TeamRun dispatch config", () => {
  it("round-trips write mode and ignores write without a real provider", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-dispatch-config-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const config = createTeamRunDispatchConfig({ codex: true, write: true, timeoutMs: 123 });

    await writeTeamRunDispatchConfig(artifactStore, "team-run-1", config);

    await expect(readTeamRunDispatchConfig(artifactStore, "team-run-1")).resolves.toEqual({
      version: 1,
      workers: { codex: true, claude: false },
      write: true,
      timeoutMs: 123
    });
    expect(shouldPersistTeamRunDispatchConfig(config)).toBe(true);
    expect(createTeamRunDispatchConfig({ write: true })).toEqual({
      version: 1,
      workers: { codex: false, claude: false },
      write: false
    });
  });

  it("reads older configs without write as read-only", async () => {
    const workspaceRoot = await mkdtemp(path.join(tmpdir(), "baton-dispatch-config-old-"));
    const artifactStore = new ArtifactStore({ workspaceRoot });
    const runDirectory = await artifactStore.ensureRunDir("team-run-1");
    await mkdir(runDirectory, { recursive: true });
    await writeFile(
      path.join(runDirectory, teamRunDispatchConfigArtifactName),
      `${JSON.stringify({ version: 1, workers: { codex: true, claude: false }, timeoutMs: 456 }, null, 2)}\n`,
      "utf8"
    );

    await expect(readTeamRunDispatchConfig(artifactStore, "team-run-1")).resolves.toEqual({
      version: 1,
      workers: { codex: true, claude: false },
      write: false,
      timeoutMs: 456
    });
  });
});
