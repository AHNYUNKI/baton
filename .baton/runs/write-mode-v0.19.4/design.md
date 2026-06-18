# Implementation Design — write-mode-v0.19.4

## Summary

opt-in **쓰기 모드**를 추가한다. `plan run start ... --codex/--claude --write` 시 AI가 **worktree
안에서 실제 파일을 수정**(codex `--sandbox workspace-write`, claude `--permission-mode
acceptEdits`). 게이트는 **둘 다**: 기존 pre-dispatch 승인 + 실행 완료 후 **누적 diff 검토**
(`awaiting-review` → `plan run review --accept/--reject`). 모든 변경은 **worktree 격리**,
**자동 머지·푸시·되돌림 없음**. 기본은 여전히 읽기 전용/stub(회귀 0). headless TS, Swift는 다음 순서.

## Scope

### In Scope
- 상태 `awaiting-review` + post-run-review 게이트(approvals stepId "post-run-review").
- `WorktreeManager.diff(worktreePath)` + 실행 후 누적 diff 캡처(아티팩트 `diff.patch` + 요약).
- write 경로: dispatchConfig `write`, AgentWorkerRegistry write 프로파일, claude 편집 모드 옵션.
- CLI `--write` + `plan run review <id> --accept|--reject` + show diff 요약.
- 단위 테스트(mock runner): write wiring/diff 캡처/review 상태머신/CLI/회귀. 종단 수동 QA.

### Out of Scope
- 자동 머지/푸시/revert, 중간(역할별) 게이트, 병렬, fix 루프, 재위임, Swift 모니터.
- worktree 자동 정리(쓰기 run은 보존). codex usage 정밀화.

## Proposed Architecture

### 상태 & 게이트 — teamRun.schema
- `TeamRunStatusSchema`에 **`awaiting-review`** 추가(enum, 추가값).
- 게이트는 기존 `approvals[]` 재사용 — 새 stepId 상수 `post-run-review`(pre-dispatch와 구분).
- `TeamRun`에 `diffSummary?: z.string().optional()`(예: "3 files changed, +40/-5", 표시용; 전체는
  아티팩트 `diff.patch`).

### diff 캡처 — GitWorktreeManager
```ts
WorktreeManager += diff(worktreePath: string): Promise<ProcessRunResult>
//  git -C <worktree> add -A  후  git -C <worktree> --no-pager diff --cached  (+ --stat 요약)
//  (정확 명령/2-스텝은 구현 시 확정; 목적: 미커밋 변경 전부 캡처)
```
- 순수 포트(ProcessRunner 주입) → 테스트는 mock.

### 워커 write 프로파일 — AgentWorkerRegistry / ClaudeCodeAdapter
- `createAgentWorkerRegistry({codex,claude,runner,readOnly})`: **readOnly=false(=write)** 허용:
  - codex → `new CodexExecAdapter({runner, sandbox:"workspace-write"})`
  - claude → `new ClaudeCodeAdapter({runner, readOnly:false, outputFormat:"json", write:true})`
    (편집 모드 `--permission-mode acceptEdits`; `--dangerously-skip-permissions` 금지).
  - v0.19.3의 `!readOnly && (codex||claude)` throw는 **제거/완화**(이제 정식 구현).
- ClaudeCodeAdapter: write 시 `acceptEdits` 플래그(정확값 `claude --help` 확인). 읽기전용/기본
  `--print` 동작은 **그대로 보존**.

### dispatchConfig
- `write: boolean` 필드 추가. start에서 `--write`→config, `team-run-dispatch.json` 영속,
  approve에서 읽어 적용(기존 패턴 확장). readOnly = !write.

### 실행기 — TeamRunExecutor
- `executeFrom` 끝(전부 성공) 분기:
  - **write 모드**: `worktreeManager.diff(worktreePath)` → 아티팩트 `diff.patch` 기록 + `diffSummary`
    산출 → status **`awaiting-review`** + pending review approval(stepId "post-run-review") 저장 →
    outcome "awaiting-review". (자동 completed 금지.)
  - **읽기 전용/stub**: 종전대로 `completed`.
