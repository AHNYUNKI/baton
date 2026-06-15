import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { z } from "zod";
import { ProjectSchema, type Project } from "@baton/schemas";

import { batonHome } from "../config/paths.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";

const ProjectRegistrySchema = z.array(ProjectSchema);

export type ProjectServiceOptions = {
  homeDir?: string;
  clock?: Clock;
};

export class ProjectService {
  private readonly homeDir: string;
  private readonly clock: Clock;

  public constructor(options: ProjectServiceOptions = {}) {
    this.homeDir = options.homeDir ?? batonHome();
    this.clock = options.clock ?? systemClock;
  }

  public async add(projectPath: string): Promise<Project> {
    const resolvedPath = path.resolve(projectPath);
    const stats = await stat(resolvedPath).catch(() => undefined);

    if (stats === undefined || !stats.isDirectory()) {
      throw new Error(`Project path does not exist or is not a directory: ${projectPath}`);
    }

    const registry = await this.readRegistry();
    const existing = registry.find((project) => project.path === resolvedPath);
    if (existing !== undefined) {
      return existing;
    }

    const project: Project = {
      id: this.projectId(resolvedPath),
      name: path.basename(resolvedPath) || "project",
      path: resolvedPath,
      createdAt: this.clock.now().toISOString()
    };

    const nextRegistry = [...registry, project];
    await this.writeRegistry(nextRegistry);
    return project;
  }

  public async list(): Promise<Project[]> {
    return this.readRegistry();
  }

  private registryPath(): string {
    return path.join(this.homeDir, "projects.json");
  }

  private async readRegistry(): Promise<Project[]> {
    try {
      const content = await readFile(this.registryPath(), "utf8");
      return ProjectRegistrySchema.parse(JSON.parse(content));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }
      throw new Error(`Failed to read project registry: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async writeRegistry(projects: Project[]): Promise<void> {
    await mkdir(this.homeDir, { recursive: true });
    await writeFile(this.registryPath(), `${JSON.stringify(projects, null, 2)}\n`, "utf8");
  }

  private projectId(projectPath: string): string {
    const digest = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
    return `project-${digest}`;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
