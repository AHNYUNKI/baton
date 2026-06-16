export const TABLE_NAMES = [
  "projects",
  "agent_profiles",
  "workflows",
  "runs",
  "run_steps",
  "artifacts",
  "events",
  "approvals"
] as const;

export type BatonTableName = (typeof TABLE_NAMES)[number];

export const DDL_STATEMENTS: Record<BatonTableName, string> = {
  projects: `
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `,
  agent_profiles: `
    CREATE TABLE IF NOT EXISTS agent_profiles (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      description TEXT
    );
  `,
  workflows: `
    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      definition_json TEXT NOT NULL
    );
  `,
  runs: `
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      dry_run INTEGER NOT NULL,
      workflow_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      step_count INTEGER NOT NULL,
      outcome TEXT
    );
  `,
  run_steps: `
    CREATE TABLE IF NOT EXISTS run_steps (
      id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (run_id, id)
    );
  `,
  artifacts: `
    CREATE TABLE IF NOT EXISTS artifacts (
      run_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      kind TEXT NOT NULL,
      PRIMARY KEY (run_id, name)
    );
  `,
  events: `
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `,
  approvals: `
    CREATE TABLE IF NOT EXISTS approvals (
      run_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, step_id)
    );
  `
};
