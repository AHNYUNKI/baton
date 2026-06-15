import { StubWorker, WorkerRegistry } from "@baton/core";
import type { AgentRole } from "@baton/schemas";

export type DefaultWorkerRegistry = {
  registry: WorkerRegistry;
  stubRoles: AgentRole[];
};

const stubRoles: AgentRole[] = ["analyst", "architect", "implementer", "tester", "reviewer", "fixer", "release_writer"];

export function createDefaultWorkerRegistry(): DefaultWorkerRegistry {
  const registry = new WorkerRegistry();

  for (const role of stubRoles) {
    registry.register(role, new StubWorker());
  }

  return {
    registry,
    stubRoles
  };
}
