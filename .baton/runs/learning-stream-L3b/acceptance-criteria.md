# Acceptance Criteria — learning-stream-L3b

실시간 출력 스트리밍(코어+CLI)이 완료되려면 아래 모두 충족. mock runner + 터미널 육안.

## 콜백 채널 (pnpm test)
- [ ] AC-01 `ProcessRunOptions.onStdout/onStderr`가 청크마다 호출된다. 미지정 시 현행(무영향). 콜백
  예외는 삼켜 실행 계속.
- [ ] AC-02 `WorkerRunInput.onOutput`가 있으면 codex/claude 어댑터가 ProcessRunner onStdout로
  전달(청크 라이브). 기존 결과/usage/읽기전용 동작 보존.
- [ ] AC-03 StubWorker는 `onOutput`이 있으면 합성 진행 청크를 방출(무토큰 스트림 검증).

## 실행기 (pnpm test)
- [ ] AC-04 `TeamRunExecutor`가 `eventSink`로 `teamRun.role.started`/**`teamRun.role.output`(청크)**/
  `teamRun.role.completed` 및 `teamRun.*`를 순서대로 방출(+ events.jsonl 유지). continueCheckpoint
  재개 경로도 동일. eventSink 미설정 시 무영향.
- [ ] AC-08 승인 게이트·체크포인트·worktree 격리·읽기전용 기본·base≠main·credential 무접근 **불변**.

## CLI (pnpm test + 터미널)
- [ ] AC-05 `plan run start/approve/continue --stream`이 실행 중 NDJSON `event` 봉투를 라이브 방출하고,
  마지막에 최종 `team-run` 봉투를 출력.
- [ ] AC-06 `--stream` 시퀀스에 `teamRun.role.output`(워커 출력 청크)이 포함(stub 합성 청크로 확인).
- [ ] AC-07 `--stream` 미지정 시 현행 단일 team-run 봉투(회귀 0).

## 안전 & 회귀
- [ ] AC-09 stub만으로 전 스트림 동작(무토큰). 콜백 예외가 실행을 막지 않음.
- [ ] AC-10 기존 `watch`/Run/teamRuns 동작·테스트 회귀 0. 루트 `pnpm typecheck/test/build` 통과.
  Swift 미변경.

## 수동 (문서)
- [ ] (QA) 터미널 `baton project plan run approve <teamRunId> --stream` → NDJSON 진행 라이브 육안
  (stub 무토큰). 절차를 요약에 명시.
