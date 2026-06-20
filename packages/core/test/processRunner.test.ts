import { describe, expect, it } from "vitest";

import { createMockProcessRunner, createNodeProcessRunner } from "../src/index.js";

describe("ProcessRunner", () => {
  it("records input on the mock runner", async () => {
    const mock = createMockProcessRunner();

    await mock.runner.run("tool", ["arg"], { cwd: "/repo", input: "hello" });

    expect(mock.calls[0]).toEqual({
      command: "tool",
      args: ["arg"],
      options: { cwd: "/repo", input: "hello" }
    });
  });

  it("writes input to child process stdin in the node runner", async () => {
    const runner = createNodeProcessRunner();

    const result = await runner.run(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
      input: "from stdin"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("from stdin");
  });

  it("keeps existing behavior when input is omitted", async () => {
    const runner = createNodeProcessRunner();

    const result = await runner.run(process.execPath, ["-e", "process.stdout.write('ok')"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ok");
  });

  it("streams stdout and stderr chunks without changing the final result", async () => {
    const runner = createNodeProcessRunner();
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];

    const result = await runner.run(process.execPath, ["-e", "process.stdout.write('out'); process.stderr.write('err')"], {
      onStdout: (chunk) => {
        stdoutChunks.push(chunk);
        throw new Error("stdout observer failed");
      },
      onStderr: (chunk) => {
        stderrChunks.push(chunk);
        throw new Error("stderr observer failed");
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(stdoutChunks.join("")).toBe("out");
    expect(stderrChunks.join("")).toBe("err");
  });

  it("invokes mock runner output callbacks from queued results", async () => {
    const mock = createMockProcessRunner([{ stdout: "mock-out", stderr: "mock-err", exitCode: 0, durationMs: 1 }]);
    const chunks: string[] = [];

    const result = await mock.runner.run("tool", [], {
      onStdout: (chunk) => chunks.push(`stdout:${chunk}`),
      onStderr: (chunk) => chunks.push(`stderr:${chunk}`)
    });

    expect(result.exitCode).toBe(0);
    expect(chunks).toEqual(["stdout:mock-out", "stderr:mock-err"]);
  });
});
