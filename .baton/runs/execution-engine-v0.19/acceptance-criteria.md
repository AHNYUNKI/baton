# Acceptance Criteria — execution-engine-v0.19

v0.19(오케스트레이션 골격: 코어+CLI, headless, StubWorker)가 완료되려면 아래가 모두 충족.

## Schema & read API (pnpm test)
- [ ] AC-01 `teamRun.schema.ts`에 `TeamRun`/`TeamRunRole` + 상태 enum 정의(설계대로).
  `ApprovalSchema` 재사용.
- [ ] AC-02 잘못된 TeamRun(필수 누락/잘못된 상태)은 거부, 정상은 수용(단위 테스트).
- [ ] AC-12 read API `team-run`/`team-run-list` 봉투(schemaVersion 1) round-trip. `TeamRunStore`
  원자 save/load/list. 기존 종류 불변.

## Execution order (pnpm test)
- [ ] AC-03 `computeExecutionOrder(teamPlan)`가 reportsTo 위상 순서(대표 직속 root tier 먼저,
  자식 BFS, 형제는 plan 순서)를 반환(순수).
- [ ] AC-04 방어 케이스: 평면(reportsTo 없음)→plan 순서, 사이클/미존재 부모→root 취급, 미방문
  잔여 말미 append. 무한루프 없음. 단위 테스트.

## Worker resolution & prompt (pnpm test)
- [ ] AC-05 `AgentWorkerRegistry.resolve(assignedAgentId)` — 등록 어댑터 반환, 미등록 →
  StubWorker fallback. `createAgentWorkerRegistry` 기본 둘 다 StubWorker.
- [ ] AC-14 기본 워커가 **StubWorker**라 실제 파일 변경/외부 CLI 호출이 없다(골격). 실제
  codex/claude는 opt-in 자리만(기본 비활성). `buildRolePrompt`에 role.instructions 포함.

## Executor state machine (pnpm test)
- [ ] AC-06 `start(projectId)`가 worktree를 만들고 status `awaiting-approval` + pending
  Approval로 TeamRun을 저장한다.
- [ ] AC-07 **승인 전 어떤 역할도 디스패치되지 않는다**(start 후 roles 전부 `planned`).
- [ ] AC-08 `decide(approved)` 후 order 순서대로 역할이 `running`→`completed` 되고, 전부 성공
  시 TeamRun `completed`. 역할별 startedAt/completedAt/이벤트 기록.
- [ ] AC-09 역할 실패 시 즉시 정지: 해당 역할 `failed`, 잔여 역할 `skipped`, TeamRun `failed`
  (골격: fix 루프 없음).
- [ ] AC-10 `decide(rejected)`는 planned 역할 전부 `skipped`, TeamRun `cancelled`.
- [ ] AC-11 `resume(teamRunId)`가 첫 비종료 역할부터 재개(중단 복구). 종료 상태는 그대로.
- [ ] AC-13 모든 디스패치는 `worktreePath`(cwd)에서만 — **메인 브랜치 직접 변경 없음**. base ≠
  main 보장. 이벤트는 `events.jsonl`(EventLogger).

## CLI (pnpm test)
- [ ] AC-15 `baton project plan run start|approve|reject|show|list`가 동작하고 각각 team-run/
  team-run-list 봉투(또는 명확한 텍스트)를 출력. teamPlan 없음 → 친절한 비영 오류. 기본 stub.
- [ ] AC-16 기존 `Run` 파이프라인/CLI 명령/테스트 **회귀 0**. 루트 `pnpm typecheck/test/build`
  통과(신규 포함). credential/HTTP/Swift 변경 없음.
