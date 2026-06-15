import { z } from "zod";
import { WorkflowStepTypeSchema } from "./workflow.schema.js";

export const RunStatusSchema = z.enum([
  "planned",
  "running",
  "completed",
  "failed",
  "cancelled"
]);

export const RunStepSchema = z.object({
  id: z.string().min(1),
  type: WorkflowStepTypeSchema,
  status: RunStatusSchema
});

export const RunSchema = z.object({
  id: z.string().min(1),
  request: z.string().min(1),
  workflowId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  status: RunStatusSchema,
  dryRun: z.boolean(),
  createdAt: z.string().datetime(),
  steps: z.array(RunStepSchema)
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type Run = z.infer<typeof RunSchema>;
