import { z } from "zod";

import { ApprovalSchema } from "./approval.schema.js";

export const TeamRunRoleStatusSchema = z.enum(["planned", "running", "completed", "failed", "skipped"]);

export const TeamRunStatusSchema = z.enum([
  "planned",
  "awaiting-approval",
  "awaiting-checkpoint",
  "awaiting-review",
  "running",
  "completed",
  "failed",
  "cancelled"
]);

export const TeamRunRoleUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimated: z.boolean()
});

export const TeamRunRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1),
  assignedAgentId: z.string().min(1),
  status: TeamRunRoleStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
  summary: z.string().optional(),
  explanation: z.string().optional(),
  usage: TeamRunRoleUsageSchema.optional(),
  artifacts: z.array(z.string().min(1)).optional()
});

export const TeamRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: TeamRunStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  order: z.array(z.string().min(1)),
  roles: z.array(TeamRunRoleSchema),
  worktreePath: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  diffSummary: z.string().optional(),
  approvals: z.array(ApprovalSchema).optional()
});

export type TeamRunRoleStatus = z.infer<typeof TeamRunRoleStatusSchema>;
export type TeamRunStatus = z.infer<typeof TeamRunStatusSchema>;
export type TeamRunRoleUsage = z.infer<typeof TeamRunRoleUsageSchema>;
export type TeamRunRole = z.infer<typeof TeamRunRoleSchema>;
export type TeamRun = z.infer<typeof TeamRunSchema>;
