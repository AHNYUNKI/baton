# Implementation Design — learning-stream-L3b

## Summary

실행 명령이 워커 출력을 **실시간 NDJSON**으로 흘리는 스트리밍 채널을 만든다.
`ProcessRunner` onStdout/onStderr 콜백 → 워커 `onOutput` → `TeamRunExecutor` eventSink →
`plan run start/approve/continue --stream`이 `teamRun.role.started/output/completed` 이벤트를
라이브 방출하고 마지막에 최종 `team-run` 봉투를 출력한다. `--stream` 미지정 시 현행(단일 봉투)
유지(회귀 0). **TS 단독** — 터미널에서 `--stream`으로 실행하면 진행이 눈에 보인다. 앱 표시·출력
영역 재정리는 **L3c**.

## Scope

### In Scope
- `ProcessRunOptions.onStdout?(chunk)`/`onStderr?(chunk)` (기존 data 훅 노출, opt-in).
- `WorkerRunInput.onOutput?(chunk)`; 워커(stub/codex/claude)가 청크 라이브 전달. stub 합성 청크.
- `TeamRunExecutor` `eventSink?`: role.started/output/completed/teamRun.* 방출.
- CLI `plan run start/approve/continue --stream`: NDJSON 이벤트 라이브 + 최종 team-run 봉투.
- readApi 스트림 이벤트 타입(`teamRun.role.output` 등).
- 테스트(mock runner) + 터미널 육안.

### Out of Scope
- Swift 앱 터미널 페인 + **역할 출력 영역 재정리(summary/stub 노이즈+라이브+설명 배치)** → L3c.
- claude stream-json 정밀 usage. 기존 watch/Run 변경.

## Proposed Architecture
```
ProcessRunner.run(cmd,args,{… , onStdout?, onStderr?})
  child.stdout.on("data", c => { stdout += c; try{onStdout?.(c)}catch{} })   // 누적 + 라이브
WorkerAdapter.run({… , onOutput?})
  codex/claude: ProcessRunner.run({… , onStdout: onOutput, onStderr: onOutput})
  StubWorker: onOutput?.("합성 진행 청크…") 몇 줄 후 결과
TeamRunExecutor({… , eventSink?: (event) => void})
  invokeWorker에 onOutput = (chunk) => eventSink?.({type:"teamRun.role.output", roleId, chunk})
  role.started/completed/teamRun.* 도 eventSink(+ 기존 events.jsonl 유지)
CLI start/approve/continue --stream:
  createTeamRunExecutor에 eventSink=(e)=>context.stdout(JSON.stringify(makeEnvelope("event", e)))
  실행 후 마지막에 team-run 봉투 1줄. --stream 없으면 eventSink 미설정 → 현행 printTeamRunResult.
```
- 라이브 채널 = 실행 명령 stdout NDJSON(watch 폴링 무관). 앱은 `runner.stream`으로 소비(L3c).
- **continue도 executeFrom 재개 → --stream 포함**(L2 체크포인트 이후 출력도 라이브).

## File-Level Plan
| File | Change |
|---|---|
| `ports/ProcessRunner.ts` | `onStdout?`/`onStderr?` + data 훅 호출(예외 삼킴) |
| `workers/WorkerAdapter.ts` | `WorkerRunInput.onOutput?` |
| `workers/StubWorker.ts` | 합성 청크 onOutput |
| `workers/codex/CodexExecAdapter.ts`,`claude/ClaudeCodeAdapter.ts` | onStdout→onOutput 전달 |
| `teamRuns/TeamRunExecutor.ts` | `eventSink?` + role.started/output/completed 방출 |
| `schemas/readApi.schema.ts` | 스트림 이벤트(`teamRun.role.output` 등) 타입 |
| `cli/commands/project.ts` | `start/approve/continue --stream` NDJSON |
| 각 `*.test.ts` | 콜백/전달/sink/CLI |

## Data Model Changes
스트림 이벤트 타입 추가(readApi). team-run 스키마/저장 불변. `--stream`은 출력 형식 옵션.

## API / CLI Changes
`plan run start/approve/continue`에 `--stream`(미지정 시 현행). 이벤트 봉투는 기존 `event` kind +
team-run 봉투. 새 명령 없음.

## Error Handling
- 스트리밍 중 워커 실패 → role.failed 이벤트 + 최종 team-run(failed). 채널 깨짐 없음.
- onOutput/onStdout/eventSink 예외 → 삼키고 실행 계속.
- `--stream` 없으면 콜백 미설정 → 오버헤드 0.

## Security / Safety
승인 게이트·체크포인트·worktree 격리·읽기전용 기본·base≠main·credential 무접근 **전부 불변**.
스트리밍은 출력 전송만 추가(부수효과 없음). 기존 Run/watch 경로 불변.

## Test Plan
`test-plan.md`. mock runner: onStdout 호출, 어댑터 onOutput 전달, executor eventSink가 role.output
포함 시퀀스 방출(stub), CLI start/approve/continue --stream NDJSON(…→team-run)·비-stream 단일
봉투(회귀 0). 터미널 육안(stub).

## Acceptance Criteria
`acceptance-criteria.md` AC-01~10.

## Non-Goals
Swift 표시·출력영역 재정리(L3c), claude stream-json usage, watch/Run 변경.

## Review Checklist
- [ ] `--stream` opt-in, 미지정 시 현행(단일 봉투) 회귀 0. 기존 Run/watch 불변.
- [ ] ProcessRunner 콜백 → 워커 onOutput → executor eventSink → CLI(start/approve/continue) NDJSON
  라이브 + 최종 team-run.