- 신규 `review(teamRunId, {decision:"accepted"|"rejected", note?})`:
  - post-run-review pending 검증 → accepted → status `completed`; rejected → status `cancelled`.
  - **파일 변경 없음**(어느 쪽도 worktree 그대로 보존, 자동 머지/푸시/revert 없음).
  - 이벤트 `teamRun.review.accepted`/`teamRun.review.rejected`.
- `resume`: `awaiting-review`면 review 대기 유지(디스패치 재개 안 함).
- 실패/reject 경로는 기존대로(잔여 skipped 등).

### CLI — project.ts
```
plan run start <pid> [--codex] [--claude] [--write] [--base] [--timeout-ms] [--json]
plan run review <teamRunId> (--accept | --reject) [--note] [--json]
plan run show <teamRunId>        # diffSummary + awaiting-review 안내(diff.patch 경로)
```
- `--write`는 provider 플래그와 함께만 의미(없으면 무시/경고). 기본 읽기 전용/stub.
- show: write run이 awaiting-review면 diffSummary + "검토: baton project plan run review <id>
  --accept|--reject" 안내.

## File-Level Plan
| File | Change |
|---|---|
| `packages/schemas/src/teamRun.schema.ts` | `awaiting-review` + `diffSummary?` |
| `packages/core/src/git/GitWorktreeManager.ts` | `diff()` (+ WorktreeManager 타입) |
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts` | write 프로파일(throw 완화) |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` | write 편집 모드 옵션(기본 보존) |
| `packages/core/src/teamRuns/dispatchConfig.ts` | `write` 필드 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | diff 캡처→awaiting-review, `review()` |
| `packages/cli/src/commands/project.ts` | `--write`, `plan run review`, diff 표시 |
| `packages/core/src/index.ts` | export |
| 각 `*.test.ts` | wiring/diff/review/CLI/회귀 |

## Data Model Changes
`TeamRunStatus += awaiting-review`, `TeamRun.diffSummary?`(선택), dispatchConfig `write`. team-run
봉투 자동 통과(읽기전용 run은 review/diffSummary 없음 → 회귀 0).

## API / CLI Changes
`plan run start --write`, 신규 `plan run review <id> --accept|--reject`. read API 종류 불변
(status에 awaiting-review 값 추가). 새 봉투 없음.

## Error Handling
- diff 캡처 실패 → 실행은 살리되 review 게이트는 걸고 diffSummary에 경고(또는 failed 처리 — 보수적).
- review 대상 아님(awaiting-review 아님)에 review → 명확한 오류.
- 쓰기 중 워커 실패 → 기존 골격(역할 failed, 잔여 skipped, teamRun failed) — diff는 부분 변경일 수
  있으므로 failed run도 diff 캡처해 보존(검사용).

## Security Considerations
- **worktree 격리 절대**(cwd=worktree, base≠main). main 직접 수정·**자동 머지/푸시/revert 없음**.
- **이중 사람 게이트**(pre-dispatch + post-run diff). opt-in 이중(`--write` + provider).
- claude `acceptEdits`만(‐‐dangerously‐skip‐permissions 금지). codex workspace-write(작업공간 한정).
- credential/auth 무접근, Baton 직접 HTTP 없음. reject 시 worktree 보존(자동 파괴로 작업 유실 방지).

## Test Plan
`test-plan.md`. mock runner/worktreeManager로: write wiring(codex workspace-write/claude
acceptEdits), diff 캡처→awaiting-review 전이, review accept→completed/reject→cancelled(보존),
읽기전용/stub은 review 없이 completed(회귀), CLI `--write`/`review`. 종단 실제 쓰기 수동 QA.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~14.

