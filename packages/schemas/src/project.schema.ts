import { z } from "zod";

import { AgentIdSchema } from "./agentCatalog.schema.js";
import { TeamPlanSchema } from "./teamPlan.schema.js";

export const ProjectSourceKindSchema = z.enum(["local", "github"]);

export const ProjectSourceSchema = z
  .object({
    kind: ProjectSourceKindSchema,
    value: z.string().trim().min(1)
  })
  .superRefine((source, context) => {
    if (source.kind !== "github") {
      return;
    }

    const parsed = parseUrl(source.value);
    const isGithubUrl = parsed !== undefined && (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.hostname === "github.com";
    if (!isGithubUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "GitHub project source must be an http(s) github.com URL"
      });
    }
  });

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  source: ProjectSourceSchema,
  agentIds: z.array(AgentIdSchema).min(1),
  leadAgentId: AgentIdSchema.optional(),
  overview: z.string().optional(),
  teamPlan: TeamPlanSchema.optional(),
  createdAt: z.string().datetime()
}).superRefine((project, context) => {
  const uniqueAgentIds = new Set<string>(project.agentIds);
  if (uniqueAgentIds.size !== project.agentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["agentIds"],
      message: "Project agentIds must not contain duplicates"
    });
  }

  if (project.leadAgentId !== undefined && !uniqueAgentIds.has(project.leadAgentId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leadAgentId"],
      message: "Project leadAgentId must be one of agentIds"
    });
  }

  if (uniqueAgentIds.size > 1 && project.leadAgentId === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["leadAgentId"],
      message: "Project leadAgentId is required when multiple agents are selected"
    });
  }

  if (project.teamPlan !== undefined) {
    for (const [index, role] of project.teamPlan.roles.entries()) {
      if (!uniqueAgentIds.has(role.assignedAgentId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["teamPlan", "roles", index, "assignedAgentId"],
          message: "TeamPlan assignedAgentId must be one of project.agentIds"
        });
      }
    }
  }
});

export type ProjectSourceKind = z.infer<typeof ProjectSourceKindSchema>;
export type ProjectSource = z.infer<typeof ProjectSourceSchema>;

export type Project = z.infer<typeof ProjectSchema>;

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
