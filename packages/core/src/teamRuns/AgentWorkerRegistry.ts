import { ClaudeCodeAdapter } from "../workers/claude/ClaudeCodeAdapter.js";
import { CodexExecAdapter } from "../workers/codex/CodexExecAdapter.js";
import { StubWorker } from "../workers/StubWorker.js";
import type { WorkerAdapter } from "../workers/WorkerAdapter.js";
import type { ProcessRunner } from "../ports/ProcessRunner.js";

export type AgentWorkerRegistryOptions = {
  codex?: boolean;
  claude?: boolean;
  runner?: ProcessRunner;
  fallback?: WorkerAdapter;
};

export type AgentWorkerRegistryResult = {
  registry: AgentWorkerRegistry;
  codexWorker: "stub" | "codex";
  claudeWorker: "stub" | "claude";
};

export class AgentWorkerRegistry {
  private readonly adapters = new Map<string, WorkerAdapter>();
  private readonly fallback: WorkerAdapter;

  public constructor(fallback: WorkerAdapter = new StubWorker()) {
    this.fallback = fallback;
  }

  public register(agentId: string, adapter: WorkerAdapter): this {
    this.adapters.set(agentId, adapter);
    return this;
  }

  public has(agentId: string): boolean {
    return this.adapters.has(agentId);
  }

  public resolve(agentId: string): WorkerAdapter {
    return this.adapters.get(agentId) ?? this.fallback;
  }
}

export function createAgentWorkerRegistry({
  codex = false,
  claude = false,
  runner,
  fallback = new StubWorker()
}: AgentWorkerRegistryOptions = {}): AgentWorkerRegistryResult {
  const registry = new AgentWorkerRegistry(fallback);

  registry.register("codex", codex ? new CodexExecAdapter(runner === undefined ? {} : { runner }) : new StubWorker());
  registry.register("claude", claude ? new ClaudeCodeAdapter(runner === undefined ? {} : { runner }) : new StubWorker());

  return {
    registry,
    codexWorker: codex ? "codex" : "stub",
    claudeWorker: claude ? "claude" : "stub"
  };
}
