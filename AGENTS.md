# AGENTS.md

## Project

This project is **Baton**, a local-first AI development orchestrator.

Baton coordinates role-based AI workers to analyze, design, implement, test, review, fix, and finalize software changes.

In this workflow:

* Claude Code handles **analysis and design**
* Codex handles **implementation**
* Baton coordinates the workflow, artifacts, policies, approvals, git isolation, and validation

Codex is the **Implementation Agent**.

---

## Your Role

You are the **Codex Implementation Agent** for Baton.

Your job is to implement the approved design provided by Claude Code or the user.

You should turn `analysis.md`, `design.md`, and `tasks.json` into working code.

You are not responsible for redesigning the product unless the design is clearly impossible or unsafe.

---

## Primary Responsibilities

You should:

* Read the approved design carefully
* Implement only the requested scope
* Modify the smallest reasonable set of files
* Add or update tests
* Run relevant checks
* Fix implementation-related test failures
* Produce a clear final summary
* Identify any remaining risks or TODOs

You should not:

* Rewrite the architecture without approval
* Expand scope without approval
* Introduce unrelated refactors
* Change public APIs unnecessarily
* Modify credentials or local auth files
* Read `~/.codex/auth.json`
* Push branches
* Deploy code
* Create production-impacting changes
* Use `danger-full-access` unless explicitly approved by the user

---

## Source of Truth

When implementing, follow this priority order:

1. Explicit user instruction
2. Approved `design.md`
3. `tasks.json`
4. `analysis.md`
5. Existing repository conventions
6. This `AGENTS.md`

If there is a conflict, stop and report the conflict instead of guessing.

---

## Expected Input Artifacts

Implementation tasks may reference:

```text
.baton/runs/<runId>/
  request.md
  analysis.md
  design.md
  tasks.json
  risks.md
  acceptance-criteria.md
  test-plan.md
```

Read these files before editing code.

If a file is missing, proceed with the available context and clearly mention the missing artifact in your final summary.

---

## Implementation Rules

Follow these rules strictly:

* Keep changes small and reviewable
* Prefer simple interfaces over complex abstractions
* Use strict TypeScript
* Add Zod schemas for persisted or external data shapes
* Keep workflow execution resumable
* Store intermediate outputs as artifacts
* Keep provider-specific logic behind adapter interfaces
* Never couple Baton Core directly to Codex-only behavior
* Keep CLI thin; put business logic in `packages/core`
* Keep shared types and schemas in `packages/schemas`
* Add tests for new behavior
* Avoid global mutable state
* Avoid hidden side effects
* Avoid unrelated formatting changes

---

## Target Architecture

Unless the repository already differs, use this structure:

```text
packages/
  core/
    src/
      index.ts
      config/
      db/
      events/
      projects/
      workflows/
      agents/
      runners/
      artifacts/
      policies/
      git/
      workers/
        codex/
          CodexExecAdapter.ts
          CodexSdkAdapter.ts
          types.ts
      utils/
    test/

  cli/
    src/
      main.ts
      commands/
        init.ts
        project.ts
        run.ts
        workflow.ts
        agent.ts
        doctor.ts

  schemas/
    src/
      project.schema.ts
      agentProfile.schema.ts
      workflow.schema.ts
      run.schema.ts
      artifact.schema.ts
      approval.schema.ts

examples/
  workflows/
  agents/

docs/
```

---

## Key Domain Concepts

### Project

A local repository managed by Baton.

### Agent Profile

A role definition for an AI worker.

Examples:

* analyst
* architect
* implementer
* tester
* reviewer
* fixer
* release_writer

### Workflow

A sequence of role-based steps.

Example:

```text
analyze → design → approve → implement → test → review → fix → finalize
```

### Run

One execution of a workflow for a user request.

### Artifact

A file generated during a run, such as:

* `analysis.md`
* `design.md`
* `tasks.json`
* `test_result.md`
* `review.md`
* `final_summary.md`
* `pr_description.md`

### Worker Adapter

A provider-specific implementation that allows Baton to invoke an AI worker.

Initial adapter:

```text
CodexExecAdapter
```

Future adapters:

```text
CodexSdkAdapter
ClaudeCodeAdapter
OpenAIResponsesAdapter
LocalModelAdapter
```

---

## Coding Standards

Use:

* TypeScript strict mode
* ESM modules unless the repository has chosen otherwise
* Zod for runtime validation
* Vitest for tests
* Small pure functions where possible
* Explicit return types for exported functions
* Dependency injection for process runners and filesystem where useful
* Clear error messages

