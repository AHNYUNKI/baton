import type { Run, WorkflowStep } from "@baton/schemas";

export type BuildStepPromptInput = {
  run: Run;
  step: WorkflowStep;
  runDirectory: string;
};

export function buildStepPrompt(input: BuildStepPromptInput): string {
  return [
    `Run: ${input.run.id}`,
    `Workflow: ${input.run.workflowId}`,
    `Step: ${input.step.id} (${input.step.type})`,
    `Role: ${input.step.role}`,
    "",
    "Request:",
    input.run.request,
    "",
    "Artifacts:",
    input.runDirectory
  ].join("\n");
}
