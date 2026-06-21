# Acceptance Criteria — learning-stream-client-L3c1

team-run 스트림 데이터 층이 완료되려면 아래 모두 충족. BatonKit 헤드리스(mock) 테스트.

## 계약 (swift test)
- [ ] AC-01 `TeamRunStreamEvent{type,roleId?,chunk?}` 디코드(`event` 봉투 data: teamRun.role.output/
  started/completed), 추가 필드 무시. `TeamRunStreamItem`(.event/.final).

## 파서 (swift test)
- [ ] AC-02 `TeamRunStreamParser.append`가 완전한 줄마다 JsonEnvelope를 디코드 — kind "event"→.event,
  "team-run"→.final. event·final 혼합 시퀀스 정확.
- [ ] AC-03 부분 라인은 버퍼링(다음 청크와 합쳐 디코드). 알 수 없는 kind/디코드 실패 → skip(관대).
  `finish()` 잔여 처리.

## 클라이언트 (swift test, mock CommandRunner stream)
- [ ] AC-04 `streamTeamRunApprove/Continue/Start`가 올바른 인자(`project plan run approve|continue|
  start … --stream --json` + reject/note/옵션)를 만든다.
- [ ] AC-05 mock가 NDJSON 청크를 yield하면 `AsyncThrowingStream<TeamRunStreamItem>`이 event…→final
  순서로 방출한다. 스트림 에러는 매핑.

## 리듀서 (swift test, 순수)
- [ ] AC-06 `TeamRunStreamModel.apply(.event(output))`가 `outputByRole[roleId]`에 chunk를 누적한다.
- [ ] AC-07 `.event(started)`→`currentRoleId`, `.final`→`final` 설정. 알 수 없는 type 무시. `reset()`.
- [ ] AC-08 순수/Equatable — 동일 입력 동일 상태.

## 안전 & 게이트
- [ ] (포함) `packages/*` 미수정(`git diff -- packages` 비어 있음, TS 회귀 0). 뷰 미변경. `swift
  build`+`swift test` 통과. Swift 6 concurrency. 앱은 baton CLI만, credential 무접근.
