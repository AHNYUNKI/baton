# Test Plan — token-usage-v0.19.2

게이트: 루트 **pnpm typecheck/test/build**(신규 포함·회귀 0). stub·headless. 포트 주입 mock.

## Unit — usage.ts (순수)
- estimateTokens: 빈 문자열 → 0, 길이 비례 증가(경계값).
- readOrEstimateUsage:
  - metadata.usage{inputTokens,outputTokens} 유효 → 그 값 + estimated:false.
  - metadata.usage 없음 → prompt/stdout 추정 + estimated:true.
  - metadata.usage 불량(음수/문자열/누락) → 추정 폴백 + estimated:true.
- aggregateTeamRunUsage:
  - 여러 role(codex/claude 혼합) → 플랫폼별 합산 정확 + 총합.
  - usage 없는 role 제외.
  - 추정 섞임 → anyEstimated:true; 전부 실측 → false.

## Unit — teamRun.schema
- usage 부재/존재 수용. 음수/비정수 거부. team-run 봉투 round-trip(회귀 0).

## Unit — TeamRunExecutor (mock ProcessRunner/Clock/worktreeManager)
- 역할 완료 후 teamRun.roles[].usage 설정(stub → estimated:true, 추정값).
- teamRun.role.completed 이벤트 payload에 usage 요약.
- resume: 일부 완료 저장 → resume → 완료 role의 usage 보존.
- 역할당 worker 호출 1회.

## Integration — CLI (pnpm test)
- plan run start→approve→show: show 텍스트에 플랫폼별 사용량 표 + 추정 주석.
- usage 있는 team-run → 수치 출력. usage 없는 경우 → 0/생략 graceful.
- --json show → role.usage 포함.

## Regression / Safety
- 기존 teamRuns(order/registry/store/executor/relay) + Run/project/CLI 테스트 회귀 0.
- StubWorker 기본 유지. 구독 잔량/credential/HTTP 접근 없음. Swift 미변경.

## Out of Scope (테스트 비대상)
- 실제 codex/claude usage 파싱, 구독 잔량, 예산 게이트, USD 환산, Swift 표시.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