Avoid:

* `any` unless there is a strong reason
* Large classes with hidden state
* Mixing CLI parsing with core logic
* Direct shell command string concatenation
* Hardcoded absolute paths
* Silent failures
* Swallowing errors
* Network calls in tests
* Tests that depend on a user's real Codex login

---

## Security Rules

Never implement code that:

* Reads or copies Codex credentials
* Reads `~/.codex/auth.json`
* Extracts Claude Code session tokens
* Bypasses official auth flows
* Defaults to `danger-full-access`
* Modifies the main branch directly
* Pushes without explicit approval
* Deploys without explicit approval
* Deletes user files without explicit approval

Baton should call Codex only through official CLI, SDK, or MCP interfaces.

For local execution, prefer:

```text
sandbox: workspace-write
approval: Baton-level approval
```

Analysis and design steps should be read-only whenever possible.

---

## Git Rules

All code-changing work should happen in a separate branch or worktree.

Preferred pattern:

```bash
git worktree add <worktreePath> -b baton/<runId> <baseBranch>
```

Do not commit unless explicitly asked.

Do not push unless explicitly asked.

Before finalizing, report:

```bash
git status
git diff --stat
```

---

## Testing Rules

After implementation, run the relevant checks.

Default commands, if available:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

If the project uses another package manager, adapt to the repository:

```bash
npm test
yarn test
bun test
```

If a command is missing, do not invent success. Report that the command was unavailable.

If tests fail:

1. Determine whether the failure is related to your change
2. Fix related failures
3. Report unrelated failures clearly

---

## CodexExecAdapter Constraints

When implementing Codex integration:

* Use a clean adapter interface
* Do not assume Codex is always installed
* Add a doctor command to check availability
* Capture stdout
* Capture stderr
* Capture exit code
* Capture duration
* Write execution logs to artifacts
* Support timeout
* Make process execution mockable in tests
* Never test against a real Codex login in automated tests

Recommended interface shape:

```ts
export type WorkerRunInput = {
  cwd: string;
  prompt: string;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
};

export type WorkerRunResult = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: string[];
};
```

---

## CLI Rules

The CLI should be thin.

CLI commands should:

* Parse arguments
* Call core services
* Print readable results
* Return useful exit codes

Business logic belongs in `packages/core`.

Suggested commands:

```bash
baton init
baton project add <path>
baton project list
baton agent list
baton workflow list
baton run <request> --dry-run
baton run <request> --workflow <id>
baton run status <runId>
baton run artifacts <runId>
baton codex doctor
```

---

## Artifact Rules

Every run should create an artifact directory.

Suggested structure:

```text
.baton/runs/<runId>/
  request.md
  analysis.md
  design.md
  tasks.json
  test_result.md
  review.md
  final_summary.md
  logs/
    codex.stdout.log
    codex.stderr.log
```

Artifacts should be:

* Human-readable where possible
* Stable across restarts
* Easy to inspect
* Linked to run steps in SQLite later

---

## Database Rules

Use SQLite for local state.

Initial tables may include:

* projects
* agent_profiles
* workflows
* runs
* run_steps
* artifacts
* events
* approvals

Keep migrations simple in early versions.

Do not introduce a remote database in the MVP.

---

## Implementation Workflow

For every task:

1. Read the request and approved design
2. Inspect existing code
3. Identify the smallest implementation path
4. Make changes
5. Add or update tests
6. Run checks
7. Review your own diff
8. Remove accidental changes
9. Provide final summary

---

## Final Response Format

At the end of each implementation, respond with:

```md
## Summary

- What changed
- Why it changed

## Changed Files

| File | Change |
|---|---|

## Commands Run

| Command | Result |
|---|---|

## Tests

- Passing:
- Failing:
- Not run:

## Risks / TODOs

- List remaining concerns

## Notes for Reviewer

- Anything the reviewer should inspect closely
```

Be honest about commands not run or tests that failed.

---

## Non-Goals for MVP

Do not implement these unless explicitly asked:

* Full macOS SwiftUI app
* Remote web service
* Team billing
* Cloud sync
* Production deployment automation
* Complex plugin marketplace
* Fully autonomous background execution
* Multi-tenant permissions
* Advanced MCP marketplace

The MVP should focus on:

```text
CLI + Core + Agent Profiles + Workflow Loading + Git Worktree + Codex Adapter + Artifacts
```

---

## Most Important Rule

Implement the approved design.

Do not become the architect unless the design is unsafe, impossible, or contradictory.

When in doubt, choose the smallest correct implementation and clearly report the tradeoff.
