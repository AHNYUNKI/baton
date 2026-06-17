# Review — execution-engine-v0.19

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-execution-engine`
(branch `baton/execution-engine-v0.19`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 범위 격리 | ✅ TS 전용. Swift/기존 `RunExecutor`/`RunStore`/`RunService` **무변경**(grep 확인) |
| 게이트 | ✅ `pnpm typecheck` / `test` **250 passed**(+27) / `build` 직접 재실행 통과 |
| 기존 Run 회귀 | ✅ TeamRun 별도 신설, 회귀 0 |
| 안전 | ✅ pre-dispatch 게이트·worktree cwd·base≠main·StubWorker 기본 |

## Independent Verification (직접 재실행/정독)
- diff: 신규 `teamRuns/`(order/AgentWorkerRegistry/buildRolePrompt/TeamRunStore/TeamRunExecutor)
  + `teamRun.schema.ts` + readApi 봉투(team-run/team-run-list) + CLI `plan run` + 테스트. 7
  수정 + 신규(untracked). Swift/기존 Run 변경 없음.
- **order.ts**: roots→BFS, childrenByParent, visited, 사이클 방어(`hasCyclicAncestry` 부모체인
  재방문), 미방문 잔여 말미 append. 순수.
- **TeamRunExecutor**:
  - `start` → worktree 생성 → status `awaiting-approval` + pending Approval. **승인 전 워커
    호출 없음**(invokeWorker는 executeFrom에서만, executeFrom은 decide(approved)/resume(approved)
    에서만). roles 전부 planned.
  - `decide(approved)` → running → order 순차 running→completed → 전부 성공 시 completed.
    `decide(rejected)` → planned skipped + cancelled.
  - 역할 실패 → 해당 failed + `skipRolesAfter` 잔여 skipped + teamRun failed.
  - `resume` → 승인됨이면 첫 비종료부터, 미승인이면 awaiting 유지.
  - **worktree cwd**: invokeWorker `cwd = requiredWorktreePath`. **base≠main**:
    `validateBaseBranch`가 "main" 거부 + 기본 "origin/main"(설계보다 강한 안전, origin/main
    규칙 부합). 이벤트 `teamRun.*`(EventLogger). `TeamRunSchema.parse`로 생성 검증.
- **AgentWorkerRegistry**: 기본 StubWorker fallback, `createAgentWorkerRegistry()` 기본
  codex/claude 모두 stub. CLI `createTeamRunExecutor`가 인자 없이 호출 → 기본 stub.
- **CLI**: `plan run start/approve/reject/show/list` 5종 + 도움말. base 기본 origin/main.
- 테스트: 실행기 8케이스(무디스패치/순차/reject/실패정지/resume/gated resume/worktree 실패/
  main 거부), CLI 3케이스(전 루프 stub/reject 전 디스패치/teamPlan 없음 오류).

## Acceptance Criteria
AC-01~16 충족. (조직도 라이브 점등·Swift는 v0.19.1 후속 — 설계대로 범위 밖.)

## Deviations / Notes
- base 기본을 `origin/main`으로 두고 `main`을 명시적으로 거부 — 설계 의도("base≠main") 강화,
  프로젝트 메모리 규칙과 일치. 승인.
- `.baton/runs/execution-engine-v0.19/*` 산출물은 worktree(origin/main 분기)에 없어 Codex는
  원본 경로 읽기 전용 참조 — 정상.

## Follow-ups
- **v0.19.1**: Swift 실행 모니터 + 조직도 라이브 점등(`buildOrgChart(statusByRole:)`) + 승인/거부 UI.
- v0.19.x: 실제 codex/claude 디스패치(강화 승인), 병렬 형제, 역할별 게이트, fix 루프.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/Swift 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 있으므로 머지 후 main에서 dist 재빌드.
