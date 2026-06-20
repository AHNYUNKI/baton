# Request — learning-stream-L3b

## 배경 (학습 L3)
L3a/L3a.1로 앱 학습 검토 뷰 완성. 사용자: "진행이 라이브로 보였으면"(설명·검토형의 추론 가시성).
L3 분할: **L3b(이번) TS 스트리밍 코어 → L3c Swift 터미널 페인**. 토큰 비용은 스트리밍/비스트리밍
동일(전송 방식 차이).

## 이 마일스톤 (L3b)
실행 명령이 워커 출력을 **실시간 NDJSON**으로 흘리는 채널. `plan run start/approve/continue
--stream`이 `teamRun.role.started/output/completed` 이벤트를 라이브 방출하고 마지막에 최종
`team-run` 봉투를 출력. `--stream` 없으면 현행(단일 봉투, 회귀 0). **TS 단독, 터미널 육안 검증.**
앱 표시는 L3c.

## 현재 코드 (확인)
- `baton watch`는 폴링+옛 Run 전용 → 부적합. 실행 명령이 직접 스트리밍.
- `createNodeProcessRunner` `child.stdout.on("data")` 훅 존재 → 콜백 추가 지점.
- `TeamRunExecutor.invokeWorker`→`WorkerInvocation{prompt,result}` → onOutput→eventSink 주입.
- CLI `createTeamRunExecutor`에서 eventSink 주입(--stream). L2의 **continue도 실행 재개** → 포함.

## 보류 메모 (L3c에서 처리)
스트리밍이 들어오면 **역할 출력 영역 재정리** 필요 — summary(특히 stub 보일러플레이트) + 라이브
스트림 + "왜" 설명을 한 화면에 일관 배치. **L3c(Swift)에서 정리.**

## 결과물
`.baton/runs/learning-stream-L3b/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
