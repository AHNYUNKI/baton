# Implementation Design — learning-checkpoint-L2

## Summary

학습 체크포인트를 추가한다. `checkpoint=true`로 지정된 역할이 **성공 완료**하면 다음으로 가기 전
실행을 멈추고(`awaiting-checkpoint` + pending approval `checkpoint:<roleId>`), 사람이 그 역할의
설명(L1)/출력을 검토한 뒤 `plan run continue`(진행) 또는 `--reject`(중단)한다. 여러 체크포인트는
각각 멈춘다. 기존 pre-dispatch/post-run 게이트와 합성되고, resume 패턴을 재사용한다. TS 단독,
stub로 헤드리스 검증. **Swift 체크포인트 UI는 L3**(그 전엔 CLI). 회귀 0.

## Scope

### In Scope
- `TeamRole.checkpoint?`(선택) + `TeamRunStatus += awaiting-checkpoint`.
- 플래너 buildPlanPrompt: 설계/계획 성격 역할을 `checkpoint:true`로 표시(편집 가능, 기본 false).
- 실행기: 체크포인트 역할 성공 완료 시 멈춤 + `continueCheckpoint(continue/reject)` + resume 게이트 유지.
- CLI `plan run continue <id> [--reject] [--note] [--json]` + `show`에 체크포인트 역할 설명 표시.
- 테스트(stub): 멈춤/continue/reject/다중 체크포인트/재멈춤 방지.

### Out of Scope
- Swift 체크포인트 UI(L3). "질문(AI에 되묻기)/수정(편집)"(L2.1 후속). 스트리밍(L3).

## Proposed Architecture
```
schema: TeamRole.checkpoint?: boolean ; TeamRunStatus += "awaiting-checkpoint"
        approval stepId: `checkpoint:<roleId>`

executeFrom 루프(역할 성공 완료 직후, 다음 진행 전):
  if planRole.checkpoint === true && checkpointApproval(roleId) !== "approved":
     teamRun = awaiting-checkpoint + pending approval(`checkpoint:<roleId>`)
     event teamRun.checkpoint.awaiting{roleId}
     return { outcome: "awaiting-checkpoint" }
  // 아니면 계속

continueCheckpoint(teamRunId, {decision:"continue"|"reject", note?}):
  현재 pending checkpoint approval 검증(status awaiting-checkpoint)
  continue → 그 approval approved + resume(executeFrom 재진입)
  reject → skipRolesAfter(현재 체크포인트 역할) + cancelled + event

resume(): awaiting-checkpoint → 게이트 유지(현행 awaiting-review/approval과 동일)
```
- 완료(terminal) 체크포인트 역할은 resume 재진입 시 루프 skip → **재멈춤 없음**. 다음 미승인
  체크포인트에서만 멈춤. pre-dispatch→(역할들/중간 체크포인트들)→(쓰기면)post-run diff 검토 순으로 합성.

## File-Level Plan
| File | Change |
|---|---|
| `schemas/teamPlan.schema.ts` | `TeamRole.checkpoint?` |
| `schemas/teamRun.schema.ts` | `awaiting-checkpoint` 상태 |
| `core/projects/planner.ts` | buildPlanPrompt 체크포인트 표시 지시 |
| `core/teamRuns/TeamRunExecutor.ts` | 멈춤 주입 + `continueCheckpoint` + resume |
| `core/src/index.ts` | export(필요 시) |
| `cli/commands/project.ts` | `plan run continue` + show 설명/안내 |
| 각 `*.test.ts` | 스키마/플래너/실행기/CLI |

## Data Model Changes
`TeamRole.checkpoint?: boolean`(선택), `TeamRunStatus`에 `awaiting-checkpoint` 추가. 봉투 자동 통과.
기존 plan(checkpoint 없음)은 멈춤 없이 현행(회귀 0).

## API / CLI Changes
`plan run continue <id> [--reject]` 추가. `show`에 체크포인트 시 설명/안내. read API 종류 불변
(status 값 추가).

## Error Handling
- continue 대상 아님(awaiting-checkpoint 아님/ pending 없음) → 명확한 오류.
- 체크포인트 역할 실패 → 멈춤 없이 기존 정지(failed). reject → cancelled + 잔여 skipped.
- checkpoint 미지정 plan → 멈춤 없음(현행).

## Security / Safety
멈춤은 더 많은 사람 통제(안전 강화). 승인 게이트·worktree·읽기전용·credential 불변. continue 전
다음 역할 디스패치 없음.

## Test Plan
`test-plan.md`. stub: 체크포인트 역할 완료 → awaiting-checkpoint, continue → 진행/완료, reject →
cancelled, 다중 체크포인트 각 멈춤, continue 후 재멈춤 없음, checkpoint 없는 plan → 현행(회귀).
schema/planner 단위. CLI continue/show.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~10.

## Non-Goals
Swift UI(L3), 질문/수정(L2.1), 스트리밍.

