import { AGENT_CATALOG, AgentIdSchema, type AgentCatalogEntry, type AgentId } from "@baton/schemas";

export function listAgentCatalog(): AgentCatalogEntry[] {
  return AGENT_CATALOG.map((entry) => ({ ...entry }));
}

export function isAllowedAgent(id: string): id is AgentId {
  return AgentIdSchema.safeParse(id).success;
}
