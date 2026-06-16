# Baton

Baton is a local-first AI development orchestrator. The v0.7 MVP extends the CLI
from dry-run planning into a safe, resumable run loop with worktree isolation,
approval gates, per-step logs, artifacts, mockable worker dispatch, read-only run
history lookup, and opt-in Codex/Claude/Test Runner execution for role-specific
workers.

## Packages

- `@baton/schemas`: Zod schemas and inferred TypeScript types for persisted data.
- `@baton/core`: business logic, artifact storage, YAML loaders, event logging,
  process ports, worktree skeletons, and worker adapter skeletons.
- `@baton/cli`: a thin CLI dispatcher over core services.

## Commands

```bash
baton init
baton project add <path>
baton project list
baton agent list
baton workflow list
baton run "<request>"
baton run "<request>" --codex
baton run "<request>" --claude
baton run "<request>" --codex --claude
baton run "<request>" --test --test-command "pnpm test"
baton run "<request>" --codex --claude --test --test-command "pnpm test"
baton run "<request>" --dry-run
baton run list
baton run list --status completed --limit 10
baton run list --json
baton run show <runId>
baton run status <runId>
baton run resume <runId> [--codex] [--claude] [--test]
baton run approve <runId> [--codex] [--claude] [--test] [--reject]
baton run clean <runId>
baton journal sync
baton codex doctor
baton claude doctor
```

`run --dry-run` creates `.baton/runs/<runId>/request.md` and `run.json`, then
prints the planned workflow steps.

`run "<request>"` creates `.baton/worktrees/<runId>`, persists run state in
`.baton/runs/<runId>/run.json`, and executes workflow steps through the default
CLI registry. By default the registry uses `StubWorker` for all roles, so the
run engine can be validated end-to-end without calling an external AI provider.

`run "<request>" --codex` opts into real Codex execution for `implementer` and
`fixer` only. All other roles still use `StubWorker`. Before any run state or
worktree is created, Baton runs a preflight `codex --version` check. If Codex is
missing or returns an error, Baton exits non-zero and leaves no run/worktree
behind.

The Codex adapter runs `codex exec --sandbox workspace-write` with the generated
step prompt passed through stdin, not argv. The prompt is also written to the
run artifacts as `steps/<stepId>.prompt.md`. Baton does not read local Codex
auth files; it relies on the official Codex CLI and the user's existing auth
flow.

`run "<request>" --claude` opts into real Claude Code execution for `analyst`,
`architect`, and `reviewer` only. Baton runs `claude --version` before creating
run state or a worktree. Claude prompts are passed through stdin, recorded as
`steps/<stepId>.prompt.md`, and the captured stdout is written to role artifacts:
`analysis.md`, `design.md`, or `review.md` based on the workflow step type.
The default Claude adapter args are read-only oriented (`--print`) and do not
include write/edit or broad access flags.

`--codex --claude` can be combined: Claude handles analysis/design/review roles,
Codex handles implementation/fix roles, and every other role remains stubbed.

`run "<request>" --test` opts into real test execution for the `tester` role
only. The command can be supplied as a flag:

```bash
baton run "<request>" --test --test-command "pnpm test"
```

or configured in `.baton/config.json`:

```json
{
  "version": 1,
  "test": {
    "command": ["pnpm", "test"]
  }
}
```

The flag form is split on whitespace into a command and argument array. The
config form is already an array and is passed through as command plus args.
Baton does not invoke a shell for test execution. The Test Runner runs in the
run worktree, writes `test_result.md`, and maps a non-zero exit or timeout to a
failed `test` step and failed run. If `--test` is provided without a flag or
config command, Baton prints a warning and keeps `tester` on `StubWorker`.

Approval gates pause execution with status `awaiting-approval`. Continue with:

```bash
baton run approve <runId>
baton run approve <runId> --codex
baton run approve <runId> --claude
baton run approve <runId> --codex --claude
baton run approve <runId> --test --test-command "pnpm test"
baton run resume <runId> --codex
baton run resume <runId> --claude
baton run resume <runId> --codex --claude
baton run resume <runId> --test --test-command "pnpm test"
```

Reject a pending gate with:

```bash
baton run approve <runId> --reject
```

Clean up a retained worktree after a run has reached `completed`, `failed`, or
`cancelled`:

```bash
baton run clean <runId>
```