## Review Checklist
- [ ] checkpoint 역할 성공 완료 시 awaiting-checkpoint 멈춤. continue→진행/reject→cancelled.
- [ ] 다중 체크포인트 각 멈춤, continue 후 재멈춤 없음. checkpoint 없는 plan 회귀 0.
- [ ] pre-dispatch/post-run 게이트와 합성. CLI continue + show 설명. 안전 정책 불변. Swift 미변경.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-checkpoint
  -b baton/learning-checkpoint-L2 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(schemas/core/cli). **Swift 변경 금지**(L3). 게이트: 루트
  `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
`checkpoint=true` 역할이 성공 완료하면 실행을 멈추고(`awaiting-checkpoint` + pending approval
`checkpoint:<roleId>`), 사람이 검토 후 `plan run continue`(진행)/`--reject`(중단). resume 패턴 재사용,
기존 pre-dispatch/post-run 게이트와 합성. stub로 헤드리스 검증.

성공 기준: stub로 (1) 체크포인트 완료→awaiting-checkpoint 멈춤, (2) continue→다음 진행/완료,
(3) reject→cancelled+잔여 skipped, (4) 다중 체크포인트 각 멈춤+continue 후 재멈춤 없음,
(5) checkpoint 없는 plan은 현행(회귀 0), (6) 전체 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/learning-checkpoint-L2/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 코드: `teamRuns/TeamRunExecutor.ts`(executeFrom 루프/`review`/`resume`/`upsertApproval`/
   `skipRolesAfter`/`postRunReviewApproval` 패턴), `teamRun.schema.ts`, `teamPlan.schema.ts`,
   `projects/planner.ts`(buildPlanPrompt), `commands/project.ts`(plan run continue 추가 지점/
   printTeamRunResult/역할 explanation 표시).
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- `schemas/teamPlan.schema.ts`: `TeamRoleSchema`에 `checkpoint: z.boolean().optional()`.
- `schemas/teamRun.schema.ts`: `TeamRunStatusSchema`에 `"awaiting-checkpoint"`.
- `projects/planner.ts`: buildPlanPrompt에 "설계·계획 등 사람이 검토할 역할은 `checkpoint: true`로
  표시(나머지 생략/false)" 지시 + JSON 예시에 checkpoint 필드.
- `teamRuns/TeamRunExecutor.ts`:
  - 상수 `checkpointStepId(roleId) = \`checkpoint:${roleId}\``. `checkpointApproval(teamRun, roleId)` 헬퍼.
  - executeFrom: 역할 **성공 완료** 처리 직후(다음 iteration 전), `planRole.checkpoint === true` &&
    checkpoint approval !== "approved"이면 → `awaiting-checkpoint` + pending approval 저장 +
    event `teamRun.checkpoint.awaiting`{roleId} → `return {outcome:"awaiting-checkpoint"}`.
  - `continueCheckpoint(teamRunId, {decision:"continue"|"reject", note?})`: status awaiting-checkpoint
    + pending checkpoint approval 검증 → continue: approval approved + `executeFrom`(resume); reject:
    `skipRolesAfter` + cancelled + event `teamRun.checkpoint.rejected`.
  - `resume`: `awaiting-checkpoint` → 게이트 유지(현행 awaiting-review와 동일 분기 추가).
  - 실패 역할은 멈춤 없음(기존 정지). 완료 체크포인트는 resume 시 terminal skip(재멈춤 없음).
  - `TeamRunExecutionOutcome`에 `awaiting-checkpoint` 추가.
- `commands/project.ts`: `plan run continue <teamRunId> [--reject] [--note] [--json]` → continueCheckpoint.
  `show`: status awaiting-checkpoint면 현재 체크포인트 역할의 explanation/출력 + "계속: baton project
  plan run continue <id>" 안내.
- 테스트: schema(checkpoint/상태), planner(지시 포함), executor(멈춤/continue/reject/다중/재멈춤
  방지/회귀), CLI(continue/show).

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **Swift(`apps/macos/**`) 금지.** 기존 Run/게이트 동작
  변경 금지(회귀 0). 안전 정책 불변.

### Step-by-Step Plan
1. 설계 + executeFrom/review/resume/planner 읽기.
2. schema checkpoint + awaiting-checkpoint + 테스트.
3. planner 체크포인트 표시 지시 + 테스트.
4. executor 멈춤 주입 + continueCheckpoint + resume 분기 + 테스트(stub: 멈춤/continue/reject/다중/재멈춤 방지/회귀).
5. CLI continue + show 설명 + 테스트.
6. 게이트 + 자체 리뷰 + 요약.

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
# 헤드리스: checkpoint:true 역할 plan → start→approve→(멈춤)→show→continue→완료(stub, 무토큰)
```

### Acceptance Criteria
`.baton/runs/learning-checkpoint-L2/acceptance-criteria.md` AC-01~10.

### Constraints
- 체크포인트는 성공 완료 시에만 멈춤. continue 전 다음 디스패치 없음. 게이트 합성·resume 재사용.
- `checkpoint?`/`awaiting-checkpoint` 추가(회귀 0). 안전 정책 불변. base=`origin/main`. commit/push 금지.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Checkpoint Flow (checkpoint 역할 완료→awaiting-checkpoint→show 설명→continue/reject; 다중; 재멈춤 없음; 게이트 합성)
## Safety (성공 시에만 멈춤, continue 전 무디스패치, 안전 정책 불변, 회귀 0)
## Risks / TODOs (Swift UI L3, 질문/수정 L2.1)
## Notes for Reviewer (게이트 패턴 재사용, resume 합성, checkpoint 없는 plan 현행)
```
명령 미실행/테스트 실패는 정직히 보고.
