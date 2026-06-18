import { describe, expect, it } from "vitest";

import { StubWorker } from "../src/index.js";

describe("StubWorker", () => {
  it("returns a successful explicit stub result without side effects", async () => {
    const result = await new StubWorker().run({ cwd: "/worktree", prompt: "Do the work" });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("StubWorker");
    expect(result.stdout).toContain("stub: true");
    expect(result.stdout).toContain("## 학습 설명");
    expect(result.stdout).toContain("무엇을 했나");
    expect(result.metadata).toMatchObject({ stub: true });
  });
});
