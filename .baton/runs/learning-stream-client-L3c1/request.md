# Request — learning-stream-client-L3c1

## 배경 (학습 L3)
L3b로 `plan run start/approve/continue --stream`이 워커 출력을 실시간 NDJSON으로 방출. L3c는 이를
**앱 창에 라이브로** 띄우고(터미널 페인) + 미뤄둔 **출력 영역 재정리**까지. L3c는 비동기 스트리밍
UI라 둘로 분할: **L3c-1(BatonKit 데이터 층) → L3c-2(BatonApp 뷰)**.

## 이 마일스톤 (L3c-1)
앱이 team-run `--stream` NDJSON을 소비하는 **데이터 층**: 스트림 이벤트 모델/파서 + 스트리밍
클라이언트(approve/continue/start) + 리듀서. **헤드리스 테스트 가능**(mock CommandRunner). 뷰 없음.

## 현재 코드 (확인)
- `NDJSONParser`는 **WatchEvent 전용**(team-run 스트림 이벤트는 데이터 모양 다름) → team-run용 별도.
- `BatonClient.watch`가 `runner.stream` + 파서 + `AsyncThrowingStream<WatchEvent>` 패턴 → 재사용.
- `--stream` 출력: `event` 봉투(data = teamRun.role.output{roleId,chunk} 등) 라이브 + 마지막
  `team-run` 봉투(최종 TeamRun).

## 범위
- BatonKit: `TeamRunStreamEvent`/`TeamRunStreamItem`(event|final) 계약 + 스트림 파서 +
  `streamTeamRunApprove/Continue/Start`(AsyncThrowingStream) + `TeamRunStreamModel`(순수 리듀서).
- Swift 단독, `packages/*` 무변경(TS 회귀 0). 뷰는 L3c-2.

## 결과물
`.baton/runs/learning-stream-client-L3c1/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
