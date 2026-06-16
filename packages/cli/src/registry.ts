import { ClaudeCodeAdapter, CodexExecAdapter, StubWorker, TestRunnerAdapter, WorkerRegistry, type ProcessRunner } from "@baton/core";
import type { AgentRole } from "@baton/schemas";

export type WorkerCommand = {
  command: string;
  args?: readonly string[];
};

export type WorkerRegistryOptions = {
  codex?: boolean;
  claude?: boolean;
  test?: boolean;
  testCommand?: WorkerCommand;
  runner?: ProcessRunner;
};

export type WorkerRegistryResult = {
  registry: WorkerRegistry;
  codexRoles: AgentRole[];
  claudeRoles: AgentRole[];
  testerRoles: AgentRole[];
  stubRoles: AgentRole[];
};

export type DefaultWorkerRegistry = WorkerRegistryResult;

export type CodexWorkerRegistry = WorkerRegistryResult;

const stubRoles: AgentRole[] = ["analyst", "architect", "implementer", "tester", "reviewer", "fixer", "release_writer"];
const codexRoles: AgentRole[] = ["implementer", "fixer"];
const claudeRoles: AgentRole[] = ["analyst", "architect", "reviewer"];
const testerRoles: AgentRole[] = ["tester"];

export function createDefaultWorkerRegistry(): DefaultWorkerRegistry {
  return createWorkerRegistry();
}

export function createCodexWorkerRegistry(options: { runner?: ProcessRunner } = {}): CodexWorkerRegistry {
  return createWorkerRegistry(options.runner === undefined ? { codex: true } : { codex: true, runner: options.runner });
}

export function createWorkerRegistry({ codex = false, claude = false, test = false, testCommand, runner }: WorkerRegistryOptions = {}): WorkerRegistryResult {
  const registry = new WorkerRegistry();
  const actualCodexRoles = codex ? new Set<AgentRole>(codexRoles) : new Set<AgentRole>();
  const actualClaudeRoles = claude ? new Set<AgentRole>(claudeRoles) : new Set<AgentRole>();
  const actualTesterRoles = test && testCommand !== undefined ? new Set<AgentRole>(testerRoles) : new Set<AgentRole>();

  for (const role of stubRoles) {
    if (actualCodexRoles.has(role)) {
      registry.register(role, new CodexExecAdapter(runner === undefined ? {} : { runner }));
      continue;
    }

    if (actualClaudeRoles.has(role)) {
      registry.register(role, new ClaudeCodeAdapter(runner === undefined ? {} : { runner }));
      continue;
    }

    if (actualTesterRoles.has(role) && testCommand !== undefined) {
      registry.register(
        role,
        new TestRunnerAdapter({
          command: testCommand.command,
          args: testCommand.args ?? [],
          ...(runner === undefined ? {} : { runner })
        })
      );
      continue;
    }

    registry.register(role, new StubWorker());
  }

  return {
    registry,
    codexRoles: codexRoles.filter((role) => actualCodexRoles.has(role)),
    claudeRoles: claudeRoles.filter((role) => actualClaudeRoles.has(role)),
    testerRoles: testerRoles.filter((role) => actualTesterRoles.has(role)),
    stubRoles: stubRoles.filter((role) => !actualCodexRoles.has(role) && !actualClaudeRoles.has(role) && !actualTesterRoles.has(role))
  };
}