## Non-Goals
자동 머지/푸시/revert, 중간 게이트, 병렬/fix/재위임, Swift, worktree 자동 정리.

## Review Checklist
- [ ] write는 `--write`+provider 이중 opt-in일 때만. 기본 읽기전용/stub 회귀 0.
- [ ] codex workspace-write/claude acceptEdits, cwd=worktree, base≠main. 자동 머지/푸시/revert 없음.
- [ ] 실행 후 누적 diff 캡처(아티팩트+요약) → awaiting-review → review accept/reject. 읽기전용은 직행 완료.
- [ ] reject=cancelled+worktree 보존. 이중 게이트. credential/HTTP 없음. Swift 미변경.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 안전 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-write-mode
  -b baton/write-mode-v0.19.4 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(schemas/core/cli). **Swift 변경 금지.**
- **쓰기는 worktree 한정**: cwd=worktreePath, base≠main. **main 직접 수정·자동 머지·푸시·자동
  revert 금지.** 쓰기는 `--write`+provider **이중 opt-in**일 때만. 기본 읽기전용/stub 유지(회귀 0).
- **이중 사람 게이트**(pre-dispatch + post-run diff). claude는 `acceptEdits`까지(‐‐dangerously‐
  skip‐permissions 금지). credential/auth 무접근, Baton 직접 HTTP 금지.
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0. 종단 실제 쓰기는 수동 QA.
- 머지 후 worktree 즉시 제거. **commit/push 금지**.

### Goal
opt-in 쓰기 모드: `plan run start --codex/--claude --write` 시 worktree에서 실제 파일 수정
(codex workspace-write, claude acceptEdits). 실행 완료 후 **누적 diff 캡처 → `awaiting-review`**
게이트 → `plan run review --accept|--reject`. 자동 머지/푸시/revert 없음. 읽기전용/stub은 종전대로.

성공 기준: mock runner/worktreeManager로 (1) write wiring(codex workspace-write/claude
acceptEdits 인자), (2) 실행 후 diff 캡처→awaiting-review 전이, (3) review accept→completed/
reject→cancelled(worktree 보존), (4) 읽기전용/stub은 review 없이 completed(회귀 0), (5) CLI
`--write`/`review` + 기존 전체 테스트 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/write-mode-v0.19.4/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드: `teamRun.schema.ts`, `git/GitWorktreeManager.ts`(WorktreeManager),
   `teamRuns/AgentWorkerRegistry.ts`, `workers/claude/ClaudeCodeAdapter.ts`,
   `workers/codex/CodexExecAdapter.ts`(sandbox), `teamRuns/dispatchConfig.ts`,
   `teamRuns/TeamRunExecutor.ts`(executeFrom/decide/resume/approvals), `commands/project.ts`
   (plan run start/approve/reject/show + preflight + dispatchConfig).
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고. **claude write 플래그/codex workspace-write/diff 캡처 명령은
`claude --help`·`codex --help`·git으로 확인**, 불확실 시 보수적(안전) + 보고.

### Files to Create / Modify (전부 TS)
- `teamRun.schema.ts`: `TeamRunStatusSchema`에 `"awaiting-review"` 추가; `TeamRunSchema`에
  `diffSummary: z.string().optional()`.
- `git/GitWorktreeManager.ts`: `WorktreeManager`에 `diff(worktreePath): Promise<ProcessRunResult>`
  + 구현(미커밋 변경 전부 캡처: 예) `git -C <wt> add -A` 후 `git -C <wt> --no-pager diff --cached`
  및 `--stat` 요약; 정확 명령 확정).
- `teamRuns/dispatchConfig.ts`: `write: boolean` 필드(+ read/write/validate 반영).
- `teamRuns/AgentWorkerRegistry.ts`: readOnly=false(write) 경로 구현 — codex
  `sandbox:"workspace-write"`, claude `{readOnly:false, outputFormat:"json", write:true}`.
  v0.19.3의 write throw 제거/완화. 기본/읽기전용은 그대로.
