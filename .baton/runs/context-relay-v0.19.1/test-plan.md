# Test Plan — context-relay-v0.19.1

게이트: 루트 **pnpm typecheck/test/build**(신규 포함·회귀 0). stub·headless. 포트 주입 mock.

## Unit — summarizeResult (순수)
- 짧은 stdout → 그대로.
- 긴 stdout → maxChars 절단 + 절단 표시.
- 빈/공백 출력 → 상태 문구.
- 실패 결과 → stderr 기반 요약.

## Unit — collectUpstream (순수)
- 보고 없음(root) → 빈 배열.
- 2단계(부모) → [부모].
- 3단계(조부모→부모) → [조부모, 부모] (root 먼저).
- 미존재 부모 → 거기서 중단.
- 사이클(a→b→a) → 방어(무한루프 없음).

## Unit — buildRolePrompt
- upstream 있음 → "Upstream Context" 섹션에 상위 이름/roleId/담당AI/상태 + 요약 + 산출물 경로.
- upstream 없음 → 섹션 생략(또는 '이전 단계 없음').
- 산출물은 경로 문자열만(내용 미첨부) — 프롬프트에 파일 본문 없음.

## Unit — teamRun.schema
- summary 부재/존재 모두 수용. team-run 봉투 round-trip(회귀 0).

## Unit — TeamRunExecutor (mock ProcessRunner/Clock/worktreeManager)
- 자식 역할 invoke 시 전달된 prompt에 **부모 summary 포함**(stub 기록 캡처).
- 보고 관계 없는 형제의 컨텍스트는 **미포함**.
- 역할 성공 완료 후 teamRun.roles[해당].summary 설정(절단됨).
- resume: 일부 완료 상태로 저장 → resume → 이후 역할 prompt에 영속 summary 릴레이.
- teamRun.role.started 이벤트에 upstreamRoleIds.
- 역할당 worker 호출 정확히 1회(상시 루프 없음).

## Regression / Safety
- 기존 teamRuns(order/registry/store/executor) + Run/project/CLI 테스트 회귀 0.
- StubWorker 기본 유지(실제 외부 호출 없음). Swift 미변경. credential/HTTP 없음.

## Out of Scope (테스트 비대상)
- 실제 codex/claude 디스패치, Swift, dependsOn/형제·전역 누적 릴레이, 병렬, 양방향 대화.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
