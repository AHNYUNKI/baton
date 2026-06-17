import type { WorkerRunResult } from "../workers/WorkerAdapter.js";

const truncationMarker = "…(truncated)";

export function summarizeWorkerResult(result: WorkerRunResult, maxChars = 1500): string {
  const output = (result.success ? result.stdout : result.stderr).trim();
  if (output.length === 0) {
    return "(출력 없음)";
  }

  const limit = Math.max(0, Math.floor(maxChars));
  if (output.length <= limit) {
    return output;
  }

  return `${output.slice(0, limit)}${truncationMarker}`;
}
