import { z } from "zod";

import { ApprovalSchema } from "./approval.schema.js";

export const TeamRunRoleStatusSchema = z.enum(["planned", "running", "completed", "failed", "skipped"]);

export const TeamRunStatusSchema = z.enum(["planned", "awaiting-approval", "running", "completed", "failed", "cancelled"]);

export const TeamRunRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1),
  assignedAgentId: z.string().min(1),
  status: TeamRunRoleStatusSchema,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
  summary: z.string().optional(),
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
  approvals: z.array(ApprovalSchema).optional()
});

export type TeamRunRoleStatus = z.infer<typeof TeamRunRoleStatusSchema>;
export type TeamRunStatus = z.infer<typeof TeamRunStatusSchema>;
export type TeamRunRole = z.infer<typeof TeamRunRoleSchema>;
export type TeamRun = z.infer<typeof TeamRunSchema>;
