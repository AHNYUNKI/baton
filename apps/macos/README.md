# Baton macOS

This directory contains the first native SwiftUI macOS slice for Baton.

The app is intentionally local-first and CLI-bound. It consumes the v0.13 Baton
read API contract through subprocess calls:

- `baton run list --json`
- `baton run show <runId> --json`
- `baton state --json`
- `baton watch [--interval <s>]`
- `baton run approve <runId> [--reject]`
- `baton run resume <runId>`
- `baton run clean <runId>`

No HTTP server, socket server, direct `.baton` mutation, credential handling, or
safety bypass is introduced here. Approval gates and worktree isolation remain
owned by the Baton CLI/core.

## Build

From this repository root:

```bash
swift build --package-path apps/macos/Baton
swift test --package-path apps/macos/Baton
```

Or from `apps/macos/Baton`:

```bash
swift build
swift test
```

## Run

Run the app from the Baton workspace you want the CLI to inspect so the
subprocess inherits that working directory:

```bash
swift run --package-path apps/macos/Baton BatonApp
```

The MVP expects `baton` to be available on `PATH`. If it is not found,
`BatonClient` surfaces a clear error instead of reading credentials or falling
back to private state.

## Manual QA Checklist

SwiftUI UI automation is out of scope for this slice because Xcode UI test
support is not part of the gate. Verify these manually:

- Launch from a Baton workspace with at least one run.
- Confirm the sidebar lists runs from `baton run list --json`.
- Select a run and confirm detail loads from `baton run show <runId> --json`.
- Confirm steps, approvals, and artifacts render when present.
- Trigger Approve and Reject only on a run that is awaiting approval.
- Trigger Resume only on a resumable run.
- Trigger Clean on a run with cleanup state to validate CLI handling.
- Confirm a missing `baton` executable shows an error and the app does not crash.
- Confirm live changes from `baton watch` update the sidebar.

## Test Coverage

`BatonKitTests` cover the logic layer:

- v0.13 JSON envelope decoding and schema version rejection
- run list, run detail, state, and watch event fixtures
- array argv construction for read/write Baton CLI commands
- non-zero exit, empty output, and missing executable errors
- NDJSON partial-line buffering
- deterministic `RunsStore` reduction and sorting

The SwiftUI views are kept thin and compile through `swift build`; detailed UI
behavior remains manual QA for this milestone.
