# Test Plan — execution-engine-v0.19

게이트: 루트 **pnpm typecheck/test/build**(신규 포함·회귀 0). 네트워크 없음. 외부 CLI 없음
(StubWorker). 포트(ProcessRunner/Clock/worktreeManager)는 주입형 mock.

## Unit — schema (pnpm test)
- teamRun.schema: 정상 수용 / 필수 누락·잘못된 상태 거부 / 선택 필드 round-trip.
- readApi: team-run, team-run-list 봉투(schemaVersion 1) round-trip.

## Unit — order.ts (순수)
- 단일 역할 / 다단계(대표 직속→자식) / 형제 plan 순서.
- 평면(reportsTo 없음) → plan 순서.
- 사이클·미존재 부모 → root 취급(무한루프 없음).
- 미방문 잔여 말미 append.

## Unit — AgentWorkerRegistry / buildRolePrompt
- resolve: 등록 어댑터 / 미등록 → StubWorker fallback. createAgentWorkerRegistry 기본 stub.
- buildRolePrompt: role.instructions·overview·산출물 경로 포함.

## Unit — TeamRunStore
- save→load 왕복 동등. 원자성(부분 쓰기 흔적 없음). list(projectId) 필터.

## Unit — TeamRunExecutor (mock ProcessRunner/Clock/worktreeManager)
- start → status awaiting-approval, roles 전부 planned, pending Approval, worktree 생성 호출.
- start 후 **디스패치 0**(승인 전 무실행) 확인.
- decide(approved) → order 순서대로 running→completed, 전부 성공 시 completed. 이벤트/타임스탬프.
- 역할 실패(stub 실패 주입) → 해당 failed, 잔여 skipped, teamRun failed.
- decide(rejected) → planned 전부 skipped, cancelled.
- resume → 첫 비종료부터 재개, 종료 상태 보존.
- worktree 격리: adapter.run의 cwd === worktreePath(메인 아님). base ≠ main.
- worktree 생성 실패(mock) → failed + reason.

## Unit/Integration — CLI (pnpm test)
- plan run start <projectId> → awaiting-approval team-run 봉투.
- plan run approve <teamRunId> → 순차 완료(stub) → completed.
- plan run reject → cancelled.
- plan run show / list → 봉투 출력.
- teamPlan 없음 → 친절한 비영 오류.
- 기존 run/project 명령 테스트 회귀 0.

## Regression / Safety
- 기존 `Run`/`RunExecutor`/`RunStore`/CLI 테스트 그대로 통과.
- credential/HTTP/네트워크/외부 CLI 호출 없음(StubWorker). Swift 미변경.

## Out of Scope (테스트 비대상)
- Swift UI/라이브 점등(v0.19.1), 실제 codex/claude 디스패치, 병렬/역할별 게이트/fix 루프.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
