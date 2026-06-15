# Baton

Baton is a local-first AI development orchestrator. The v0.1 MVP starts as a CLI and
focuses on durable boundaries: schemas, artifacts, workflow plans, and mockable
adapters for future worker execution.

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
baton run "<request>" --dry-run
baton codex doctor
```

During v0.1, `run --dry-run` creates `.baton/runs/<runId>/request.md` and
`run.json`, then prints the planned workflow steps. It does not invoke workers or
create git worktrees.

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

## v0.1 Non-Goals

- macOS app, web service, or deployment automation.
- Real SQLite driver connection.
- Real Codex workflow execution.
- Push, deploy, or package-installing command paths.
- ESLint or Prettier configuration.

## Follow-Up TODOs

- Add an actual SQLite driver and migration runner behind `DbClient`.
- Connect worker execution once approval and sandbox policy are explicit.
- Add ESLint after the MVP surface settles.
- Expand workflow execution beyond dry-run planning.
