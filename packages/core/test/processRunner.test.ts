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
});
