import type { WorkerAdapter, WorkerRunInput, WorkerRunResult } from "./WorkerAdapter.js";

export class StubWorker implements WorkerAdapter {
  public async run(input: WorkerRunInput): Promise<WorkerRunResult> {
    return {
      success: true,
      exitCode: 0,
      stdout: [
        "StubWorker completed this step without invoking an external AI worker.",
        `cwd: ${input.cwd}`,
        "stub: true"
      ].join("\n"),
      stderr: "",
      durationMs: 0,
      artifacts: [],
      metadata: {
        provider: "stub",
        stub: true,
        message: "StubWorker did not execute provider-specific code."
      }
    };
  }
}
