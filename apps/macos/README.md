# Baton macOS

This directory contains the first native SwiftUI macOS slice for Baton.

The app is intentionally local-first and CLI-bound. It consumes the v0.13 Baton
read/write CLI contract through subprocess calls:

- `baton run list --json`
- `baton run show <runId> --json`
- `baton state --json`
- `baton watch [--interval <s>]`
- `baton run <request> [worker/test/fix flags]`
- `baton run approve <runId> [--reject]`
- `baton run resume <runId>`
- `baton run clean <runId>`

No HTTP server, socket server, direct `.baton` mutation, credential handling, or
safety bypass is introduced here. Approval gates and worktree isolation remain
owned by the Baton CLI/core.

## UX

v0.15 establishes a paperclip-inspired Korean UI:

- dark background (`#141414`) with cream text (`#F2EAD8`)
- rounded gradient capsules for status, role, and primary actions
- Korean labels for states, roles, filters, actions, and form fields
- technical identifiers such as `runId`, workflow ids, artifact filenames, and
  CLI flags remain in English

See `UX.md` for the shared macOS design language and manual QA checklist.

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

The app uses `baton` on `PATH` by default. Open `설정` to provide a custom Baton
CLI executable path. Blank settings resolve back to `baton`. If the executable
is not found, `BatonClient` surfaces a clear error instead of reading
credentials or falling back to private state.

## New Run

Use `새 실행` to create a run from the GUI:

- `요청` maps to the positional `baton run <request>` argument.
- role controls map to `--codex/--no-codex`, `--claude/--no-claude`,
  `--test/--no-test`, and `--fix/--no-fix`.
- `테스트 명령` maps to `--test-command <command>`.
- `최대 수정 횟수` maps to `--max-fix-attempts <n>`.
- `계획만(미실행)` maps to `--dry-run`.

The app never writes `.baton` directly for run creation. It delegates to the
Baton CLI so approval gates, worktree isolation, and validation remain owned by
core.

## Manual QA Checklist

SwiftUI UI automation is out of scope for this slice because Xcode UI test
support is not part of the gate. Verify these manually:

- Launch from a Baton workspace with at least one run.
- Confirm the dashboard lists runs from `baton run list --json`.
- Confirm the UI uses Korean labels and the dark/cream/gradient capsule design.
- Select a run and confirm detail loads from `baton run show <runId> --json`.
- Confirm steps, approvals, and artifacts render in the ticket view when present.
- Trigger Approve and Reject only on a run that is awaiting approval.
- Trigger Resume only on a resumable run.
- Trigger Clean on a run with cleanup state to validate CLI handling.
- Open `새 실행`; confirm empty/whitespace `요청` keeps `시작` disabled.
- Enter a request, set worker/test/fix options, and confirm the new run appears
  after `시작`.
- Open `설정`; set a custom baton path and confirm subsequent refresh/new run
  calls use that path.
- Confirm a missing `baton` executable shows an error and the app does not crash.
- Confirm live changes from `baton watch` update the sidebar.

## Test Coverage

`BatonKitTests` cover the logic layer:

- v0.13 JSON envelope decoding and schema version rejection
- run list, run detail, state, and watch event fixtures
- array argv construction for read/write Baton CLI commands
- form-to-`StartRunOptions` mapping for new run creation
- `RunsStore.startRun` orchestration and refresh behavior
- baton executable path resolution
- Korean status/role display mappings and color tokens
- non-zero exit, empty output, and missing executable errors
- NDJSON partial-line buffering
- deterministic `RunsStore` reduction and sorting

The SwiftUI views are kept thin and compile through `swift build`; detailed UI
behavior remains manual QA for this milestone.
