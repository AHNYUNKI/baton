# Analysis

## User Request
Swift 실행 모니터 + 조직도 라이브 점등. 실행 흐름(시작→승인→실행→diff 검토)을 앱에서 보고
조작하며, 조직도가 역할 상태로 살아 움직인다.

## Intent
백엔드(v0.19~v0.19.4)를 화면으로. "대표가 역할별 AI에 위임하며 진행되는" 그림을 시각화 +
승인/검토 게이트를 GUI로.

## Current Repository Understanding
- **BatonClient**(BatonKit): `decodeJSON(arguments, expectedKind)` 제네릭 봉투 디코더, `runMutation`,
  `execute`, `watch`(NDJSON 스트림, NDJSONParser). `CommandRunner` 주입(테스트). 기존 메서드:
  listRuns/runDetail/state/listProjects/generateTeamPlan/showTeamPlan/setTeamPlan/startRun/approve/
  resume/clean.
- **계약**: Project/RunDetail/RunSummary/StateSnapshot/TeamPlan/WatchEvent/JsonEnvelope. **TeamRun
  없음**(추가).
- **OrgChartModel.buildOrgChart(project, teamPlan?, statusByRole?)**: statusByRole 지원. 현재
  뷰는 `buildOrgChart(project:)`만 호출 → 정적.
- **ProjectDetailView**: 탭 개요/계획/조직도/실행. `.org`→`OrgChartView(buildOrgChart(project:))`
  (정적). `.run`→placeholder("실행 엔진은 v0.19").
- **OrgChartView**: statusLabel이 planned/running/awaiting-approval/completed/failed/cancelled +
  default. **awaiting-review 라벨 없음**(추가 필요).
- **CLI(소비 대상)**: plan run start/approve/reject/review/show/list(+--json team-run/team-run-list),
  watch. 전부 존재(v0.19~v0.19.4).
- **StatusDisplay**: RunStatus용. TeamRun 상태(awaiting-review 포함)는 별도 매핑 필요.

## Relevant Files
| File | Reason |
|---|---|
| `Sources/BatonKit/Contract/TeamRun.swift`(신규) | TeamRun/Role/Usage Codable + 상태 |
| `Sources/BatonKit/Client/BatonClient.swift` | team-run 메서드(start/approve/reject/review/show/list) |
| `Sources/BatonKit/Org/TeamRunStatus.swift`(신규/순수) | `teamRunStatusByRole`, 상태 한국어 라벨 |
| `Sources/BatonKit/Store/TeamRunMonitorModel.swift`(신규/순수) | 선택/액션 가용성/statusByRole 파생 |
| `Sources/BatonApp/ExecutionView.swift`(신규) | 실행 탭 모니터 |
| `Sources/BatonApp/ProjectDetailView.swift` | .run→ExecutionView, .org→statusByRole 주입 |
| `Sources/BatonApp/OrgChartView.swift` | awaiting-review 라벨, statusByRole 점등 |
| `Tests/BatonKitTests/*` | 계약 디코딩/클라이언트/순수 모델 |

## Existing Behavior
실행 탭 = 안내문. 조직도 = 정적(전부 planned). team-run을 앱이 모름.

## Target Behavior
- 실행 탭: 프로젝트의 team-run 목록에서 **최신 선택**(또는 선택 UI) → 역할별 **라이브 상태**(점/
  라벨) + 진행. **시작**(provider/write 토글, 기본 stub/읽기전용) + **승인/거부**(awaiting-approval)
  + **diff 검토 accept/reject**(awaiting-review, diffSummary 표시) + 토큰 사용량 표 + 이벤트.
- 조직도 탭: `buildOrgChart(project, statusByRole: teamRunStatusByRole(현재 team-run))` → 노드가
  역할 상태로 **점등**. team-run 없으면 정적(기존).
- 갱신: `watch` 스트림(또는 새로고침)로 상태 변화 시 재조회 → 라이브.

## Constraints
- **Swift 단독**. `packages/*` 무변경(TS 회귀 0 — `git diff -- packages` 비어 있어야).
- 앱은 기존처럼 **`baton` CLI만** 호출(읽기/뮤테이션). `.baton` 직접 변경/credential 무접근.
- 실제/쓰기 디스패치 **안전은 CLI가 강제**(읽기전용 기본·이중 게이트·worktree 격리) — 앱은
  플래그를 전달할 뿐 우회 금지. 시작 기본은 stub(플래그 없음).
- 로직(계약/statusByRole/모니터 모델)은 BatonKit에 모아 **swift test**, View는 얇게 + 수동 QA.
  Swift 6 concurrency. 한국어 라벨/ paperclip.

## Assumptions
- start/approve/reject/review는 `--json` 시 team-run 봉투 반환 가정(아니면 show로 재조회). 클라이언트가
  관대히 처리.
- team-run 다수 시 기본 = 최신(createdAt). 선택 UI는 단순.
- 라이브 갱신은 watch 이벤트 트리거 재조회로 충분(폴링/타이머는 폴백).

## Open Questions
없음. 시작 토글(provider/write)은 기본 off(stub)로 시작, CLI 안전 그대로.

## Risks
- UI 자동 테스트 불가 → 로직 BatonKit 테스트 + 뷰 수동 QA(기존 패턴).
- 상태 enum 신규(awaiting-review) 라벨 누락 → 추가.
- watch 갱신 race/동시성 → @MainActor·기존 watch 패턴 재사용.
- 큰 diff 표시 → 요약(diffSummary)만, 전체는 diff.patch 경로 안내.

## Recommendation
TeamRun 계약 + BatonClient 메서드 + 순수 teamRunStatusByRole/모니터 모델(테스트) + ExecutionView
모니터 + 조직도 statusByRole 점등 + watch 갱신. Swift 단독, packages 무변경. 게이트 swift build/test
+ `git diff -- packages` 비어 있음.
