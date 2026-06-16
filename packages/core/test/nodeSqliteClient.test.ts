import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { NodeSqliteClient, isNodeSqliteModule, openDatabase, type NodeSqliteModule } from "../src/index.js";

const sqlite = await loadNodeSqliteForTest();

describe("NodeSqliteClient", () => {
  it.skipIf(sqlite === undefined)("executes queries with bound parameters", async () => {
    const client = new NodeSqliteClient({ path: ":memory:", sqlite: sqlite as NodeSqliteModule });

    try {
      await client.execute("CREATE TABLE items (id TEXT PRIMARY KEY, value TEXT NOT NULL)", []);
      await client.execute("INSERT INTO items (id, value) VALUES (?, ?)", ["item-1", "hello'); DROP TABLE items; --"]);

      const rows = await client.query<{ id: string; value: string }>("SELECT id, value FROM items WHERE id = ?", ["item-1"]);
      const countRows = await client.query<{ count: number }>("SELECT COUNT(*) AS count FROM items", []);

      expect(rows).toEqual([{ id: "item-1", value: "hello'); DROP TABLE items; --" }]);
      expect(countRows).toEqual([{ count: 1 }]);
    } finally {
      await client.close();
    }
  });
});

describe("openDatabase", () => {
  it("returns undefined when node:sqlite cannot be loaded", async () => {
    await expect(
      openDatabase({
        path: ":memory:",
        loadSqliteModule: async () => {
          throw new Error("not available");
        }
      })
    ).resolves.toBeUndefined();
  });

  it("returns undefined when a loaded module does not expose DatabaseSync", async () => {
    await expect(openDatabase({ path: ":memory:", loadSqliteModule: async () => ({}) })).resolves.toBeUndefined();
  });
});

async function loadNodeSqliteForTest(): Promise<NodeSqliteModule | undefined> {
  try {
    const require = createRequire(import.meta.url);
    const module = require("node:sqlite") as unknown;
    return isNodeSqliteModule(module) ? module : undefined;
  } catch {
    return undefined;
  }
}
