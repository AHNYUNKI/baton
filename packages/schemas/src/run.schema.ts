import { z } from "zod";
import { WorkflowStepTypeSchema } from "./workflow.schema.js";
import { ApprovalSchema } from "./approval.schema.js";

export const RunStatusSchema = z.enum([
  "planned",
  "running",
  "awaiting-approval",
  "completed",
  "failed",
  "cancelled"
]);

export const RunStepStatusSchema = z.enum(["planned", "running", "completed", "failed", "skipped"]);

export const RunStepSchema = z.object({
  id: z.string().min(1),
  type: WorkflowStepTypeSchema,
  status: RunStepStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
  artifacts: z.array(z.string().min(1)).optional()
});

export const RunSchema = z.object({
  id: z.string().min(1),
  request: z.string().min(1),
  workflowId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  status: RunStatusSchema,
  dryRun: z.boolean(),
  createdAt: z.string().datetime(),
  steps: z.array(RunStepSchema),
  worktreePath: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  updatedAt: z.string().datetime().optional(),
  approvals: z.array(ApprovalSchema).optional()
});

export type RunStatus = z.infer<typeof RunStatusSchema>;
export type RunStepStatus = z.infer<typeof RunStepStatusSchema>;
export type RunStep = z.infer<typeof RunStepSchema>;
export type Run = z.infer<typeof RunSchema>;
