# Baton

Baton is a local-first AI development orchestrator. The v0.10 MVP extends the CLI
from dry-run planning into a safe, resumable run loop with worktree isolation,
approval gates, per-step logs, artifacts, mockable worker dispatch, read-only run
history lookup, deterministic finalize artifacts, project-local config defaults,
and opt-in Codex/Claude/Test Runner execution for role-specific workers.

## Documentation

- [Usage runbook](docs/USAGE.md): build, init, config, gated runs, journal sync,
  and finalize artifacts.
- [Architecture](docs/ARCHITECTURE.md): workflow pipeline, role-to-worker
  mapping, artifacts, worktree isolation, and safety model.

## Quick Start

```bash
corepack pnpm install
corepack pnpm build
alias baton="node packages/cli/dist/main.js"
baton init
baton run "Add a small scoped change" --test --test-command "corepack pnpm test"
baton run approve <runId> --note "Design approved"
baton run approve <runId> --test --test-command "corepack pnpm test" --note "Implementation approved"
baton run show <runId>
```

The default workflow pauses at the explicit design approval gate and again
before implementation. The quick-start path is hermetic for AI providers:
analysis, design, implementation, and review use `StubWorker`; tests run through
the configured test command; finalize writes deterministic local artifacts.
Real `analysis.md`, `design.md`, and `review.md` files require `--claude`.

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
baton config list
baton config get workers.codex
baton config set workers.codex true
baton config set workers.test true
baton config set test.command '["pnpm","test"]'
baton agent list
baton workflow list
baton run "<request>"
baton run "<request>" --codex
baton run "<request>" --no-codex
baton run "<request>" --claude
baton run "<request>" --codex --claude
baton run "<request>" --test --test-command "pnpm test"
baton run "<request>" --codex --test --test-command "pnpm test" --fix
baton run "<request>" --codex --test --test-command "pnpm test" --fix --max-fix-attempts 3
baton run "<request>" --codex --claude --test --test-command "pnpm test"
baton run "<request>" --dry-run
baton run list
baton run list --status completed --limit 10
baton run list --json
baton run show <runId>
baton run status <runId>
baton run resume <runId> [--codex|--no-codex] [--claude|--no-claude] [--test|--no-test] [--fix|--no-fix]
baton run approve <runId> [--codex|--no-codex] [--claude|--no-claude] [--test|--no-test] [--fix|--no-fix] [--reject]
baton run clean <runId>
baton journal sync
baton db status
baton db reindex
baton codex doctor
baton claude doctor
```

## Project Config

Baton reads project-local defaults from `.baton/config.json`. There is no global
or home config. `baton init` creates a complete template with safe built-in
defaults: all provider/test/fix workers are off, `maxFixAttempts` is `1`, and
the example test command is present but inactive until `workers.test` is true.

The config shape is:

```json
{
  "version": 1,
  "obsidian": {
    "vault": "/path/to/Obsidian Vault"
  },
  "test": {
    "command": ["pnpm", "test"]
  },
  "workers": {
    "codex": true,
    "claude": true,
    "test": true,
    "fix": true,
    "maxFixAttempts": 3
  }
}
```

Manage it through the CLI:

```bash
baton config list
baton config get workers.codex
baton config set workers.codex true
baton config set workers.claude true
baton config set workers.test true
baton config set workers.fix true
baton config set workers.maxFixAttempts 3
baton config set test.command '["pnpm","test"]'
baton config set obsidian.vault "/path/to/Obsidian Vault"
```

`baton config set` accepts booleans, integers, JSON arrays, and strings. It
merges the selected dotted key into the existing file, validates the whole
config with Zod, and writes only `.baton/config.json`. Unknown keys or invalid
values are rejected without rewriting the file.

For `baton run`, `run resume`, and `run approve`, worker defaults resolve in
this order:

```text
explicit flag > .baton/config.json > built-in default
```

The built-in worker defaults are all off, which keeps the original StubWorker
path when no config is present. Negative flags fully override config-on values:
`--no-codex`, `--no-claude`, `--no-test`, and `--no-fix`. Supplying both forms,
for example `--codex --no-codex`, is an error.

`run --dry-run` creates `.baton/runs/<runId>/request.md` and `run.json`, then
prints the planned workflow steps.

`run "<request>"` creates `.baton/worktrees/<runId>`, persists run state in
`.baton/runs/<runId>/run.json`, and executes workflow steps through the default
CLI registry. By default the registry uses `StubWorker` for analysis,
implementation, test, review, and fix roles, while `release_writer` is handled
by the local deterministic `FinalizeWriter`. This lets the run engine be
validated end-to-end without calling an external AI provider while still
producing final run artifacts.

The default `finalize` step writes two deterministic files into the run
directory:

- `final_summary.md`: request, workflow state, step table, test summary when
  `test_result.md` exists, artifact pointers, and outcome snapshot.
- `pr_description.md`: a one-line normalized title from the request, summary,
  step overview, test status, and artifact pointers.

`FinalizeWriter` reads only `run.json` plus existing run artifacts such as
`analysis.md`, `design.md`, `test_result.md`, and `review.md`. Missing artifacts
are marked as not present, and rerunning finalize with unchanged inputs rewrites
the same content.

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
Codex handles implementation/fix roles, `release_writer` remains on
`FinalizeWriter`, and every other role remains stubbed.

`--fix` opts into a bounded fix loop for fixable workflow steps. In v0.9 the
default fixable step is `test`: if the initial test step fails, Baton runs the
`fixer` role once by default, then reruns the same test step in the run
worktree. If the retry passes, the workflow continues; if all attempts fail, the
run is marked failed and remaining steps are skipped as before. Increase the
hard bound with:

```bash
baton run "<request>" --codex --test --test-command "pnpm test" --fix --max-fix-attempts 3
```

`--max-fix-attempts` must be an integer from 1 to 5. The loop is strictly
bounded: each attempt is one fixer call plus one retry of the failed step, and
execution stops on success or when the bound is exhausted. Without `--fix`, a
failed test step keeps the previous behavior and fails the run immediately.

The fixer uses the same registry as other workers. `--codex` registers Codex for
`fixer`; without `--codex`, Baton warns that `fixer` is still a `StubWorker`, so
no provider-specific code change is attempted. Fixer calls and retries run with
`cwd` set to the isolated run worktree, and attempts are recorded in `run.json`
plus fix events and per-attempt logs.

`run "<request>" --test` opts into real test execution for the `tester` role
only. The command can be supplied as a flag:

```bash
baton run "<request>" --test --test-command "pnpm test"
```

or configured in `.baton/config.json`:

```json
{
  "version": 1,
  "workers": {
    "test": true
  },
  "test": {
    "command": ["pnpm", "test"]
  }
}
```

The flag form is split on whitespace into a command and argument array. The
config form is already an array and is passed through as command plus args.
Baton does not invoke a shell for test execution. The Test Runner runs in the
run worktree, writes `test_result.md`, and maps a non-zero exit or timeout to a
failed `test` step and failed run. If test execution is enabled without a flag
or config command, Baton prints a warning and keeps `tester` on `StubWorker`.

Approval gates pause execution with status `awaiting-approval`. Continue with:

```bash
baton run approve <runId>
baton run approve <runId> --codex
baton run approve <runId> --claude
baton run approve <runId> --codex --claude
baton run approve <runId> --test --test-command "pnpm test"
baton run approve <runId> --test --test-command "pnpm test" --fix
baton run resume <runId> --codex
baton run resume <runId> --claude
baton run resume <runId> --codex --claude
baton run resume <runId> --test --test-command "pnpm test"
baton run resume <runId> --test --test-command "pnpm test" --fix
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

