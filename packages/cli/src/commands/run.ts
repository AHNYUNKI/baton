import { ArtifactStore, RunService, loadWorkflows } from "@baton/core";

import type { CommandContext, CommandResult } from "./context.js";

export async function runCommand(args: readonly string[], context: CommandContext): Promise<CommandResult> {
  const parsed = parseRunArgs(args);
  if (parsed === undefined) {
    context.stderr("Usage: baton run <request> --dry-run [--workflow <id>] [--project <id>]");
    return 1;
  }

  const workflows = await loadWorkflows({ cwd: context.cwd });
  const service = new RunService({
    artifactStore: new ArtifactStore({ workspaceRoot: context.cwd }),
    workflows
  });
  const result = await service.createRun(parsed.request, {
    dryRun: true,
    ...(parsed.workflowId === undefined ? {} : { workflowId: parsed.workflowId }),
    ...(parsed.projectId === undefined ? {} : { projectId: parsed.projectId })
  });

  context.stdout(`Run ${result.run.id} planned (${result.run.workflowId})`);
  for (const step of result.plannedSteps) {
    context.stdout(`- ${step.id}: ${step.type} (${step.status})`);
  }

  return 0;
}

type ParsedRunArgs = {
  request: string;
  workflowId?: string;
  projectId?: string;
};

function parseRunArgs(args: readonly string[]): ParsedRunArgs | undefined {
  const requestParts: string[] = [];
  let dryRun = false;
  let workflowId: string | undefined;
  let projectId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--workflow") {
      workflowId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--project") {
      projectId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg?.startsWith("--") === true) {
      return undefined;
    }

    if (arg !== undefined) {
      requestParts.push(arg);
    }
  }

  const request = requestParts.join(" ").trim();
  if (!dryRun || request.length === 0 || workflowId === "" || projectId === "") {
    return undefined;
  }

  return workflowId === undefined && projectId === undefined
    ? { request }
    : {
        request,
        ...(workflowId === undefined ? {} : { workflowId }),
        ...(projectId === undefined ? {} : { projectId })
      };
}
