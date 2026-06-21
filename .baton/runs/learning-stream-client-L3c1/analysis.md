# Analysis

## User Request
앱이 team-run `--stream` NDJSON을 소비하는 데이터 층(스트림 이벤트/파서/클라이언트/리듀서). 뷰는 L3c-2.

## Current Repository Understanding
- `Client/NDJSONParser.swift`: **WatchEvent 전용**(decodeLine→WatchEvent, 특정 봉투 kind). 버퍼
  라인 분할 로직은 재사용 참고. team-run 스트림은 별도 파서 필요.
- `Client/BatonClient.swift` `watch`: `runner.stream(arguments:)` + NDJSONParser →
  `AsyncThrowingStream<WatchEvent, Error>` (continuation, Task, mapRunnerError). team-run 스트림도
  동일 패턴. 기존 `approveTeamRun/continueCheckpoint/startTeamRun`은 비스트림(단일 team-run 디코드).
- `Contract/JsonEnvelope.swift`: `JsonEnvelope<Payload>{schemaVersion,kind,data}`. team-run 스트림
  라인은 kind "event"(data=TeamRunStreamEvent) 또는 "team-run"(data=TeamRun).
- L3b `--stream` 출력: `event` 봉투 data = {type:"teamRun.role.started/output/completed"/"teamRun.*",
  roleId?, chunk?} 라이브 + 마지막 `team-run` 봉투.
- `Contract/TeamRun.swift` TeamRun/TeamRunRole 존재(L3a). `CommandRunner` mock가 stream 청크 yield
  지원(watch 테스트가 사용).

## Relevant Files
| File | Reason |
|---|---|
| `Sources/BatonKit/Contract/TeamRunStreamEvent.swift`(신규) | `TeamRunStreamEvent`/`TeamRunStreamItem` |
| `Sources/BatonKit/Client/TeamRunStreamParser.swift`(신규) | NDJSON 라인→TeamRunStreamItem 파서 |
| `Sources/BatonKit/Client/BatonClient.swift` | `streamTeamRunApprove/Continue/Start` |
| `Sources/BatonKit/Store/TeamRunStreamModel.swift`(신규) | 순수 리듀서(outputByRole/current/final) |
| `Tests/BatonKitTests/*` | 이벤트 디코드/파서/클라이언트 스트림/리듀서 |

## Existing Behavior
앱은 비스트림 client만 → 실행 결과를 끝에 한 번. 라이브 출력 소비 경로 없음.

## Target Behavior
- `streamTeamRunApprove(teamRunId, reject)`/`streamTeamRunContinue(teamRunId, reject)`/
  `streamTeamRunStart(projectId, options)` → `AsyncThrowingStream<TeamRunStreamItem, Error>`.
  인자에 `--stream --json`. runner.stream + TeamRunStreamParser로 라인 디코드.
- `TeamRunStreamItem`: `.event(TeamRunStreamEvent)` | `.final(TeamRun)`.
- `TeamRunStreamModel`(순수): `apply(item)` → role.output 청크를 `outputByRole[roleId]`에 누적,
  role.started→currentRoleId, .final→finalTeamRun. 리셋/조회.

## Constraints
- Swift 단독, `packages/*` 무변경(TS 회귀 0). 앱은 baton CLI만. Swift 6 concurrency(@Sendable,
  스트림 안전). 뷰 변경 없음(L3c-2).
- 로직(계약/파서/리듀서) BatonKit 테스트. 클라이언트는 mock CommandRunner(stream 청크)로 테스트.

## Assumptions
- `--stream` 라인: 각 줄이 JsonEnvelope. kind "event"→data TeamRunStreamEvent, "team-run"→data
  TeamRun. 알 수 없는 kind/추가 필드 관대(무시/skip).
- 청크 경계가 라인 중간에서 끊겨도 버퍼링(워치 파서 패턴) → 완전한 줄만 디코드.

## Open Questions
없음. 뷰 소비/표시는 L3c-2.

## Risks
- 부분 라인 버퍼링 → 라인 분할 로직 정확성(테스트). 스트림 종료/에러 매핑 → watch 패턴 재사용.
- 알 수 없는 이벤트 type → 관대 처리(리듀서 무시). Swift 6 Sendable → 값 타입/캡처 주의.

## Recommendation
TeamRunStreamEvent/Item + TeamRunStreamParser + 스트리밍 클라이언트 3종 + TeamRunStreamModel(순수).
헤드리스 테스트(mock stream). 게이트 swift build/test + `git diff -- packages` 비어 있음. 뷰는 L3c-2.
