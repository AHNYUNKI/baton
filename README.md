# Baton

Baton is a local-first AI development orchestrator. The v0.2 MVP extends the CLI
from dry-run planning into a safe, resumable run loop with worktree isolation,
approval gates, per-step logs, artifacts, and mockable worker dispatch.

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
baton run "<request>" --dry-run
baton run status <runId>
baton run resume <runId>
baton run approve <runId> [--reject]
baton codex doctor
```

`run --dry-run` creates `.baton/runs/<runId>/request.md` and `run.json`, then
prints the planned workflow steps.

`run "<request>"` creates `.baton/worktrees/<runId>`, persists run state in
`.baton/runs/<runId>/run.json`, and executes workflow steps through the default
CLI registry. In v0.2 the registry uses `StubWorker` for all roles, so the run
engine can be validated end-to-end without calling an external AI provider.

Approval gates pause execution with status `awaiting-approval`. Continue with:

```bash
baton run approve <runId>
baton run resume <runId>
```

Reject a pending gate with:

```bash
baton run approve <runId> --reject
```

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

## v0.2 Non-Goals

- macOS app, web service, or deployment automation.
- Real SQLite persistence.
- Real Codex workflow execution.
- Automatic worktree cleanup.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.

## Follow-Up TODOs

- Add an actual SQLite driver and migration runner behind `DbClient`.
- Connect real worker execution once approval and sandbox policy are explicit.
- Add `baton run clean` for retained worktrees.
- Add ESLint after the MVP surface settles.
- Enrich step prompts with prior artifacts and role-specific context.
