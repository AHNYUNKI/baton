import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { runDir } from "../config/paths.js";

export type ArtifactStoreOptions = {
  workspaceRoot?: string;
};

export class ArtifactStore {
  private readonly workspaceRoot: string;

  public constructor(options: ArtifactStoreOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
  }

  public getRunDir(runId: string): string {
    return runDir(runId, this.workspaceRoot);
  }

  public async ensureRunDir(runId: string): Promise<string> {
    const directory = this.getRunDir(runId);
    await mkdir(path.join(directory, "logs"), { recursive: true });
    return directory;
  }

  public async writeArtifact(runId: string, name: string, content: string): Promise<string> {
    const directory = await this.ensureRunDir(runId);
    const artifactPath = this.resolveWithinRunDir(directory, name);
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, content, "utf8");
    return artifactPath;
  }

  public async readArtifact(runId: string, name: string): Promise<string> {
    const directory = this.getRunDir(runId);
    const artifactPath = this.resolveWithinRunDir(directory, name);
    return readFile(artifactPath, "utf8");
  }

  private resolveWithinRunDir(directory: string, name: string): string {
    const artifactPath = path.resolve(directory, name);
    const normalizedDirectory = path.resolve(directory);

    if (artifactPath !== normalizedDirectory && !artifactPath.startsWith(`${normalizedDirectory}${path.sep}`)) {
      throw new Error(`Artifact path escapes run directory: ${name}`);
    }

    return artifactPath;
  }
}
