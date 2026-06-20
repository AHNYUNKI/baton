# Analysis

## User Request
실행 중 워커 출력을 실시간으로(터미널 느낌) 흘리는 채널(코어+CLI). 앱 표시는 L3c.

## Current Repository Understanding
- `ports/ProcessRunner.ts` `createNodeProcessRunner`: `child.stdout.on("data", c=>stdout+=c)` /
  `stderr` 동일 → **끝에 한 번** 반환. `ProcessRunOptions{cwd,env,input,timeoutMs}` 콜백 없음.
- `workers/WorkerAdapter.ts` `WorkerRunInput{cwd,prompt,timeoutMs?,metadata?}` — onOutput 없음.
  codex/claude/stub가 ProcessRunner.run 사용.
- `teamRuns/TeamRunExecutor.ts`: `invokeWorker`→`WorkerInvocation{prompt,result}`(라인 ~408–448),
  executeFrom에서 role.started/completed/explanation/usage/summary 저장 + EventLogger events.jsonl.
- `commands/project.ts`: `createTeamRunExecutor`(executor+eventSink 주입 지점), start/approve/
  continue가 executor 실행 후 `printTeamRunResult`(단일 봉투). `makeEnvelope("event", …)` 패턴
  (watch). continue(L2)도 executeFrom 재개 → 출력 발생.
- `baton watch`: 폴링+옛 Run 전용 → 워커 출력 스트리밍 부적합.

## Relevant Files
| File | Reason |
|---|---|
| `ports/ProcessRunner.ts` | `onStdout`/`onStderr` 콜백 |
| `workers/WorkerAdapter.ts` | `WorkerRunInput.onOutput?` |
| `workers/StubWorker.ts`, `codex/CodexExecAdapter.ts`, `claude/ClaudeCodeAdapter.ts` | 청크 전달 |
| `teamRuns/TeamRunExecutor.ts` | `eventSink`로 role.started/output/completed 방출 |
| `schemas/readApi.schema.ts` | 스트림 이벤트 타입 |
| `cli/commands/project.ts` | `start/approve/continue --stream` NDJSON |
| 각 `*.test.ts` | 콜백/전달/sink/CLI |

## Existing Behavior
실행이 끝나야 결과를 봄. 진행 중 출력 안 보임.

## Target Behavior
`plan run start/approve/continue --stream`: 실행하며 NDJSON `event` 봉투(`teamRun.role.started`,
**`teamRun.role.output`(청크)**, `teamRun.role.completed`, `teamRun.*`)를 라이브 방출, 마지막에
최종 `team-run` 봉투. `--stream` 없으면 현행(단일 봉투). stub 합성 청크로 무토큰 검증.

## Constraints
- `--stream` opt-in, 미지정 시 현행(회귀 0). 기존 watch/Run/안전 정책 불변. TS 단독, Swift는 L3c.
- 콜백/eventSink 순수 인터페이스, 주입형 mock 테스트. 콜백 예외가 실행을 막지 않음.

## Assumptions
- 워커 stdout 청크를 그대로 전달(텍스트). claude `--output-format json`(usage)과 라이브 텍스트
  상충 가능 → 이번엔 stub/codex 텍스트 청크로 채널 검증, claude usage 기존 유지(stream-json 정밀은
  후속). 상충 시 보고.
- 이벤트는 기존 `event` 봉투(`makeEnvelope("event", …)`) + 마지막 team-run 봉투.

## Open Questions
없음. claude 라이브 vs json-usage는 후속 정밀화.

## Risks
- 출력 폭증 → 코어는 청크 전달만, 버퍼 상한은 L3c(앱). 콜백 예외 → 삼킴. claude usage 상충 → 후속.

## Recommendation
ProcessRunner 콜백 + 워커 onOutput + executor eventSink + CLI start/approve/continue --stream.
opt-in·현행 보존. stub 무토큰·터미널 검증. 게이트 pnpm typecheck/test/build 회귀 0.
