import { describe, expect, it } from "vitest";

import { DDL_STATEMENTS, TABLE_NAMES } from "../src/index.js";

describe("database skeleton", () => {
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
    expect(DDL_STATEMENTS.runs).toContain("step_count INTEGER NOT NULL");
    expect(DDL_STATEMENTS.runs).toContain("outcome TEXT");
  });
});
