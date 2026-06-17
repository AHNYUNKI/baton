import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import { z } from "zod";
import { ProjectSchema, TeamPlanSchema, assertPlanAgents, type AgentId, type Project, type ProjectSource, type TeamPlan } from "@baton/schemas";
import type { ZodError } from "zod";

import { batonHome } from "../config/paths.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";

const ProjectRegistrySchema = z.array(ProjectSchema);

export type ProjectCreateInput = {
  name: string;
  source: ProjectSource;
  agentIds: string[];
  leadAgentId?: string;
};

export type ProjectSetTeamPlanOptions = {
  overview?: string;
};

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

  public async create(input: ProjectCreateInput): Promise<Project> {
    const sourceValue = this.normalizeSourceValue(input.source);
    const candidate = this.parseProject({
      id: this.projectId(input.source.kind, sourceValue),
      name: input.name,
      source: {
        kind: input.source.kind,
        value: sourceValue
      },
      agentIds: this.normalizeAgentIds(input.agentIds),
      leadAgentId: this.normalizeLeadAgentId(input.leadAgentId, input.agentIds),
      createdAt: this.clock.now().toISOString()
    });

    const registry = await this.readRegistry();
    const existing = registry.find((project) => sameSource(project.source, candidate.source));
    if (existing !== undefined) {
      return existing;
    }

    const nextRegistry = [...registry, candidate];
    await this.writeRegistry(nextRegistry);
    return candidate;
  }

  public async add(projectPath: string): Promise<Project> {
    const resolvedPath = path.resolve(projectPath);
    const stats = await stat(resolvedPath).catch(() => undefined);

    if (stats === undefined || !stats.isDirectory()) {
      throw new Error(`Project path does not exist or is not a directory: ${projectPath}`);
    }

    return this.create({
      name: path.basename(resolvedPath) || "project",
      source: { kind: "local", value: resolvedPath },
      agentIds: ["codex"],
      leadAgentId: "codex"
    });
  }

  public async list(): Promise<Project[]> {
    return this.readRegistry();
  }

  public async get(projectId: string): Promise<Project | undefined> {
    const registry = await this.readRegistry();
    return registry.find((project) => project.id === projectId);
  }

  public async getTeamPlan(projectId: string): Promise<TeamPlan | undefined> {
    const project = await this.getProjectOrThrow(projectId);
    return project.teamPlan;
  }

  public async setTeamPlan(projectId: string, plan: unknown, options: ProjectSetTeamPlanOptions = {}): Promise<Project> {
    const parsedPlan = this.parseTeamPlan(plan);
    const registry = await this.readRegistry();
    const projectIndex = registry.findIndex((project) => project.id === projectId);
    if (projectIndex === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const project = registry[projectIndex];
    if (project === undefined) {
      throw new Error(`Project not found: ${projectId}`);
    }
    assertPlanAgents(parsedPlan, project.agentIds);
    const nextProject = this.parseProject({
      ...project,
      ...(options.overview === undefined ? {} : { overview: options.overview }),
      teamPlan: parsedPlan
    });
    const nextRegistry = [...registry];
    nextRegistry[projectIndex] = nextProject;
    await this.writeRegistry(nextRegistry);
    return nextProject;
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
      throw new Error(`Failed to read project registry: ${formatError(error)}`);
    }
  }

  private async writeRegistry(projects: Project[]): Promise<void> {
    await mkdir(this.homeDir, { recursive: true });
    await writeFile(this.registryPath(), `${JSON.stringify(projects, null, 2)}\n`, "utf8");
  }

  private projectId(sourceKind: ProjectSource["kind"], sourceValue: string): string {
    const digest = createHash("sha256").update(`${sourceKind}\0${sourceValue}`).digest("hex").slice(0, 12);
    return `project-${digest}`;
  }

  private parseProject(value: unknown): Project {
    try {
      return ProjectSchema.parse(value);
    } catch (error) {
      throw new Error(`Invalid project: ${formatError(error)}`);
    }
  }

  private parseTeamPlan(value: unknown): TeamPlan {
    try {
      return TeamPlanSchema.parse(value);
    } catch (error) {
      throw new Error(`Invalid TeamPlan: ${formatError(error)}`);
    }
  }

  private async getProjectOrThrow(projectId: string): Promise<Project> {
    const project = await this.get(projectId);
    if (project === undefined) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  private normalizeSourceValue(source: ProjectSource): string {
    const value = source.value.trim();
    return source.kind === "local" ? path.resolve(value) : value;
  }

  private normalizeAgentIds(agentIds: readonly string[]): AgentId[] {
    return [...new Set(agentIds.map((agentId) => agentId.trim()))] as AgentId[];
  }

  private normalizeLeadAgentId(leadAgentId: string | undefined, agentIds: readonly string[]): AgentId | undefined {
    const normalizedAgentIds = this.normalizeAgentIds(agentIds);
    const normalizedLeadAgentId = leadAgentId?.trim();
    if (normalizedLeadAgentId !== undefined && normalizedLeadAgentId.length > 0) {
      return normalizedLeadAgentId as AgentId;
    }
    if (normalizedAgentIds.length === 1) {
      return normalizedAgentIds[0];
    }
    return undefined;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sameSource(left: ProjectSource, right: ProjectSource): boolean {
  return left.kind === right.kind && left.value === right.value;
}

function formatError(error: unknown): string {
  if (isZodError(error)) {
    return error.issues.map((issue) => `${issue.path.join(".") || "project"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function isZodError(error: unknown): error is ZodError {
  return error instanceof z.ZodError;
}
