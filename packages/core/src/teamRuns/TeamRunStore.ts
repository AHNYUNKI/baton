import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { TeamRunSchema, type TeamRun } from "@baton/schemas";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";

export type TeamRunStoreOptions = {
  artifactStore: ArtifactStore;
  clock?: Clock;
};

export class TeamRunStore {
  private readonly artifactStore: ArtifactStore;
  private readonly clock: Clock;

  public constructor(options: TeamRunStoreOptions) {
    this.artifactStore = options.artifactStore;
    this.clock = options.clock ?? systemClock;
  }

  public async save(teamRun: TeamRun): Promise<TeamRun> {
    const runDirectory = await this.artifactStore.ensureRunDir(teamRun.id);
    const teamRunPath = path.join(runDirectory, "team-run.json");
    const tempPath = path.join(runDirectory, `team-run.json.tmp-${process.pid}-${Date.now()}`);
    const updatedTeamRun = TeamRunSchema.parse({
      ...teamRun,
      updatedAt: this.clock.now().toISOString()
    });

    await writeFile(tempPath, `${JSON.stringify(updatedTeamRun, null, 2)}\n`, "utf8");
    await rename(tempPath, teamRunPath);

    return updatedTeamRun;
  }

  public async load(teamRunId: string): Promise<TeamRun> {
    const teamRunPath = this.teamRunPath(teamRunId);

    let content: string;
    try {
      content = await readFile(teamRunPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(`TeamRun state not found: ${teamRunId}`);
      }
      throw error;
    }

    try {
      return TeamRunSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new Error(`Invalid TeamRun state for ${teamRunId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async list(projectId?: string): Promise<TeamRun[]> {
    const runsRoot = path.dirname(this.artifactStore.getRunDir("__placeholder__"));
    let entries: string[];
    try {
      entries = await readdir(runsRoot);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const teamRuns: TeamRun[] = [];
    for (const entry of entries) {
      try {
        const teamRun = await this.load(entry);
        if (projectId === undefined || teamRun.projectId === projectId) {
          teamRuns.push(teamRun);
        }
      } catch (error) {
        if (error instanceof Error && error.message === `TeamRun state not found: ${entry}`) {
          continue;
        }
        throw error;
      }
    }

    return teamRuns.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  private teamRunPath(teamRunId: string): string {
    return path.join(this.artifactStore.getRunDir(teamRunId), "team-run.json");
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
