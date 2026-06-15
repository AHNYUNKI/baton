# Baton

Baton is a local-first AI development orchestrator. The v0.4 MVP extends the CLI
from dry-run planning into a safe, resumable run loop with worktree isolation,
approval gates, per-step logs, artifacts, mockable worker dispatch, and opt-in
Codex/Claude execution for role-specific workers.

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
baton run "<request>" --dry-run
baton run status <runId>
baton run resume <runId> [--codex] [--claude]
baton run approve <runId> [--codex] [--claude] [--reject]
baton run clean <runId>
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

Approval gates pause execution with status `awaiting-approval`. Continue with:

```bash
baton run approve <runId>
baton run approve <runId> --codex
baton run approve <runId> --claude
baton run approve <runId> --codex --claude
baton run resume <runId> --codex
baton run resume <runId> --claude
baton run resume <runId> --codex --claude
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

## Safety Model

- Real provider execution is opt-in with `--codex`, `--claude`, or both; default
  runs are stubbed.
- `--codex` and `--claude` perform preflight before run/worktree creation.
- Claude is only registered for `analyst`, `architect`, and `reviewer`.
- Implementation and fix steps still pass through approval gates.
- Workers run with `cwd` set to the run worktree path.
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
```

Runtime dependencies are intentionally limited to `zod` and `yaml`; the rest are
development tools for TypeScript and tests.

## v0.4 Non-Goals

- macOS app, web service, or deployment automation.
- Real SQLite persistence.
- Automatic worktree cleanup.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.
- OpenAI Responses or local-model worker adapters.
- Claude multi-turn sessions, MCP integration, and automatic diff capture.

## Follow-Up TODOs

- Add an actual SQLite driver and migration runner behind `DbClient`.
- Add OpenAI Responses adapters behind the worker interface.
- Capture worktree diffs as first-class run artifacts.
- Add optional automatic cleanup policies for retained worktrees.
- Add ESLint after the MVP surface settles.
- Enrich step prompts with prior artifacts and role-specific context.