- `workers/claude/ClaudeCodeAdapter.ts`: write 편집 모드 옵션(예: `--permission-mode acceptEdits`,
  정확값 확인). 읽기전용(plan)/기본(`--print`) 동작 보존.
- `teamRuns/TeamRunExecutor.ts`: executeFrom 완료 분기 — write면 diff 캡처(아티팩트 `diff.patch`
  + diffSummary) → `awaiting-review` + pending review approval(stepId "post-run-review"); 아니면
  completed. 신규 `review(teamRunId,{decision,note?})`(accepted→completed/rejected→cancelled,
  파일 변경 없음, 이벤트). resume에서 awaiting-review 게이트 유지. `core/src/index.ts` export.
- `commands/project.ts`: `plan run start --write`; 신규 `plan run review <id> --accept|--reject
  [--note] [--json]`; show에 diffSummary + 검토 안내. preflight/dispatchConfig 확장.
- 테스트: wiring/diff/review 상태머신/CLI/회귀.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용). Swift(`apps/macos/**`) 금지.
- `cli/registry.ts`의 기존 Run 워커/동작 변경 금지. claude 기본 `--print`/읽기전용 plan 동작 보존.
- 자동 머지/push/revert, worktree 자동 정리, 병렬/fix/재위임 금지. credential/HTTP 금지.

### Step-by-Step Plan
1. 설계/태스크 + 기존 코드 읽기. `claude/codex --help`로 write 플래그 확인.
2. `teamRun.schema.ts` awaiting-review + diffSummary + 봉투 테스트.
3. `GitWorktreeManager.diff` + 테스트(mock runner: 명령/인자).
4. dispatchConfig `write` + ClaudeCodeAdapter write 옵션 + AgentWorkerRegistry write 프로파일 + 테스트.
5. TeamRunExecutor: diff 캡처→awaiting-review, `review()` + resume 처리 + 테스트(전이/보존/회귀).
6. CLI `--write` + `plan run review` + show diff + preflight/dispatchConfig + 테스트.
7. 전체 게이트 + 자체 diff 리뷰 + 최종 요약(이중 게이트·worktree 격리·자동 머지/푸시/revert 없음·수동 QA).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
종단 실제 쓰기는 수동 QA(실 CLI·인증). 명령 미실행/실패·불확실 플래그는 정직히 보고.

### Acceptance Criteria
`.baton/runs/write-mode-v0.19.4/acceptance-criteria.md` AC-01~14. 특히: write 이중 opt-in
(AC-01/02), workspace-write/acceptEdits(AC-03/04), diff 캡처→awaiting-review(AC-06/07), review
accept/reject+보존(AC-08/09), 읽기전용 직행·회귀 0(AC-10/14), 자동 머지/푸시/revert 없음(AC-11/12).

### Constraints
- 쓰기 worktree 한정·base≠main·자동 머지/푸시/revert 없음. 이중 게이트. 이중 opt-in.
- 기존 읽기전용/stub/기존 Run/claude 기본 동작 보존(회귀 0). credential/HTTP 없음.
- base=`origin/main`. commit/push 금지. UI/CLI 한국어, 식별자/플래그 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing / 수동 QA만(실 CLI 쓰기 종단))
## Write Flow (start --write → approve → 실행 → diff 캡처 → awaiting-review → review accept/reject)
## Safety (worktree 격리·base≠main·이중 게이트·이중 opt-in·자동 머지/푸시/revert 없음·credential 무접근)
## Manual QA (실 CLI로 worktree 파일 수정·diff·accept/reject 확인 절차)
## Risks / TODOs (Swift 모니터 다음, 자동 정리/병렬 후속, write 플래그 확정 내역)
## Notes for Reviewer (이중 opt-in로 기존 보존, mock runner, awaiting-review 상태머신)
```
명령 미실행/테스트 실패, 불확실 플래그는 정직히 보고.
