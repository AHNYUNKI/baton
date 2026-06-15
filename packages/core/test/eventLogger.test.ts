import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { EventLogger, fixedClock } from "../src/index.js";

describe("EventLogger", () => {
  it("appends JSONL events with the injected clock", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "baton-events-"));
    const logger = new EventLogger({
      eventLogPath: path.join(directory, "events.jsonl"),
      clock: fixedClock("2026-06-15T00:00:00.000Z")
    });

    await logger.append({ type: "run.created", runId: "run-1", payload: { dryRun: true } });
    await logger.append({ type: "run.planned", runId: "run-1" });

    const lines = (await readFile(path.join(directory, "events.jsonl"), "utf8")).trim().split("\n");

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? "{}")).toEqual({
      type: "run.created",
      runId: "run-1",
      payload: { dryRun: true },
      createdAt: "2026-06-15T00:00:00.000Z"
    });
  });
});