`run clean` removes only the worktree path recorded in `run.json`, preserves the
run artifact directory, and records `cleanedAt`. Active or awaiting-approval
runs are refused.

## Run History Lookup

Use `run list` to inspect persisted local run history without changing run state:

```bash
baton run list
baton run list --status completed
baton run list --limit 10
baton run list --status failed --json
```

The table view shows run id, status, workflow id, creation time, step count, and
terminal outcome when one exists. Results are sorted by `createdAt` descending,
then by run id ascending for deterministic output. Missing or invalid run
directories are skipped and reported with a skipped count instead of being hidden.

`--json` prints a stable JSON array with these fields:

```json
[
  {
    "runId": "run-123",
    "status": "completed",
    "dryRun": false,
    "workflowId": "default",
    "createdAt": "2026-06-15T00:00:00.000Z",
    "updatedAt": "2026-06-15T00:01:00.000Z",
    "stepCount": 3,
    "outcome": "completed"
  }
]
```

Use `run show` for a detailed read-only view of one run:

```bash
baton run show <runId>
```

It prints the request, step timings and reasons, approvals, worktree and cleanup
metadata, and the files currently stored in `.baton/runs/<runId>/`.

## Obsidian Journal Export

Baton can automatically mirror run history into an Obsidian vault when a vault is
configured. Set the environment variable, or add the same path to
`.baton/config.json`:

```bash
export BATON_OBSIDIAN_VAULT="/path/to/Obsidian Vault"
```

```json
{
  "version": 1,
  "obsidian": {
    "vault": "/path/to/Obsidian Vault"
  }
}
```

When configured, Baton writes a self-contained journal entry after successful
`run`, `run resume`, `run approve`, and `run clean` command results. If no vault
is configured, Baton skips the export without changing the command result. If an
export fails, Baton prints a warning and preserves the original run exit code.

The exporter only writes below the vault's `Baton/` directory:

```text
<vault>/Baton/
  Runs.md
  Runs/
    <runId>.md
    <runId>/
      request.md
      run.json
      analysis.md
      design.md
      review.md
      logs/
      steps/
```

Run notes include YAML frontmatter for Dataview, a human-readable summary, step
status table, selected worker registry (`codex`, `claude`, or `stub`), copied
artifacts, and embeds for `analysis.md`, `design.md`, and `review.md` when those
artifacts exist. `Baton/Runs.md` is regenerated as a map-of-content with both a
Dataview table and a static Markdown fallback table. Existing files outside
`Baton/` are not modified or deleted.

To backfill an already-created local run history after configuring a vault:

```bash
baton journal sync
```

## Safety Model

- Real provider and test execution are opt-in with `--codex`, `--claude`, and
  `--test`; default runs are stubbed.
- `--codex` and `--claude` perform preflight before run/worktree creation.
- Claude is only registered for `analyst`, `architect`, and `reviewer`.
- Test Runner is only registered for `tester`, and only when `--test` has a
  resolved command.
- Implementation and fix steps still pass through approval gates.
- Workers run with `cwd` set to the run worktree path.
- Test commands are passed as `(command, args[])` with shell execution disabled.
- The default Codex sandbox is `workspace-write`.
- The default Claude adapter uses non-mutating print mode and avoids write/edit
  or broad access flags.
- Automated tests mock process and worktree operations; they do not invoke real
  Claude, Codex, or git.

## Development

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
node packages/cli/dist/main.js --help
node packages/cli/dist/main.js run --help
```

Runtime dependencies are intentionally limited to `zod` and `yaml`; the rest are
development tools for TypeScript and tests.

## v0.7 Non-Goals

- macOS app, web service, or deployment automation.
- Real SQLite persistence.
- Automatic worktree cleanup.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.
- OpenAI Responses or local-model worker adapters.
- Claude multi-turn sessions, MCP integration, and automatic diff capture.
- Automatic test framework detection, structured test output parsing, retries,
  and fix loops.

## Follow-Up TODOs

- Add an actual SQLite driver and migration runner behind `DbClient`.
- Add OpenAI Responses adapters behind the worker interface.
- Capture worktree diffs as first-class run artifacts.
- Add optional automatic cleanup policies for retained worktrees.
- Add ESLint after the MVP surface settles.
- Enrich step prompts with prior artifacts and role-specific context.
