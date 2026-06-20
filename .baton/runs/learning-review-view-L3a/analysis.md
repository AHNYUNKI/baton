# Analysis

## User Request
앱에서 체크포인트(L2)로 멈추면 검토 후 진행할 수 있게 + 역할 설명(L1)을 표시. 스트리밍 없이
"설명·검토형" 앱 경험 완성.

## Current Repository Understanding
- **Swift 계약/모니터/클라이언트가 L1/L2 미반영**(TS-only였음):
  - `Contract/TeamRun.swift` `TeamRunRole`: roleId/name/assignedAgentId/status/summary?/usage?/
    artifacts? — **explanation 없음**.
  - `Org/TeamRunStatus.swift` `teamRunStatusLabel`: awaiting-approval/awaiting-review 등 — **
    awaiting-checkpoint 없음**.
  - `Store/TeamRunMonitorModel.swift`: canApprove/canReview — **canContinueCheckpoint 없음**.
  - `Client/BatonClient.swift`: approveTeamRun/reviewTeamRun — **continueCheckpoint 없음**.
- **CLI는 이미 있음**(L2 머지): `plan run continue <id> [--reject]`, `show`(explanation/체크포인트
  안내), team-run 봉투에 explanation/awaiting-checkpoint 포함 → 앱은 디코드·호출만.
- `ExecutionView`: 역할 상태/summary/usage 표시 + canApprove(승인/거부)/canReview(diff accept/
  reject). 여기에 설명 패널 + 체크포인트 continue/reject 추가.
- 체크포인트 역할 식별: team-run `approvals[]`의 pending `checkpoint:<roleId>` stepId로 가능
  (계약에 approvals 디코드 추가 시). 또는 awaiting-checkpoint 시 최근 완료 역할 휴리스틱.

## Relevant Files
| File | Reason |
|---|---|
| `Sources/BatonKit/Contract/TeamRun.swift` | `TeamRunRole.explanation?` (+ 필요시 approvals) |
| `Sources/BatonKit/Org/TeamRunStatus.swift` | `awaiting-checkpoint` 라벨 |
| `Sources/BatonKit/Store/TeamRunMonitorModel.swift` | `canContinueCheckpoint`(+체크포인트 roleId) |
| `Sources/BatonKit/Client/BatonClient.swift` | `continueCheckpoint(reject,note)` |
| `Sources/BatonApp/ExecutionView.swift` | 설명 패널 + 체크포인트 continue/reject |
| `Tests/BatonKitTests/*` | 계약 디코드/라벨/모니터/클라이언트 |

## Existing Behavior
앱은 awaiting-checkpoint를 모름 → 멈춰 보이지만 진행 버튼 없음(갇힘). 설명(왜) 미표시.

## Target Behavior
- 역할 카드에 **explanation(왜)** 패널 표시(있을 때).
- status `awaiting-checkpoint` → 라벨 "검토 대기", `canContinueCheckpoint=true` → **계속/거부 버튼**
  (continueCheckpoint 호출) + 현재 체크포인트 역할 설명 강조.
- watch/새로고침으로 갱신(기존). 조직도 점등도 awaiting-checkpoint 반영(기존 statusByRole).

## Constraints
- Swift 단독. `packages/*` 무변경(TS 회귀 0 — `git diff -- packages` 비어 있음).
- 앱은 `baton` CLI만(show/list/continue). credential 무접근. 안전은 CLI가 강제.
- 로직(계약/라벨/모니터/클라이언트)은 BatonKit 테스트, View는 수동 QA. Swift 6. 한국어/paperclip.
- 기존 화면/동작 보존(회귀 0). 스트리밍은 L3b/c.

## Assumptions
- team-run 봉투에 explanation/awaiting-checkpoint 포함(L1/L2) → optional 관대 디코드.
- 체크포인트 역할 식별: approvals 디코드(pending `checkpoint:<roleId>`) 우선, 어려우면 최근 완료
  역할 휴리스틱 + continue 버튼만으로도 충분(정확 강조는 선택).

## Open Questions
없음. 정밀 강조(어느 역할 체크포인트인지)는 approvals 디코드로 깔끔하면 포함, 아니면 버튼만.

## Risks
- 봉투 포맷 차이 → optional 관대 디코드 + 실제 CLI JSON 픽스처 테스트.
- UI 자동 테스트 불가 → 로직 BatonKit 테스트 + 뷰 수동 QA(기존 패턴).
- 정확한 체크포인트 역할 강조 난이도 → approvals 기반(있으면) / 버튼+설명 패널로 핵심 충족.

## Recommendation
계약 explanation + awaiting-checkpoint 라벨 + MonitorModel canContinueCheckpoint + Client
continueCheckpoint + ExecutionView 설명 패널/체크포인트 버튼. Swift 단독, packages 무변경. 게이트
swift build/test + `git diff -- packages` 비어 있음.
