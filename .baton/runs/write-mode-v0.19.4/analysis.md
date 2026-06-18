# Analysis

## User Request
쓰기 모드: AI가 worktree에서 실제 파일을 수정. 게이트는 **시작 전 + 끝 뒤(누적 diff 검토)**.
모든 변경 worktree 격리, 자동 머지·푸시 없음.

## Intent
"진짜 구현"까지. 단 사람이 ① 시작을 승인하고 ② 끝난 뒤 전체 diff를 보고 accept/reject로 통제.
worktree 격리라 reject해도 main 무영향.

## Current Repository Understanding
- **AgentWorkerRegistry**(teamRuns): `createAgentWorkerRegistry({codex,claude,runner,readOnly=true})`,
  `!readOnly && (codex||claude)` → **throw**(v0.19.3 쓰기 차단 placeholder). 이번에 쓰기 경로 구현.
- **CodexExecAdapter**: `sandbox:"workspace-write"|"read-only"`. write면 workspace-write.
- **ClaudeCodeAdapter**: `readOnly`/`outputFormat` opt-in 옵션 존재. write면 비-plan 편집 모드
  (`--permission-mode acceptEdits`, cwd=worktree 한정). `claude --help`로 확정.
- **TeamRunExecutor**: pre-dispatch 게이트(stepId "pre-dispatch") + 순차 실행 → 전부 성공 시
  `completed`. usage/summary/relay 영속. `decide`(approve/reject)는 pre-dispatch 게이트 처리.
- **WorktreeManager**: createWorktree/removeWorktree/list (ProcessRunner 주입). **diff 없음**.
- **TeamRunStatus**: planned/awaiting-approval/running/completed/failed/cancelled. **review 상태 없음.**
- **dispatchConfig**(v0.19.3): start의 provider/timeout 선택을 `team-run-dispatch.json`에 영속→
  approve 적용. write 플래그도 여기 실으면 됨.
- **CLI**: `plan run start/approve/reject/show/list`. preflight(start·approve).

## Relevant Files
| File | Reason |
|---|---|
| `packages/schemas/src/teamRun.schema.ts` | `awaiting-review` 상태 + `diffSummary?` |
| `packages/core/src/git/GitWorktreeManager.ts` | `diff(worktreePath)` 추가 |
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts` | write 경로(workspace-write/acceptEdits) |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` | write 편집 모드 옵션(읽기전용/기본 보존) |
| `packages/core/src/teamRuns/dispatchConfig.ts` | `write` 필드 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | 실행 후 diff 캡처→awaiting-review, `review()` |
| `packages/cli/src/commands/project.ts` | `--write`, `plan run review --accept/--reject`, diff 표시 |
| 각 `*.test.ts` | wiring/diff/review 상태머신/CLI |

## Existing Behavior
실제 디스패치는 읽기 전용만. 완료 후 바로 `completed`. diff 검토 없음.

## Target Behavior
`plan run start <pid> --codex/--claude --write`:
- write일 때만 쓰기 어댑터(codex workspace-write, claude acceptEdits). 아니면 읽기 전용/stub.
- approve → 순차 실행(worktree에서 실제 파일 수정 가능).
- 전부 성공 시(쓰기 모드): worktree 누적 diff 캡처(아티팩트 `diff.patch` + 요약) →
  **`awaiting-review`** + pending review approval(stepId "post-run-review"). **자동 완료 안 함.**
- `plan run review <teamRunId> --accept` → `completed`; `--reject` → `cancelled`. 어느 쪽이든
  **worktree 보존**(자동 머지/푸시/되돌림 없음). 읽기 전용 모드는 종전대로 바로 완료(review 없음).

## Constraints
- **worktree 격리 절대**: 쓰기는 worktree cwd 한정. base≠main. main 직접 수정·자동 머지·푸시 금지.
- **opt-in 이중**: `--write` + provider 플래그 둘 다 있어야 쓰기. 기본 stub/읽기 전용(회귀 0).
- pre-dispatch 승인 + **post-run diff 검토** 둘 다 사람 게이트. 자동 되돌림 없음(사람이 판단).
- claude write는 acceptEdits(편집 허용)지만 `--dangerously-skip-permissions` 금지. credential 무접근.
- 기존 읽기 전용/stub/기존 Run 경로 회귀 0. Swift 미변경(다음 순서).

## Assumptions
- diff 캡처 = `git -C <worktree> add -A` 후 `git diff --cached`(또는 `git status --porcelain` +
  `git diff HEAD`). 정확 명령은 구현 시 확정. 큰 diff는 아티팩트로, 요약(파일수/+−)만 teamRun에.
- reject = cancelled + worktree 보존(검사용). 자동 정리/revert 안 함(폴더 누적은 사용자 정리 or 후속).
- claude acceptEdits가 비대화 편집 허용 가정 — `claude --help`로 확정(불확실 시 보고).

## Open Questions
없음(게이트·범위 확정). diff 캡처 명령·claude write 플래그는 구현 중 확정.

## Risks
- 실제 파일 수정 → 사고 위험. **worktree 격리 + 자동 머지/푸시 없음 + 이중 게이트**로 차단.
- reject 후 worktree 누적 → 사용자 정리 안내(자동 제거 시 작업 유실 위험 → 보존 택).
- 상태 enum 추가(awaiting-review) → 기존 분기 영향 최소(추가값). CLI/테스트 처리.
- 종단 실제 쓰기는 수동 QA(실 CLI·인증). 단위는 mock runner.

## Recommendation
`awaiting-review` 상태 + post-run-review 게이트 추가, WorktreeManager.diff, write 경로(opt-in),
`plan run review`. 자동 머지/푸시/되돌림 없음. 단위는 mock runner(diff/상태머신/플래그), 종단 수동 QA.
게이트 `pnpm typecheck/test/build` 회귀 0.
