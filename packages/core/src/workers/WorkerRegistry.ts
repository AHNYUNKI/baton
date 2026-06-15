import type { AgentRole } from "@baton/schemas";

import type { WorkerAdapter } from "./WorkerAdapter.js";

export class WorkerRegistry {
  private readonly adapters = new Map<AgentRole, WorkerAdapter>();

  public register(role: AgentRole, adapter: WorkerAdapter): this {
    this.adapters.set(role, adapter);
    return this;
  }

  public resolve(role: AgentRole): WorkerAdapter | undefined {
    return this.adapters.get(role);
  }
}
