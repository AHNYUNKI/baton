# Baton Integration Contract

This document defines the read-only CLI contract intended for local GUI
integrations such as a future Swift macOS app. Baton does not expose an HTTP,
socket, websocket, or daemon API for this contract. Consumers bind to CLI JSON
snapshots and NDJSON watch events.

## Versioned Envelope

Every machine-readable snapshot command prints one JSON value:

```json
{
  "schemaVersion": 1,
  "kind": "run-list",
  "data": {
    "runs": [],
    "skipped": 0
  }
}
```

- `schemaVersion` is currently `1`.
- `kind` identifies the payload shape.
- `data` contains the command-specific payload.

Schema evolution is additive whenever possible. Breaking changes require a new
`schemaVersion`; consumers should reject unknown versions and tolerate additive
fields on known versions.

## Run Summary

Run lists, state summaries, and watch events use this run summary shape:

```json
{
  "runId": "run-1",
  "status": "completed",
  "dryRun": false,
  "workflowId": "default",
  "createdAt": "2026-06-15T00:00:00.000Z",
  "updatedAt": "2026-06-15T12:00:00.000Z",
  "stepCount": 3,
  "outcome": "completed"
}
```

`updatedAt` and `outcome` are omitted when unavailable. `outcome` is present
only for terminal runs.

## Snapshot Commands

### `baton run list --json`

Envelope kind: `run-list`

```json
{
  "schemaVersion": 1,
  "kind": "run-list",
  "data": {
    "runs": [],
    "skipped": 0
  }
}
```

`runs` is sorted by newest `createdAt` first, with `runId` as the deterministic
tie breaker. `skipped` counts run directories that were missing or had invalid
`run.json`.

### `baton run show <runId> --json`

Envelope kind: `run-detail`

```json
{
  "schemaVersion": 1,
  "kind": "run-detail",
  "data": {
    "run": {
      "id": "run-1",
      "request": "Build Baton",
      "workflowId": "default",
      "status": "completed",
      "dryRun": false,
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-15T12:00:00.000Z",
      "steps": [
        {
          "id": "analyze",
          "type": "analyze",
          "status": "completed"
        }
      ]
    },
    "artifacts": ["run.json", "request.md"]
  }
}
```

`run` is the persisted Baton run object. `artifacts` contains deterministic
relative artifact paths under `.baton/runs/<runId>/`.

### `baton run status <runId> --json`

Envelope kind: `run-detail`

The payload is the same as `run show --json`, allowing GUI consumers to use one
detail parser for both commands.

### `baton state --json`

Envelope kind: `state`

```json
{
  "schemaVersion": 1,
  "kind": "state",
  "data": {
    "total": 0,
    "byStatus": {
      "planned": 0,
      "running": 0,
      "awaiting-approval": 0,
      "completed": 0,
      "failed": 0,
      "cancelled": 0
    },
    "recent": []
  }
}
```

`recent` contains the most recent run summaries for dashboard display.

## Text State

`baton state` prints a human-readable overview with total count, status counts,
and recent runs. GUI integrations should use `baton state --json`.

## Watch Stream

`baton watch [--interval <s>] [--once]` writes NDJSON to stdout. Each line is
one event envelope:

```json
{"schemaVersion":1,"kind":"event","data":{"type":"run.created","runId":"run-1","status":"running","run":{"runId":"run-1","status":"running","dryRun":false,"workflowId":"default","createdAt":"2026-06-15T00:00:00.000Z","stepCount":1}}}
```

`--once` emits the current snapshot as `run.created` events and exits. Event
order is deterministic by `runId`. Without `--once`, Baton emits the initial
snapshot, sleeps for the configured interval, polls another snapshot, computes a
pure diff, and writes only changed events. SIGINT and SIGTERM stop the process
cleanly.

Event types:

| Type | Meaning | Extra fields |
|---|---|---|
| `run.created` | A run id appears in the current snapshot but not the previous one. | `status`, `run` |
| `run.removed` | A run id existed previously but is absent now. | `status`, `run` from the previous snapshot |
| `run.status-changed` | A run id remains present and `status` changed. | `previousStatus`, `status`, `run` |
| `run.updated` | A run id remains present, status is unchanged, and `updatedAt` changed. | `previousUpdatedAt`, `updatedAt`, `status`, `run` |

## Read-Only Source

Snapshot commands and watch use Baton's local run state only. The snapshot source
is the v0.12 run index path when available, with file fallback through
`.baton/runs/<runId>/run.json`. These commands do not start workers, mutate run
state, remove files, push branches, deploy, or expose a network server.
