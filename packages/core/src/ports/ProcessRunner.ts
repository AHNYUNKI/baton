import { spawn } from "node:child_process";

export type ProcessRunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export type ProcessRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  metadata?: Record<string, unknown>;
};

export type ProcessRunner = {
  run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessRunResult>;
};

export type ProcessRunnerCall = {
  command: string;
  args: readonly string[];
  options?: ProcessRunOptions;
};

export type MockProcessRunner = {
  runner: ProcessRunner;
  calls: ProcessRunnerCall[];
  enqueueResult(result: ProcessRunResult): void;
};

export function createNodeProcessRunner(): ProcessRunner {
  return {
    run(command: string, args: readonly string[], options: ProcessRunOptions = {}): Promise<ProcessRunResult> {
      const startedAt = Date.now();

      return new Promise<ProcessRunResult>((resolve, reject) => {
        const child = spawn(command, [...args], {
          cwd: options.cwd,
          env: options.env,
          shell: false
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        const timeout =
          options.timeoutMs === undefined
            ? undefined
            : setTimeout(() => {
                child.kill("SIGTERM");
              }, options.timeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stdout += text;
          callOutputCallback(options.onStdout, text);
        });

        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stderr += text;
          callOutputCallback(options.onStderr, text);
        });

        if (options.input !== undefined) {
          child.stdin.end(options.input, "utf8");
        } else {
          child.stdin.end();
        }

        child.on("error", (error: Error) => {
          if (timeout !== undefined) {
            clearTimeout(timeout);
          }
          if (!settled) {
            settled = true;
            reject(error);
          }
        });

        child.on("close", (exitCode: number | null) => {
          if (timeout !== undefined) {
            clearTimeout(timeout);
          }
          if (!settled) {
            settled = true;
            resolve({
              stdout,
              stderr,
              exitCode,
              durationMs: Date.now() - startedAt
            });
          }
        });
      });
    }
  };
}

export function createMockProcessRunner(initialResults: ProcessRunResult[] = []): MockProcessRunner {
  const calls: ProcessRunnerCall[] = [];
  const queuedResults = [...initialResults];

  return {
    calls,
    enqueueResult(result: ProcessRunResult): void {
      queuedResults.push(result);
    },
    runner: {
      async run(command: string, args: readonly string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
        const call = options === undefined ? { command, args: [...args] } : { command, args: [...args], options };
        calls.push(call);

        const result =
          queuedResults.shift() ?? {
            stdout: "",
            stderr: "",
            exitCode: 0,
            durationMs: 0
          };
        if (result.stdout.length > 0) {
          callOutputCallback(options?.onStdout, result.stdout);
        }
        if (result.stderr.length > 0) {
          callOutputCallback(options?.onStderr, result.stderr);
        }
        return result;
      }
    }
  };
}

function callOutputCallback(callback: ((chunk: string) => void) | undefined, chunk: string): void {
  try {
    callback?.(chunk);
  } catch {
    // Streaming observers must never change process execution semantics.
  }
}
