# Review — learning-stream-L3b

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-stream`
(branch `baton/learning-stream-L3b`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base / 격리 | ✅ TS만(core/schemas/cli), Swift 무변경 |
| 게이트 | ✅ `pnpm typecheck` / `test` **317 passed**(+11) / `build` 직접 재실행 통과 |
| 회귀 | ✅ `--stream` opt-in → 비-stream 현행 유지(회귀 0) |

## Independent Verification (직접 재실행/정독)
- **ProcessRunner**: `ProcessRunOptions.onStdout/onStderr` + data 훅에서 `callOutputCallback`
  (try/catch 삼킴). mock 경로도 콜백 호출.
- **WorkerAdapter/StubWorker/codex/claude**: `WorkerRunInput.onOutput`; codex/claude가 onStdout/
  onStderr→onOutput 전달, stub 합성 청크. 기존 결과/usage/읽기전용 보존.
- **TeamRunExecutor**: `eventSink?`; invokeWorker onOutput→`teamRun.role.output{roleId,chunk}`,
  role.started/completed/teamRun.* 방출 + **events.jsonl 유지**. continue 재개 경로도 동일.
- **CLI**: `--stream`이 start/approve/continue 3곳, `createTeamRunExecutor(…, {stream})`에서
  eventSink=`makeEnvelope("event", …)` 주입 → 라이브 NDJSON + 최종 team-run 봉투. 미지정 시 현행.
- **readApi**: 스트림 이벤트 타입 추가.
- 테스트: eventSink 라이브 role.output + 이벤트로그 보존, **eventSink throw 시 실행 계속**(안전),
  CLI start/approve/**continue** NDJSON(stub), processRunner 콜백, 비-stream 회귀.

## Acceptance Criteria
AC-01~10 충족. 터미널 육안(stub 무토큰)은 Codex 수행 보고 + 설계상 수동 — 일치.

## Deviations / Notes
- 없음. opt-in·현행 보존·continue 경로 포함·콜백 예외 안전을 설계대로. claude stream-json 정밀
  usage는 후속(기존 usage 보존) — 정직히 보고.

## Manual (터미널, stub 무토큰)
`plan run approve <teamRunId> --stream` → role.started→role.output*→role.completed→teamRun.completed
→ 최종 team-run 봉투 라이브 흐름.

## Follow-ups
- **L3c**: Swift 터미널 페인(라이브 출력) + **역할 출력 영역 재정리**(summary/stub 노이즈+라이브+설명
  배치, 보류 메모). claude stream-json usage 정밀화. L2.1 질문/수정.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/Swift 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 → 머지 후 main dist 재빌드.
