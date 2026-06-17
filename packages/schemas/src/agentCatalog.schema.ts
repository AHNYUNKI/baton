import { z } from "zod";

export const AgentCatalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export const AgentIdSchema = z.enum(["codex", "claude"]);

export const AgentCatalogSchema = z.array(AgentCatalogEntrySchema).min(1);

export const AGENT_CATALOG = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" }
] as const satisfies readonly z.infer<typeof AgentCatalogEntrySchema>[];

export type AgentCatalogEntry = z.infer<typeof AgentCatalogEntrySchema>;
export type AgentId = z.infer<typeof AgentIdSchema>;