## SQLite Run Index

Baton keeps `run.json` files as the source of truth. The local SQLite database
at `.baton/baton.db` is a derived index for run metadata, not a replacement for
the artifact files. If `node:sqlite` is unavailable, the database cannot be
opened, or the index is empty or stale, Baton falls back to scanning
`.baton/runs/*/run.json`.

Inspect index availability and row count:

```bash
baton db status
```

Rebuild the `runs` index from the current run files:

```bash
baton db reindex
```

`baton db reindex` deletes and repopulates only the derived `runs` table. It
does not rewrite run artifacts. The database file and SQLite sidecar files are
ignored by git:

```text
.baton/baton.db
.baton/baton.db-wal
.baton/baton.db-shm
```

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
      final_summary.md
      pr_description.md
      logs/
      steps/
```

Run notes include YAML frontmatter for Dataview, a human-readable summary, step
status table, selected worker registry (`codex`, `claude`, or `stub`), copied
artifacts, and embeds for `analysis.md`, `design.md`, and `review.md` when those
artifacts exist. Finalize artifacts are copied with the rest of the run
directory, so `final_summary.md` and `pr_description.md` are available beside
the journal note. `Baton/Runs.md` is regenerated as a map-of-content with both
a Dataview table and a static Markdown fallback table. Existing files outside
`Baton/` are not modified or deleted.

To backfill an already-created local run history after configuring a vault:

```bash
baton journal sync
```

## Safety Model

- Real provider and test execution are opt-in with explicit flags or
  project-local config; default provider-backed roles are stubbed.
- `release_writer` uses the local deterministic `FinalizeWriter` by default and
  does not invoke an external process.
- `--codex` and `--claude` perform preflight before run/worktree creation.
- Claude is only registered for `analyst`, `architect`, and `reviewer`.
- Test Runner is only registered for `tester`, and only when test execution has
  a resolved command.
- Implementation and fix steps still pass through approval gates.
- Workers run with `cwd` set to the run worktree path.
- The `--fix` loop is opt-in through a flag or config and capped by
  `--max-fix-attempts`; no unbounded retry loop is used.
- Test commands are passed as `(command, args[])` with shell execution disabled.
- SQLite is accessed through `node:sqlite` behind a guarded `DbClient`; run
  files remain authoritative and SQL values are bound as parameters.
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
development tools for TypeScript and tests. SQLite uses Node's built-in
`node:sqlite` module when available.

## v0.8 Non-Goals

- macOS app, web service, or deployment automation.
- LLM-written final prose, git diff capture, real PR creation, failure-run
  finalize, fix loops, or SQLite-as-source-of-truth run state.
- Automatic worktree cleanup.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.
- OpenAI Responses or local-model worker adapters.
- Claude multi-turn sessions, MCP integration, and automatic diff capture.
- Automatic test framework detection, structured test output parsing, retries,
  and fix loops.

## Follow-Up TODOs

- Add a migration runner and broader domain indexes behind `DbClient`.
- Add OpenAI Responses adapters behind the worker interface.
- Capture worktree diffs as first-class run artifacts.
- Add optional automatic cleanup policies for retained worktrees.
- Add ESLint after the MVP surface settles.
- Enrich step prompts with prior artifacts and role-specific context.
