import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { Clock } from "../ports/Clock.js";
import { systemClock } from "../ports/Clock.js";

export type EventLoggerOptions = {
  eventLogPath: string;
  clock?: Clock;
};

export type BatonEvent = {
  type: string;
  runId?: string;
  payload?: Record<string, unknown>;
};

export class EventLogger {
  private readonly eventLogPath: string;
  private readonly clock: Clock;

  public constructor(options: EventLoggerOptions) {
    this.eventLogPath = options.eventLogPath;
    this.clock = options.clock ?? systemClock;
  }

  public async append(event: BatonEvent): Promise<void> {
    await mkdir(path.dirname(this.eventLogPath), { recursive: true });
    const entry = {
      ...event,
      createdAt: this.clock.now().toISOString()
    };
    await appendFile(this.eventLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
