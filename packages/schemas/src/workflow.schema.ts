import { z } from "zod";
import { AgentRoleSchema } from "./agentProfile.schema.js";

export const WorkflowStepTypeSchema = z.enum([
  "analyze",
  "design",
  "approve",
  "implement",
  "test",
  "review",
  "fix",
  "finalize"
]);

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: WorkflowStepTypeSchema,
  role: AgentRoleSchema
});

export const WorkflowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  steps: z.array(WorkflowStepSchema).min(1)
});

export type WorkflowStepType = z.infer<typeof WorkflowStepTypeSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
