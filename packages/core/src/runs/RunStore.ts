import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { RunSchema, type Run } from "@baton/schemas";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";

export type RunStoreOptions = {
  artifactStore: ArtifactStore;
  clock?: Clock;
};

export class RunStore {
  private readonly artifactStore: ArtifactStore;
  private readonly clock: Clock;

  public constructor(options: RunStoreOptions) {
    this.artifactStore = options.artifactStore;
    this.clock = options.clock ?? systemClock;
  }

  public async save(run: Run): Promise<Run> {
    const runDirectory = await this.artifactStore.ensureRunDir(run.id);
    const runPath = path.join(runDirectory, "run.json");
    const tempPath = path.join(runDirectory, `run.json.tmp-${process.pid}-${Date.now()}`);
    const updatedRun = RunSchema.parse({
      ...run,
      updatedAt: this.clock.now().toISOString()
    });

    await writeFile(tempPath, `${JSON.stringify(updatedRun, null, 2)}\n`, "utf8");
    await rename(tempPath, runPath);

    return updatedRun;
  }

  public async load(runId: string): Promise<Run> {
    const runPath = path.join(this.artifactStore.getRunDir(runId), "run.json");

    let content: string;
    try {
      content = await readFile(runPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(`Run state not found: ${runId}`);
      }
      throw error;
    }

    try {
      return RunSchema.parse(JSON.parse(content));
    } catch (error) {
      throw new Error(`Invalid run state for ${runId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
