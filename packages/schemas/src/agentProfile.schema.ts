import { z } from "zod";

export const AgentRoleSchema = z.enum([
  "analyst",
  "architect",
  "implementer",
  "tester",
  "reviewer",
  "fixer",
  "release_writer"
]);

export const AgentProfileSchema = z.object({
  id: z.string().min(1),
  role: AgentRoleSchema,
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  description: z.string().min(1).optional()
});

export type AgentRole = z.infer<typeof AgentRoleSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
