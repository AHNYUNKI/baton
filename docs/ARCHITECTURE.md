# Baton Architecture

Baton is a local-first AI development orchestrator. The CLI stays thin and
delegates workflow loading, run state, artifacts, worktree handling, policies,
and worker dispatch to `packages/core`.

## Package Boundaries

```text
packages/schemas
  Zod schemas and shared TypeScript types for persisted data.

packages/core
  Config loading, workflow and agent loading, run planning/execution,
  artifact storage, event logs, worktree management, policies, journals,
  and worker adapters.

packages/cli
  Argument parsing, readable output, preflight checks, and calls into core.
```

Runtime dependencies are intentionally narrow: `zod` for validation and `yaml`
for bundled/local workflow and agent files. SQLite support uses Node's built-in
`node:sqlite` module behind a guarded adapter.

## Pipeline

The bundled workflow in `examples/workflows/default.workflow.yaml` is:

```text
request
  -> analyze
  -> design
  -> approve gate
  -> implement gate
  -> implement
  -> test
  -> review
  -> finalize
  -> completed
```

The `approve` workflow step is always a gate. The default approval policy also
requires approval for `implement` and `fix` step types, so a normal default run
pauses twice before it can complete. `baton run approve <runId>` records the
decision for the current gate and resumes execution until the next gate or a
terminal state.

## Role To Worker Mapping

Worker selection is resolved for each `run`, `run approve`, or `run resume`
command from explicit flags, then `.baton/config.json`, then built-in defaults.

| Role | Worker when enabled | Built-in fallback |
|---|---|---|
| `analyst` | `ClaudeCodeAdapter` with `--claude` or `workers.claude=true` | `StubWorker` |
| `architect` | `ClaudeCodeAdapter` with `--claude` or `workers.claude=true` | `StubWorker` |
| `implementer` | `CodexExecAdapter` with `--codex` or `workers.codex=true` | `StubWorker` |
| `tester` | `TestRunnerAdapter` with `--test` and a resolved test command | `StubWorker` |
| `reviewer` | `ClaudeCodeAdapter` with `--claude` or `workers.claude=true` | `StubWorker` |
| `fixer` | `CodexExecAdapter` with `--codex` or `workers.codex=true` | `StubWorker` |
| `release_writer` | `FinalizeWriter` | `FinalizeWriter` |

The explicit `approve` step does not call an external worker. It records an
approval decision and then completes as `Approval granted.` when approved.

## Worker Adapters

`StubWorker` completes a step without provider-specific execution. This is the
default path for hermetic tests and for any role whose provider is not enabled.

`ClaudeCodeAdapter` is registered for analyst, architect, and reviewer roles. It
runs Claude Code in print mode, passes prompts through stdin, captures stdout
and stderr, and writes role artifacts such as `analysis.md`, `design.md`, and
`review.md`.

`CodexExecAdapter` is registered for implementer and fixer roles. It runs
`codex exec --sandbox workspace-write`, passes prompts through stdin, captures
stdout and stderr, and stores prompts/results under the run artifacts.

`TestRunnerAdapter` is registered for tester only when the test worker is
enabled and a command resolves from `--test-command` or `test.command`. The
command is passed as `(command, args[])`; Baton does not invoke a shell.

`FinalizeWriter` is local and deterministic. It reads `run.json` plus existing
source artifacts and writes `final_summary.md` and `pr_description.md`.

## Artifact Map

Each run owns a directory under `.baton/runs/<runId>/`:

```text
.baton/runs/<runId>/
  request.md
  run.json
  analysis.md          # present when analyze runs through Claude
  design.md            # present when design runs through Claude
  test_result.md       # present when tester runs through TestRunner
  review.md            # present when review runs through Claude
  final_summary.md     # written by FinalizeWriter
  pr_description.md    # written by FinalizeWriter
  events.jsonl
  logs/
    <stepId>.stdout.log
    <stepId>.stderr.log
  steps/
    <stepId>.prompt.md
    <stepId>.result.json
```

`run.json` is the persisted state machine record: request, workflow id, status,
worktree path, base branch, steps, approvals, attempts, and cleanup metadata.

Provider-backed steps store stdout/stderr logs and result JSON for every step.
Codex and Claude prompts are also stored as `steps/<stepId>.prompt.md`.
Finalize artifacts are generated from persisted state and source artifacts; they
do not require a provider.

## Run State And History

`RunExecutor` owns start, resume, and approval decisions:

```text
planned -> running -> awaiting-approval -> running -> completed
                                     \-> cancelled
                         failed -> skipped remaining steps
```

`baton run list`, `baton run show <runId>`, and `baton run status <runId>` read
persisted state from `.baton/runs/<runId>/run.json`. `run.json` remains the
source of truth. The optional SQLite database at `.baton/baton.db` stores a
derived `runs` metadata index for faster lookup and future GUI binding.
`RunIndex` can be rebuilt from files with `baton db reindex`; if `node:sqlite`
is unavailable or the index is empty/stale, history lookup falls back to file
scanning. List and show commands do not call workers or mutate the run file.

`events.jsonl` stores step and fix-loop events. It is append-only for execution
events and is copied into the journal export with the rest of the run directory.

## Worktree Isolation

On a non-dry run, Baton creates:

```text
.baton/worktrees/<runId>
```

Workers run with `cwd` set to that isolated worktree path. `run clean <runId>`
removes only the recorded worktree after the run is terminal and refuses active
runs or the repository root.

Automated tests use a mock `ProcessRunner`, so no real git, provider, or test
process is invoked by the canonical E2E test.

## Safety Model

- Provider and test execution are opt-in through flags or project-local config.
- Codex and Claude preflight checks run before creating run state or worktrees.
- Baton relies on official provider CLIs and does not read provider auth files
  or session files.
- Prompts are passed through stdin rather than command arguments.
- The Codex adapter uses `workspace-write`; broad access modes are not used by
  the adapter.
- The Claude adapter uses print-mode execution for analysis, design, and review.
- Implementation and fix roles are approval-gated by default.
- The fix loop is opt-in and capped by `maxFixAttempts` from 1 to 5.
- Test commands are executed without a shell.
- SQLite writes use parameter binding through `DbClient`, and the database is a
  derived local index rather than authoritative run state.
- Journal export writes only below `<vault>/Baton/`.
- Read-only history commands keep run state unchanged.

## Obsidian Journal Export

When a vault is configured through `BATON_OBSIDIAN_VAULT` or
`obsidian.vault`, Baton exports a self-contained copy of run history:

```text
<vault>/Baton/
  Runs.md
  Runs/
    <runId>.md
    <runId>/
      copied run artifacts
```

The note contains frontmatter for Dataview, a summary table, steps, worker
metadata for `codex`, `claude`, or `stub` roles, artifact links, and embeds for
`analysis.md`, `design.md`, and `review.md` when present. TestRunner output is
represented by the test step status and copied `test_result.md` artifact.

## Hermetic Versus Real Runs

The canonical E2E test uses `StubWorker` for provider roles, a mock
`ProcessRunner`, temporary directories, and a fixed clock. It proves that the
public CLI can drive the full workflow through both approval gates and produce
deterministic run, test, finalize, history, and journal artifacts.

That hermetic path does not prove that local Claude or Codex installations are
available. Real `analysis.md`, `design.md`, and `review.md` artifacts require
`--claude` or `workers.claude=true`; real implementation and fix execution
requires `--codex` or `workers.codex=true`.
