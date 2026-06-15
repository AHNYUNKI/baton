import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";
import { WorkflowSchema, type Workflow } from "@baton/schemas";

export type LoadWorkflowsOptions = {
  cwd?: string;
  examplesDir?: string;
  localDir?: string;
};

export async function loadWorkflows(options: LoadWorkflowsOptions = {}): Promise<Workflow[]> {
  const cwd = options.cwd ?? process.cwd();
  const examplesDir = options.examplesDir ?? path.join(cwd, "examples", "workflows");
  const localDir = options.localDir ?? path.join(cwd, ".baton", "workflows");
  const workflows = [...(await loadWorkflowDir(examplesDir, true)), ...(await loadWorkflowDir(localDir, false))];

  return mergeWorkflows(workflows);
}

async function loadWorkflowDir(directory: string, required: boolean): Promise<Workflow[]> {
  const files = await yamlFiles(directory, required);
  const workflows: Workflow[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    try {
      const parsed = parse(content);
      workflows.push(WorkflowSchema.parse(parsed));
    } catch (error) {
      throw new Error(`Failed to load workflow ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return workflows;
}

async function yamlFiles(directory: string, required: boolean): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.(ya?ml)$/u.test(entry.name))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (!required && isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw new Error(`Failed to read workflow directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeWorkflows(workflows: Workflow[]): Workflow[] {
  const byId = new Map<string, Workflow>();

  for (const workflow of workflows) {
    byId.set(workflow.id, workflow);
  }

  return [...byId.values()];
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
