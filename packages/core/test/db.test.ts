import { describe, expect, it } from "vitest";

import { DDL_STATEMENTS, TABLE_NAMES, openDatabase } from "../src/index.js";

describe("database skeleton", () => {
  it("returns a no-op DbClient without loading a native driver", async () => {
    const db = openDatabase({ path: "/tmp/baton.sqlite" });

    await expect(db.execute("select 1")).resolves.toBeUndefined();
    await expect(db.query("select 1")).resolves.toEqual([]);
    await expect(db.close()).resolves.toBeUndefined();
  });

  it("defines DDL for all MVP tables", () => {
    expect(TABLE_NAMES).toEqual([
      "projects",
      "agent_profiles",
      "workflows",
      "runs",
      "run_steps",
      "artifacts",
      "events",
      "approvals"
    ]);

    for (const tableName of TABLE_NAMES) {
      expect(DDL_STATEMENTS[tableName]).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`);
    }
  });
});
