import type { Run, RunStep, WorkflowStep } from "@baton/schemas";

import type { WorkerRunResult } from "../workers/WorkerAdapter.js";

export type BuildFixPromptInput = {
  run: Run;
  failedStep: WorkflowStep;
  failedRunStep: RunStep;
  failedResult: WorkerRunResult;
  runDirectory: string;
  attempt: number;
  maxAttempts: number;
};

const maxOutputCharacters = 4_000;

export function buildFixPrompt(input: BuildFixPromptInput): string {
  const artifacts = [...(input.failedRunStep.artifacts ?? []), ...input.failedResult.artifacts];

  return [
    `Run: ${input.run.id}`,
    `Workflow: ${input.run.workflowId}`,
    `Fix attempt: ${input.attempt} of ${input.maxAttempts}`,
    `Failed step: ${input.failedStep.id} (${input.failedStep.type})`,
    `Failed role: ${input.failedStep.role}`,
    "",
    "Request:",
    input.run.request,
    "",
    "Goal:",
    "Make the smallest code change needed for the failed step to pass when it is retried.",
    "",
    "Run artifacts directory:",
    input.runDirectory,
    "",
    "Failed step artifacts:",
    artifacts.length === 0 ? "(none)" : artifacts.join("\n"),
    "",
    "Failed step output:",
    `Exit code: ${input.failedResult.exitCode === null ? "null" : String(input.failedResult.exitCode)}`,
    "",
    "Stdout:",
    codeFence(truncateOutput(input.failedResult.stdout), "text"),
    "",
    "Stderr:",
    codeFence(truncateOutput(input.failedResult.stderr), "text")
  ].join("\n");
}

function truncateOutput(output: string): string {
  if (output.length <= maxOutputCharacters) {
    return output;
  }

  return `${output.slice(0, maxOutputCharacters)}\n\n[truncated ${output.length - maxOutputCharacters} character(s)]`;
}

function codeFence(content: string, language: string): string {
  const longestBacktickRun = Math.max(2, ...Array.from(content.matchAll(/`+/gu), (match) => match[0].length));
  const fence = "`".repeat(longestBacktickRun + 1);
  return `${fence}${language}\n${content}\n${fence}`;
}
