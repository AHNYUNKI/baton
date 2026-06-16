# Baton Usage Runbook

This runbook follows the public CLI surface implemented in the Baton MVP. The
same commands work with the built CLI binary, or with `node
packages/cli/dist/main.js` from this repository after a build.

## Build Locally

```bash
corepack pnpm install
corepack pnpm build
node packages/cli/dist/main.js --help
node packages/cli/dist/main.js run --help
```

For local shell sessions, you can shorten examples by defining:

```bash
alias baton="node packages/cli/dist/main.js"
```

## Initialize A Project

Run these commands from the repository that Baton should manage:

```bash
baton init
baton project add "$PWD"
baton project list
baton agent list
baton workflow list
baton config list
```

`baton init` creates `.baton/config.json`, `.baton/runs/`,
`.baton/workflows/`, and `.baton/agents/`. The generated config keeps provider,
test, and fix workers disabled until you opt in.

## Configure Workers And Artifacts

All config is project-local and is stored in `.baton/config.json`.

```bash
baton config set workers.codex true
baton config set workers.claude true
baton config set workers.test true
baton config set test.command '["corepack","pnpm","test"]'
baton config set workers.fix true
baton config set workers.maxFixAttempts 3
baton config set obsidian.vault "/path/to/Obsidian Vault"
baton config get workers.codex
baton config list
```

For `baton run`, `baton run approve`, and `baton run resume`, worker options
resolve in this order:

```text
explicit flag > .baton/config.json > built-in default
```

Negative flags turn configured workers off for that command:

```bash
baton run "<request>" --no-codex --no-claude --no-test --no-fix
```

## Run The Default Workflow

The bundled default workflow is:

```text
analyze -> design -> approve -> implement -> test -> review -> finalize
```

The default approval policy pauses twice: once at the explicit `approve` step
and once before `implement`. `baton run approve <runId>` records the decision
for the current gate and immediately resumes until the next gate or terminal
status.

### Hermetic Local Demo

This path does not call Claude or Codex. Analysis, design, implementation, and
review use `StubWorker`; the test step uses the configured test command; finalize
uses the deterministic local `FinalizeWriter`.

```bash
baton run "Add a small scoped change" --test --test-command "corepack pnpm test"
```

The command prints `awaiting-approval` and an approval hint:

```text
Awaiting approval: baton run approve <runId> # approve
```

Inspect the paused run:

```bash
baton run status <runId>
baton run show <runId>
```

Approve the design gate:

```bash
baton run approve <runId> --note "Design approved"
```

The run pauses again before implementation:

```text
Awaiting approval: baton run approve <runId> # implement
```

Approve implementation and keep the test worker enabled for the remaining
steps:

```bash
baton run approve <runId> --test --test-command "corepack pnpm test" --note "Implementation approved"
```

After success, inspect history and artifacts:

```bash
baton run list
baton run list --status completed --limit 10
baton run show <runId>
```

Expected run artifacts include:

```text
.baton/runs/<runId>/
  request.md
  run.json
  test_result.md
  final_summary.md
  pr_description.md
  logs/
  steps/
  events.jsonl
```

### Real Worker Run

Use real providers only when their official CLIs are installed and authenticated
outside Baton:

```bash
baton codex doctor
baton claude doctor
```

Start with Claude enabled if you want `analysis.md` and `design.md` from Claude:

```bash
baton run "Implement the approved request" --claude --test --test-command "corepack pnpm test"
```

Approve the design gate:

```bash
baton run approve <runId> --note "Design approved"
```

Approve implementation with the workers needed for the remaining steps:

```bash
baton run approve <runId> --codex --claude --test --test-command "corepack pnpm test" --note "Implementation approved"
```

In this mode, Claude handles analyst, architect, and reviewer roles; Codex
handles implementer and fixer roles; TestRunner handles tester; FinalizeWriter
handles release_writer. Worker selection is resolved per CLI invocation, so pass
the provider flags again on `approve` or `resume` when later steps need them.

The hermetic test path intentionally does not create `analysis.md`, `design.md`,
or `review.md`. Those files are produced only when the relevant steps run with
`--claude` or `workers.claude=true`.

## Resume, Reject, Fix, And Clean

Use `resume` for a non-terminal run that already has the necessary approvals or
was interrupted between steps:

```bash
baton run resume <runId> --codex --claude --test --test-command "corepack pnpm test"
```

Reject the current pending gate:

```bash
baton run approve <runId> --reject
```

Enable the bounded fix loop for test failures:

```bash
baton run "Fix failing tests" --codex --test --test-command "corepack pnpm test" --fix --max-fix-attempts 3
```

`--max-fix-attempts` must be an integer from 1 to 5. Each attempt runs the
`fixer` role once and retries the failed test step once. Without `--codex`, the
fixer remains stubbed and Baton warns that no provider-specific code change was
attempted.

Clean a retained worktree after a terminal run:

```bash
baton run clean <runId>
```

`run clean` preserves `.baton/runs/<runId>/` and refuses active,
awaiting-approval, or repository-root cleanup targets.

## Obsidian Journal

Configure a vault with either an environment variable or project config:

```bash
export BATON_OBSIDIAN_VAULT="/path/to/Obsidian Vault"
baton config set obsidian.vault "/path/to/Obsidian Vault"
```

When a vault is configured, Baton exports after successful `run`, `run approve`,
`run resume`, and `run clean` commands. Backfill existing runs with:

```bash
baton journal sync
```

The exporter writes only under the vault's `Baton/` directory:

```text
<vault>/Baton/
  Runs.md
  Runs/
    <runId>.md
    <runId>/
      request.md
      run.json
      test_result.md
      final_summary.md
      pr_description.md
      logs/
      steps/
```

`Runs.md` contains a Dataview table and a static Markdown fallback. The per-run
note embeds `analysis.md`, `design.md`, and `review.md` when those Claude
artifacts exist, and copies finalize artifacts beside the note.

## Finalize Outputs

The default `finalize` step is local and deterministic. It writes:

```text
.baton/runs/<runId>/final_summary.md
.baton/runs/<runId>/pr_description.md
```

`final_summary.md` summarizes the request, status, steps, test result, and
artifact pointers. `pr_description.md` provides a review-ready description using
the same persisted run state and artifacts. Missing source artifacts are listed
as not present rather than invented.
