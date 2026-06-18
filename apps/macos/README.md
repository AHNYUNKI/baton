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
- `baton project create --name <name> --source-kind <local|github> --source <value> --agent <id> [--agent <id> ...] [--lead <id>]`
- `baton project list --json`
- `baton project plan generate <projectId> --overview <text>`
- `baton project plan show <projectId> --json`
- `baton project plan set <projectId> --file <path>`
- `baton project plan run start <projectId> [--codex] [--claude] [--write] [--base <branch>] [--timeout-ms <ms>] --json`
- `baton project plan run approve|reject <teamRunId> [--note <text>] --json`
- `baton project plan run review <teamRunId> --accept|--reject [--note <text>] --json`
- `baton project plan run show <teamRunId> --json`
- `baton project plan run list <projectId> --json`

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

v0.18 adds the Paperclip-style app shell:

- grouped sidebar IA: `액션`, `작업`, `프로젝트`, `에이전트`, `계정`
- `받은 함` collects only `awaiting-approval` runs from the existing run list
- project detail tabs: `개요`, `계획`, `조직도`, `실행`
- `조직도` renders the existing TeamPlan as lead AI + role nodes
- `실행` hosts the TeamRun execution monitor in v0.19.5 and later

v0.18.3 extends TeamPlan with optional `reportsTo` hierarchy:

- missing `reportsTo` stays backward-compatible and renders as representative-direct
- `reportsTo: null` also means representative-direct
- valid `reportsTo` role ids render as nested manager/report branches
- missing, self-referential, or cyclic parent references are displayed as
  representative-direct instead of failing the app

v0.19.5 turns the project `실행` tab into a TeamRun monitor:

- TeamRun list/show/start/approve/reject/review all go through the existing CLI
- provider toggles (`Codex`, `Claude`) and `쓰기` default off, so start begins in stub mode
- role rows show live status, assigned AI, summary, artifacts, and token usage
- approval and diff review gates expose Korean actions while keeping CLI/core safety
- `baton watch` refreshes the selected TeamRun and feeds the org chart status map

v0.19.6 scopes local project detail actions to the project source path:

- local project detail, TeamPlan, TeamRun, and watch commands run with
  `source.value` as the Baton CLI working directory
- GitHub project sources remain references only and keep the default working
  directory behavior
- dashboard, project list, and global run list views continue to use the
  existing global client

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

Run the app from the Baton workspace you want the global dashboard and run list
to inspect so those subprocesses inherit that working directory:

```bash
swift run --package-path apps/macos/Baton BatonApp
```

The app uses `baton` on `PATH` by default. Open `설정` to provide a custom Baton
CLI executable path. Blank settings resolve back to `baton`. If the executable
is not found, `BatonClient` surfaces a clear error instead of reading
credentials or falling back to private state.

When a local project is selected, project detail actions use that project's
stored local source path as `baton`'s working directory. GitHub project sources
are not cloned or scoped.

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

## New Project

Use `새 프로젝트` to register a project from the GUI:

- `이름` maps to `--name <name>`.
- `소스` maps to `--source-kind local|github` and `--source <value>`.
- local sources come from a folder picker or a typed path.
- GitHub sources are references only; the app stores the URL through the CLI and
  never clones or contacts GitHub.
- AI checkboxes map to repeated `--agent <id>` arguments. v0.16 exposes Codex
  and Claude.
- when multiple AI agents are selected, `대표` maps to `--lead <id>`. A single
  selected AI lets core assign the lead automatically.

Project creation and listing use argv arrays through `BatonClient`; the app does
not mutate `.baton` directly.

## TeamPlan

Select a project to draft and edit its TeamPlan:

- `개요` maps to `baton project plan generate <projectId> --overview <text>`.
- `대표에게 맡기기` is the only action that invokes the configured lead AI.
- local projects run plan commands from the stored local source path.
- generated roles are decoded from the `team-plan` envelope and shown for review.
- each role may keep an optional `reportsTo` role id; `대표` maps to no parent.
- role edits stay local until `저장`.
- `저장` writes a temporary JSON file and calls `baton project plan set <projectId> --file <path>`.

The TeamPlan editor only drafts, reviews, edits, and persists plans. Execution
is handled separately by the `실행` tab through the TeamRun CLI commands.

## TeamRun Execution Monitor

Select a project and open `실행` to inspect and operate the current TeamRun:

- `TeamRun` picker defaults to the newest `createdAt`.
- `시작` calls `baton project plan run start <projectId> --json`; `Codex`,
  `Claude`, `쓰기`, `base branch`, and `timeout ms` map directly to CLI flags.
- local projects run TeamRun list/show/start/approve/reject/review and
  `baton watch` from the stored local source path.
- when status is `awaiting-approval`, `승인` and `거부` call the corresponding
  CLI decision command with an optional note.
- when status is `awaiting-review`, the view shows `diffSummary`, points to
  `.baton/runs/<teamRunId>/diff.patch`, and calls review accept/reject.
