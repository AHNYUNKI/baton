import { describe, expect, it, vi } from "vitest";

import { WorkerRegistry } from "../src/index.js";
import type { WorkerAdapter } from "../src/index.js";

describe("WorkerRegistry", () => {
  it("resolves registered workers and returns undefined for missing roles", () => {
    const adapter: WorkerAdapter = { run: vi.fn() };
    const registry = new WorkerRegistry().register("implementer", adapter);

    expect(registry.resolve("implementer")).toBe(adapter);
    expect(registry.resolve("reviewer")).toBeUndefined();
  });
});
