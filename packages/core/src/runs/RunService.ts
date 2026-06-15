import { randomUUID } from "node:crypto";

import type { Run, RunStep, Workflow } from "@baton/schemas";
import { RunSchema } from "@baton/schemas";

import type { ArtifactStore } from "../artifacts/ArtifactStore.js";
import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";
import type { WorkerAdapter } from "../workers/WorkerAdapter.js";
import type { WorktreeManager } from "../git/GitWorktreeManager.js";

export type RunServiceOptions = {
  artifactStore: ArtifactStore;
  workflows: Workflow[];
  clock?: Clock;
  idGenerator?: () => string;
  worker?: WorkerAdapter;
  worktreeManager?: WorktreeManager;
};

export type CreateRunOptions = {
  dryRun: boolean;
  workflowId?: string;
  projectId?: string;
};

export type PlanRunOptions = {
  dryRun: boolean;
  workflowId?: string;
  projectId?: string;
};

export type PlanRunResult = {
  run: Run;
  workflow: Workflow;
  plannedSteps: RunStep[];
};

export type CreateRunResult = {
  run: Run;
  plannedSteps: RunStep[];
  artifactPaths: string[];
};

export class RunService {
  private readonly artifactStore: ArtifactStore;
  private readonly workflows: Workflow[];
  private readonly clock: Clock;
  private readonly idGenerator: () => string;
  private readonly worker: WorkerAdapter | undefined;
  private readonly worktreeManager: WorktreeManager | undefined;

  public constructor(options: RunServiceOptions) {
    this.artifactStore = options.artifactStore;
    this.workflows = options.workflows;
    this.clock = options.clock ?? systemClock;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.worker = options.worker;
    this.worktreeManager = options.worktreeManager;
  }

  public async createRun(request: string, options: CreateRunOptions): Promise<CreateRunResult> {
    if (request.trim().length === 0) {
      throw new Error("Run request must not be empty.");
    }

    if (!options.dryRun) {
      throw new Error("Baton v0.1 only supports dry-run planning.");
    }

    const { run, plannedSteps } = this.planRun(request, options);

    const requestPath = await this.artifactStore.writeArtifact(run.id, "request.md", `${request}\n`);
    const runPath = await this.artifactStore.writeArtifact(run.id, "run.json", `${JSON.stringify(run, null, 2)}\n`);

    void this.worker;
    void this.worktreeManager;

    return {
      run,
      plannedSteps,
      artifactPaths: [requestPath, runPath]
    };
  }

  public planRun(request: string, options: PlanRunOptions): PlanRunResult {
    if (request.trim().length === 0) {
      throw new Error("Run request must not be empty.");
    }

    const workflow = this.selectWorkflow(options.workflowId);
    const plannedSteps = workflow.steps.map<RunStep>((step) => ({
      id: step.id,
      type: step.type,
      status: "planned"
    }));

    const baseRun = {
      id: this.idGenerator(),
      request,
      workflowId: workflow.id,
      status: "planned" as const,
      dryRun: options.dryRun,
      createdAt: this.clock.now().toISOString(),
      steps: plannedSteps
    };
    const run = RunSchema.parse(options.projectId === undefined ? baseRun : { ...baseRun, projectId: options.projectId });

    return {
      run,
      workflow,
      plannedSteps
    };
  }

  private selectWorkflow(workflowId: string | undefined): Workflow {
    if (this.workflows.length === 0) {
      throw new Error("No workflows are available.");
    }

    const workflow = workflowId === undefined ? this.workflows[0] : this.workflows.find((candidate) => candidate.id === workflowId);
    if (workflow === undefined) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return workflow;
  }
}
