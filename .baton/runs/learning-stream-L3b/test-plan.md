# Test Plan — learning-stream-L3b

게이트: 루트 **pnpm typecheck/test/build**(회귀 0). 단위는 주입 mock runner. 터미널 육안(stub).

## Unit — ProcessRunner
- onStdout/onStderr가 청크마다 호출. 미지정 시 현행 결과 동일. 콜백 예외 삼킴(실행 계속).

## Unit — Workers (mock runner)
- codex/claude: ProcessRunner.run에 onStdout=input.onOutput 전달. 기존 결과/usage 보존.
- StubWorker: onOutput 있으면 합성 청크, 없으면 현행.

## Unit — TeamRunExecutor (mock + stub)
- eventSink가 teamRun.role.started → role.output(청크) → role.completed … 순서 방출.
- continueCheckpoint 재개 시에도 eventSink로 출력 방출.
- eventSink 미설정 시 무영향. events.jsonl 유지.

## Unit/Integration — CLI
- start/approve/continue --stream: event 봉투 시퀀스(role.output 포함) 후 최종 team-run 봉투.
- --stream 없음: 단일 team-run 봉투(회귀).
- 기존 run/watch/project 테스트 회귀 0.

## Regression / Safety
- 기존 watch/Run/teamRuns 불변. 안전 게이트/체크포인트/격리/credential 정책 불변. Swift 미변경.

## Manual (터미널)
- baton project plan run approve <teamRunId> --stream → NDJSON 진행 라이브 육안(stub 무토큰).

## Out of Scope
- Swift 터미널 페인 + 출력영역 재정리(L3c), claude stream-json usage, watch/Run 변경.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
