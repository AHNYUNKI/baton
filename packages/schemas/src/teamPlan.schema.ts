import { z } from "zod";

export const TeamRoleSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string(),
  assignedAgentId: z.string().trim().min(1),
  instructions: z.string(),
  checkpoint: z.boolean().optional(),
  reportsTo: z.string().trim().min(1).nullish()
});

export const TeamPlanSchema = z
  .object({
    roles: z.array(TeamRoleSchema).min(1)
  })
  .superRefine((plan, context) => {
    const seen = new Set<string>();
    for (const [index, role] of plan.roles.entries()) {
      if (seen.has(role.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["roles", index, "id"],
          message: `Team role id must be unique: ${role.id}`
        });
      }
      seen.add(role.id);
    }
  });

export type TeamRole = z.infer<typeof TeamRoleSchema>;
export type TeamPlan = z.infer<typeof TeamPlanSchema>;

export function assertPlanAgents(plan: TeamPlan, agentIds: readonly string[]): void {
  const allowedAgentIds = new Set(agentIds);
  const invalidRoles = plan.roles.filter((role) => !allowedAgentIds.has(role.assignedAgentId));
  if (invalidRoles.length === 0) {
    return;
  }

  const details = invalidRoles.map((role) => `${role.id}:${role.assignedAgentId}`).join(", ");
  throw new Error(`TeamPlan assignedAgentId must be one of project.agentIds: ${details}`);
}
