import { CodexExecAdapter, StubWorker, WorkerRegistry, type ProcessRunner } from "@baton/core";
import type { AgentRole } from "@baton/schemas";

export type DefaultWorkerRegistry = {
  registry: WorkerRegistry;
  stubRoles: AgentRole[];
};

export type CodexWorkerRegistry = DefaultWorkerRegistry & {
  codexRoles: AgentRole[];
};

const stubRoles: AgentRole[] = ["analyst", "architect", "implementer", "tester", "reviewer", "fixer", "release_writer"];
const codexRoles: AgentRole[] = ["implementer", "fixer"];

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

export function createCodexWorkerRegistry(options: { runner?: ProcessRunner } = {}): CodexWorkerRegistry {
  const registry = new WorkerRegistry();
  const actualRoles = new Set<AgentRole>(codexRoles);

  for (const role of stubRoles) {
    registry.register(
      role,
      actualRoles.has(role)
        ? new CodexExecAdapter(options.runner === undefined ? {} : { runner: options.runner })
        : new StubWorker()
    );
  }

  return {
    registry,
    codexRoles,
    stubRoles: stubRoles.filter((role) => !actualRoles.has(role))
  };
}
