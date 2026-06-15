# Baton

Baton is a local-first AI development orchestrator. The v0.3 MVP extends the CLI
from dry-run planning into a safe, resumable run loop with worktree isolation,
approval gates, per-step logs, artifacts, mockable worker dispatch, and opt-in
Codex execution for implementation roles.

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
baton run "<request>" --dry-run
baton run status <runId>
baton run resume <runId> [--codex]
baton run approve <runId> [--codex] [--reject]
baton run clean <runId>
baton codex doctor
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

Approval gates pause execution with status `awaiting-approval`. Continue with:

```bash
baton run approve <runId>
baton run approve <runId> --codex
baton run resume <runId> --codex
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

- Real Codex execution is opt-in with `--codex`; default runs are stubbed.
- `--codex` performs preflight before run/worktree creation.
- Implementation and fix steps still pass through approval gates.
- Workers run with `cwd` set to the run worktree path.
- The default Codex sandbox is `workspace-write`.
- Automated tests mock process and worktree operations; they do not invoke real
  Codex or git.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node packages/cli/dist/main.js --help
```

Runtime dependencies are intentionally limited to `zod` and `yaml`; the rest are
development tools for TypeScript and tests.

## v0.3 Non-Goals

- macOS app, web service, or deployment automation.
- Real SQLite persistence.
- Automatic worktree cleanup.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.
- Claude Code, OpenAI Responses, or local-model worker adapters.

## Follow-Up TODOs

- Add an actual SQLite driver and migration runner behind `DbClient`.
- Add Claude Code and OpenAI Responses adapters behind the worker interface.
- Capture worktree diffs as first-class run artifacts.
- Add optional automatic cleanup policies for retained worktrees.
- Add ESLint after the MVP surface settles.
- Enrich step prompts with prior artifacts and role-specific context.