- token usage is displayed per role and in total when the CLI provides usage.
- `baton watch` events trigger `show` refreshes; manual `새로고침` remains the
  fallback.

The monitor does not read credentials, open HTTP connections, or mutate
`.baton` directly.

## App Shell and Org Chart

The app shell keeps Baton local-first and CLI-bound. `RootView` loads projects
with `baton project list --json` through `BatonClient`, shares the existing
`RunsStore`, and routes sections with the pure `AppNavigationModel`.

The org chart is a read-only visualization of already persisted project data:

- lead: `Project.leadAgentId`, or the single project agent when no lead is set
- roles: `Project.teamPlan.roles`, nested by optional `TeamRole.reportsTo`
- node state: static `planned` unless the current TeamRun supplies a role status map
- hierarchy defense: missing parents, self references, and cycle participants are
  treated as representative-direct roots

Live role lighting is label-backed, not color-only. `awaiting-review` is shown
as `검토 대기`.

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
- Confirm the grouped sidebar shows `액션`, `작업`, `프로젝트`, `에이전트`, and
  `계정`.
- Confirm `대시보드`, `받은 함`, `실행`, project rows, `AI 조직`, and `계정`
  route the main content correctly.
- Confirm `받은 함` shows only `승인 대기` runs and its count matches the
  sidebar badge.
- Open `새 프로젝트`; confirm empty `이름` or `소스` keeps `다음`/`생성` disabled.
- Create a local project with the folder picker and confirm it appears in the
  `프로젝트` list with source, AI badges, and lead.
- Create a GitHub project using a `https://github.com/owner/repo` URL and confirm
  it is shown as a reference only.
- Select both Codex and Claude and confirm `대표` is required before `생성`.
- Select a project, enter `개요`, and confirm `대표에게 맡기기` shows generated roles
  when the lead CLI is available.
- Confirm project tabs switch between `개요`, `계획`, `조직도`, and `실행`.
- Confirm `조직도` shows the representative AI with `👑`, role nodes, assigned AI
  labels, and text status labels.
- Confirm a TeamPlan with `reportsTo` renders 2~3 levels with horizontal cards,
  elbow connectors, and horizontal/vertical canvas scrolling.
- Confirm missing `reportsTo` and invalid parent references still render as
  representative-direct roles.
- Edit a role's `보고 대상`, save, refresh, and confirm the hierarchy is preserved.
- Confirm the `실행` tab loads TeamRuns, defaults to the newest run, and shows
  role status labels, assigned AI, summary, token usage, worktree, and diff info.
- Start a TeamRun with all toggles off and confirm it uses stub mode; then test
  `Codex`, `Claude`, `쓰기`, `base branch`, and `timeout ms` only in a safe
  workspace.
- On `승인 대기`, trigger `승인` and `거부` and confirm the selected TeamRun
  refreshes.
- On `검토 대기`, confirm `diffSummary`, `.baton/runs/<teamRunId>/diff.patch`,
  and review accept/reject actions are visible.
- Confirm `baton watch` or `새로고침` updates the execution monitor and the
  `조직도` node statuses.
- Confirm a local project selected from the sidebar shows CLI-created TeamRuns
  from that project's repository rather than the app launch directory.
- Edit a role name, description, 담당 AI, and 지침; add and delete a role; confirm
  invalid plans keep `저장` disabled.
- Save the TeamPlan and confirm the project card shows the role count after refresh.
- Confirm lead CLI failures are surfaced as an error and the app does not crash.

## Test Coverage

`BatonKitTests` cover the logic layer:

- v0.13 JSON envelope decoding and schema version rejection
- run list, run detail, state, and watch event fixtures
- array argv construction for read/write Baton CLI commands
- form-to-`StartRunOptions` mapping for new run creation
- `ProjectFormModel` validation and argv-array construction
- `BatonClient.createProject` and `BatonClient.listProjects` argv/envelope logic
- `TeamPlanEditModel` validation, editing, and JSON serialization
- `BatonClient.generateTeamPlan`, `showTeamPlan`, and `setTeamPlan` argv/envelope logic
- `RunsStore.startRun` orchestration and refresh behavior
- baton executable path resolution
- Korean status/role display mappings and color tokens
- non-zero exit, empty output, and missing executable errors
- NDJSON partial-line buffering
- deterministic `RunsStore` reduction and sorting
- pure app navigation transitions for sidebar sections and project tabs
- pure TeamPlan-to-org-chart mapping, including no-plan and single-agent lead cases
- pure inbox filtering for `awaiting-approval` runs
- TeamRun contract decoding for `team-run`/`team-run-list`
- TeamRun BatonClient argv/envelope behavior
- pure TeamRun status-by-role, Korean label, and monitor selection/gate logic

The SwiftUI views are kept thin and compile through `swift build`; detailed UI
behavior remains manual QA for this milestone.
