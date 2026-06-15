export type WorkerRunInput = {
  cwd: string;
  prompt: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type WorkerRunResult = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: string[];
  metadata?: Record<string, unknown>;
};

export type WorkerAdapter = {
  run(input: WorkerRunInput): Promise<WorkerRunResult>;
};
