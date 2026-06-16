import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { RunSchema, type Run } from "@baton/schemas";

import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "../WorkerAdapter.js";
import { renderFinalSummary, renderPrDescription, type FinalizeSourceArtifact } from "./render.js";

const sourceArtifactNames = ["analysis.md", "design.md", "test_result.md", "review.md"] as const;
const generatedArtifactNames = ["final_summary.md", "pr_description.md"] as const;

export class FinalizeWriter implements WorkerAdapter {
  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    const runDirectory = metadataString(input, "runDirectory");
    const artifacts: string[] = [];

    try {
      if (runDirectory === undefined) {
        return failure("FinalizeWriter requires metadata.runDirectory.", artifacts);
      }

      const normalizedRunDirectory = path.resolve(runDirectory);
      const run = await readRun(path.join(normalizedRunDirectory, "run.json"));
      const sourceArtifacts = await readSourceArtifacts(normalizedRunDirectory);
      const renderInput = {
        run,
        sourceArtifacts,
        generatedArtifacts: [...generatedArtifactNames]
      };

      await mkdir(normalizedRunDirectory, { recursive: true });

      const finalSummaryPath = resolveWithinRunDirectory(normalizedRunDirectory, "final_summary.md");
      await writeFile(finalSummaryPath, renderFinalSummary(renderInput), "utf8");
      artifacts.push(finalSummaryPath);

      const prDescriptionPath = resolveWithinRunDirectory(normalizedRunDirectory, "pr_description.md");
      await writeFile(prDescriptionPath, renderPrDescription(renderInput), "utf8");
      artifacts.push(prDescriptionPath);

      return {
        success: true,
        exitCode: 0,
        stdout: [`cwd: ${input.cwd}`, "Generated final_summary.md and pr_description.md."].join("\n"),
        stderr: "",
        durationMs: 0,
        artifacts,
        metadata: {
          provider: "finalize"
        }
      };
    } catch (error) {
      return failure(errorMessage(error), artifacts);
    }
  }
}

async function readRun(runPath: string): Promise<Run> {
  let content: string;
  try {
    content = await readFile(runPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(`Run state not found: ${runPath}`);
    }
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(content);
    const result = RunSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid run state: ${error.message}`);
    }
    throw new Error(`Invalid run state: ${errorMessage(error)}`);
  }
}

async function readSourceArtifacts(runDirectory: string): Promise<FinalizeSourceArtifact[]> {
  const artifacts: FinalizeSourceArtifact[] = [];

  for (const name of sourceArtifactNames) {
    const artifactPath = resolveWithinRunDirectory(runDirectory, name);
    const content = await readOptionalFile(artifactPath);
    artifacts.push(content === undefined ? { name, exists: false } : { name, exists: true, content });
  }

  return artifacts;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function resolveWithinRunDirectory(runDirectory: string, artifactName: string): string {
  const normalizedRunDirectory = path.resolve(runDirectory);
  const artifactPath = path.resolve(normalizedRunDirectory, artifactName);

  if (artifactPath !== normalizedRunDirectory && !artifactPath.startsWith(`${normalizedRunDirectory}${path.sep}`)) {
    throw new Error(`Finalize artifact path escapes run directory: ${artifactName}`);
  }

  return artifactPath;
}

function failure(message: string, artifacts: readonly string[]): WorkerRunResult {
  return {
    success: false,
    exitCode: null,
    stdout: "",
    stderr: message,
    durationMs: 0,
    artifacts: [...artifacts],
    metadata: {
      provider: "finalize"
    }
  };
}

function metadataString(input: WorkerRunInput, key: string): string | undefined {
  const value = input.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
