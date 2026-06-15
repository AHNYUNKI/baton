import { z } from "zod";

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const ApprovalSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  status: ApprovalStatusSchema,
  createdAt: z.string().datetime()
});

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