- [ ] stub 합성 청크 무토큰 검증, 터미널 육안. 안전 게이트/격리/체크포인트 불변.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-stream
  -b baton/learning-stream-L3b origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(core/schemas/cli). **Swift 변경 금지**(L3c). 게이트: 루트
  `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
실행 명령이 워커 출력을 **실시간 NDJSON**으로 흘리는 채널. `plan run start/approve/continue
--stream`이 `teamRun.role.started/output/completed` 이벤트를 라이브 방출, 마지막에 최종 `team-run`
봉투. `--stream` 미지정 시 현행 단일 봉투(회귀 0). stub 합성 청크로 무토큰·터미널 검증.

성공 기준: mock runner로 (1) ProcessRunner onStdout 호출, (2) 어댑터 onOutput 전달, (3) executor
eventSink가 role.output 포함 시퀀스 방출, (4) CLI start/approve/continue --stream NDJSON(…→
team-run)/--stream 없으면 단일 봉투, (5) 기존 Run/watch/teamRuns 회귀 0. + 터미널 `--stream` 육안(stub).

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/learning-stream-L3b/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 코드: `ports/ProcessRunner.ts`(createNodeProcessRunner data 훅), `workers/WorkerAdapter.ts`,
   `StubWorker.ts`, `codex/CodexExecAdapter.ts`, `claude/ClaudeCodeAdapter.ts`,
   `teamRuns/TeamRunExecutor.ts`(invokeWorker→WorkerInvocation, executeFrom, continueCheckpoint),
   `commands/project.ts`(createTeamRunExecutor/start/approve/continue/printTeamRunResult/makeEnvelope),
   `commands/watch.ts`(event 봉투 패턴), `schemas/readApi.schema.ts`.
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- `ports/ProcessRunner.ts`: `ProcessRunOptions`에 `onStdout?:(chunk:string)=>void`,
  `onStderr?:(chunk:string)=>void`. data 훅에서 누적 + 콜백 호출(try/catch 삼킴). opt-in.
- `workers/WorkerAdapter.ts`: `WorkerRunInput.onOutput?:(chunk:string)=>void`.
- `StubWorker.ts`: onOutput 있으면 합성 진행 청크 몇 줄 방출 후 결과.
- `codex/CodexExecAdapter.ts`,`claude/ClaudeCodeAdapter.ts`: ProcessRunner.run에 `onStdout:
  input.onOutput`(+stderr) 전달. 기존 결과/usage/읽기전용 동작 보존(claude json usage 그대로;
  라이브 텍스트와 상충 시 보고).
- `teamRuns/TeamRunExecutor.ts`: 옵션 `eventSink?:(event)=>void`. invokeWorker에
  `onOutput=(chunk)=>eventSink?.({type:"teamRun.role.output", roleId, chunk})`. role.started/
  completed/teamRun.* 도 eventSink(+ 기존 events.jsonl). continueCheckpoint 경로도 동일하게 흐르게.
- `schemas/readApi.schema.ts`: 스트림 이벤트 타입(`teamRun.role.started/output/completed`,
  `teamRun.*`)을 event 봉투 data에 반영(관대).
- `commands/project.ts`: `plan run start/approve/continue`에 `--stream`. 지정 시
  createTeamRunExecutor에 `eventSink=(e)=>context.stdout(JSON.stringify(makeEnvelope("event",e)))`
  주입 → 라이브 NDJSON, 실행 후 마지막 team-run 봉투. 미지정 시 현행 printTeamRunResult.
- 테스트: ProcessRunner 콜백, 어댑터 onOutput, executor eventSink 시퀀스(stub), CLI start/approve/
  continue --stream / 비-stream.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **Swift(`apps/macos/**`) 금지.** 기존 `watch`/Run 경로
  동작 변경 금지(회귀 0). 승인 게이트/체크포인트/worktree/읽기전용/credential 정책 불변.

### Step-by-Step Plan
1. 설계 + ProcessRunner/워커/executor/CLI 읽기.
2. ProcessRunner onStdout/onStderr + 테스트.
3. WorkerRunInput.onOutput + StubWorker 합성 청크 + codex/claude 전달 + 테스트.
4. TeamRunExecutor eventSink(role.output 포함) + 테스트(stub 시퀀스, continue 포함).
5. readApi 스트림 이벤트 타입.
6. CLI start/approve/continue --stream + 테스트(--stream/비-stream). 터미널 육안.
7. 게이트 + 자체 diff 리뷰 + 최종 요약(opt-in·회귀 0·터미널 검증·출력영역 재정리는 L3c 명시).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
# 육안: baton project plan run approve <teamRunId> --stream  → NDJSON 라이브 흐름 확인
```

### Acceptance Criteria
`.baton/runs/learning-stream-L3b/acceptance-criteria.md` AC-01~10.

### Constraints
- `--stream` opt-in, 현행 보존. 콜백 예외가 실행을 막지 않음. 안전 게이트/체크포인트/격리 불변.
- 순수 인터페이스(콜백/sink) 주입형 테스트. base=`origin/main`. commit/push 금지. 한국어/식별자 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Streaming (ProcessRunner 콜백→onOutput→eventSink→CLI start/approve/continue --stream NDJSON→최종 team-run / 비-stream 현행)
## Safety (승인 게이트·체크포인트·worktree·읽기전용·credential 불변, --stream opt-in)
## Manual (터미널 --stream 육안 흐름; stub 무토큰)
## Risks / TODOs (Swift 페인+출력영역 재정리 L3c, claude stream-json usage 후속)
## Notes for Reviewer (opt-in 회귀 0, mock runner, stub 합성 청크, continue 경로 포함)
```
명령 미실행/테스트 실패는 정직히 보고.
