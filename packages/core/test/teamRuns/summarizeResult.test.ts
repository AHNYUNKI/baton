import { describe, expect, it } from "vitest";

import { summarizeWorkerResult, type WorkerRunResult } from "../../src/index.js";

describe("summarizeWorkerResult", () => {
  it("returns short successful stdout unchanged", () => {
    expect(summarizeWorkerResult(result({ stdout: "short output" }))).toBe("short output");
  });

  it("truncates long successful stdout and marks it", () => {
    expect(summarizeWorkerResult(result({ stdout: "abcdef" }), 3)).toBe("abc…(truncated)");
  });

  it("returns an empty-output message for blank output", () => {
    expect(summarizeWorkerResult(result({ stdout: "  \n\t  " }))).toBe("(출력 없음)");
  });

  it("uses stderr for failed results", () => {
    expect(summarizeWorkerResult(result({ success: false, stdout: "stdout text", stderr: "stderr text" }))).toBe("stderr text");
  });
});

function result(overrides: Partial<WorkerRunResult>): WorkerRunResult {
  return {
    success: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    artifacts: [],
    ...overrides
  };
}
