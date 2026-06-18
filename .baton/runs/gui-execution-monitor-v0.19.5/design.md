# Implementation Design — gui-execution-monitor-v0.19.5

## Summary

macOS 앱에 **실행 모니터**와 **조직도 라이브 점등**을 추가한다. Swift가 기존 `baton` CLI의
team-run 명령(start/approve/reject/review/show/list)과 `watch`를 소비해, 실행 탭에서 역할별
라이브 상태·승인·diff 검토·토큰을 보여주고, 조직도 노드를 team-run 역할 상태로 점등한다.
로직(계약/statusByRole/모니터 모델)은 BatonKit에 모아 테스트, View는 얇게 + 수동 QA.
**TS 변경 없음(packages/* 무변경 → 회귀 0).**

## Scope

### In Scope
- BatonKit: `TeamRun` 계약(Codable) + 봉투(team-run/team-run-list); BatonClient
  start/approve/reject/review/show/list; 순수 `teamRunStatusByRole` + TeamRun 상태 한국어 라벨;
  `TeamRunMonitorModel`(선택/액션 가용성/statusByRole 파생). 전부 테스트.
- BatonApp: `ExecutionView`(실행 탭 모니터), `ProjectDetailView` 배선(.run→ExecutionView,
  .org→statusByRole 주입), `OrgChartView`(awaiting-review 라벨 + 점등). watch 갱신.

### Out of Scope
- TS/CLI 변경. 새 워크플로우. diff 전체 뷰어(요약 + 경로만). 멀티 team-run 고급 관리.
- 실제/쓰기 디스패치 로직(이미 CLI). 스킬/예산(후속).

## Proposed Architecture

### 계약 — Contract/TeamRun.swift (신규, TS 미러)
```swift
struct TeamRunRoleUsage: Codable, Equatable, Sendable { inputTokens, outputTokens: Int; estimated: Bool }
struct TeamRunRole: Codable, Equatable, Identifiable, Sendable {
  roleId, name, assignedAgentId, status: String
  startedAt, completedAt, reason, summary: String?    // optional
  usage: TeamRunRoleUsage?; artifacts: [String]?
  var id { roleId }
}
struct TeamRun: Codable, Equatable, Sendable {
  id, projectId, status, createdAt: String
  updatedAt: String?; order: [String]; roles: [TeamRunRole]
  worktreePath, baseBranch, diffSummary: String?
  approvals: [Approval]?    // 또는 단순 디코드(필요 최소)
}
struct TeamRunSummary: Codable, Equatable, Identifiable, Sendable { teamRunId, projectId, status, createdAt; var id { teamRunId } }
struct TeamRunList: Codable, Equatable, Sendable { teamRuns: [TeamRunSummary] }
```
- 봉투 kind: `team-run`(TeamRun), `team-run-list`(TeamRunList). JsonEnvelope 재사용.
- 알 수 없는/추가 필드는 Codable이 무시(관대 디코드).

### 클라이언트 — BatonClient (메서드 추가)
```swift
func listTeamRuns(projectId) -> TeamRunList                              // team-run-list
func showTeamRun(teamRunId) -> TeamRun                                   // team-run
func startTeamRun(projectId, options: StartTeamRunOptions) -> TeamRun    // start --json (team-run)
func approveTeamRun(teamRunId, reject: Bool, note: String?) -> CommandResult
func reviewTeamRun(teamRunId, accept: Bool, note: String?) -> CommandResult
// StartTeamRunOptions { codex, claude, write: Bool; baseBranch, timeoutMs?: }
// → ["project","plan","run","start",pid, (--codex)(--claude)(--write)(--base b)(--timeout-ms n),"--json"]
```
- decodeJSON/runMutation 재사용. start/approve/review 후 최신 상태는 showTeamRun 재조회로 확정
  (관대).

### 순수 — Org/TeamRunStatus.swift
```swift
func teamRunStatusByRole(_ teamRun: TeamRun) -> [String: String]   // roleId → status
func teamRunStatusLabel(_ status: String) -> String                // 한국어(awaiting-review="검토 대기" 등)
```
조직도 점등의 핵심 브리지(순수, 테스트).

### 모니터 모델 — Store/TeamRunMonitorModel.swift (순수)
```swift
struct TeamRunMonitorModel: Equatable, Sendable {
  var summaries: [TeamRunSummary]; var selectedId: String?; var current: TeamRun?
  var selected: TeamRunSummary? ; var latest: TeamRunSummary?      // createdAt 기준
  var canApprove: Bool   // current?.status == "awaiting-approval"
  var canReview: Bool    // current?.status == "awaiting-review"
  var statusByRole: [String:String]  // current 있으면 teamRunStatusByRole, 없으면 [:]
  mutating func select(id) ; mutating func setCurrent(TeamRun) ; mutating func setSummaries([...])
}
```
선택/액션 가용성/점등 데이터 파생을 순수하게 — 테스트. (네트워크/타이머는 View가.)

### 뷰 — BatonApp
- **ExecutionView(project)** (`.run` 탭):
  - 상단: team-run 선택(기본 최신) + **시작**(provider 토글 codex/claude, write 토글; 기본 off=stub;
    base/timeout 옵션) → `startTeamRun`.
  - 본문: 역할별 카드/행 — 상태 점+한국어 라벨(teamRunStatusLabel), 담당 AI, summary, usage.
  - 게이트 액션: `canApprove`면 **승인/거부**, `canReview`면 **diff 검토**(diffSummary 표시 +
    accept/reject, diff.patch 경로 안내).
  - 토큰 사용량 표(역할 usage 합산 — 기존 집계 재사용 가능하면), 이벤트/worktree 경로.
  - 갱신: `watch` 구독 → 이벤트 시 showTeamRun 재조회(@MainActor). 새로고침 버튼 폴백.
- **ProjectDetailView**: `.run`→`ExecutionView`. `.org`→`OrgChartView(buildOrgChart(project:,
  statusByRole: monitor.statusByRole))` (현재 team-run 점등; 없으면 정적).
- **OrgChartView**: statusLabel에 `awaiting-review`("검토 대기") 추가. 점등은 기존 tint 경로.

### 라이브 갱신
기존 `watch` 스트림 재사용 — team-run 관련 이벤트(teamRun.*) 수신 시 현재 team-run 재조회.
간단/견고하게: 이벤트 도착 → showTeamRun(selectedId) → 모델 setCurrent → 조직도/모니터 갱신.
(폴링/새로고침 폴백.)

## File-Level Plan
| File | Change |
|---|---|
| `Sources/BatonKit/Contract/TeamRun.swift`(신규) | TeamRun/Role/Usage/Summary/List Codable |
| `Sources/BatonKit/Client/BatonClient.swift` | team-run 메서드 5종 + 옵션 |
| `Sources/BatonKit/Org/TeamRunStatus.swift`(신규) | teamRunStatusByRole + 라벨(순수) |
| `Sources/BatonKit/Store/TeamRunMonitorModel.swift`(신규) | 선택/가용성/점등(순수) |
| `Sources/BatonApp/ExecutionView.swift`(신규) | 실행 탭 모니터 |
| `Sources/BatonApp/ProjectDetailView.swift` | .run→ExecutionView, .org statusByRole |
| `Sources/BatonApp/OrgChartView.swift` | awaiting-review 라벨 |
| `Tests/BatonKitTests/*` | 계약 디코딩/클라이언트(mock)/순수 모델 |
| `apps/macos/README.md`/`UX.md` | 실행 모니터/점등 + 수동 QA |

## Data Model Changes
Swift 표현 계약(TeamRun*)만 추가. TS/스키마/CLI 불변.

## API / CLI Changes
없음. 기존 `project plan run *`/`watch` 사용.

## Error Handling
- team-run 없음/teamPlan 없음 → 빈 상태 안내(시작 유도). baton 미발견 → 기존 에러.
- 액션 부적합(상태 불일치) → CLI 오류를 사용자 메시지로. 디코드 관대(추가 필드 무시).

## Security / Safety
- 앱은 `baton` CLI만. `.baton` 직접 변경/credential 무접근. 실제/쓰기 안전은 CLI가 강제(앱은
  플래그 전달, 우회 없음). 기본 시작은 stub(토글 off).

## Test Plan
`test-plan.md`. swift test: TeamRun 디코딩(awaiting-review/usage/diffSummary/optional), BatonClient
(mock CommandRunner: 인자/봉투), teamRunStatusByRole/라벨, MonitorModel(선택/canApprove/canReview/
statusByRole). View는 swift build + 수동 QA. `git diff -- packages` 비어 있음(TS 회귀 0).

## Acceptance Criteria
`acceptance-criteria.md` AC-01~14.

## Non-Goals
TS 변경, diff 전체 뷰어, 멀티 team-run 고급 관리, 스킬/예산.

## Review Checklist
- [ ] TeamRun 계약/클라이언트/순수 statusByRole·모니터 모델 테스트. packages 무변경(TS 회귀 0).
- [ ] 실행 탭 모니터(상태/승인/diff 검토/토큰), 조직도 statusByRole 점등, awaiting-review 라벨.
- [ ] watch 갱신. 앱은 baton CLI만, credential 무접근. 한국어/paperclip.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-exec-monitor
  -b baton/gui-execution-monitor-v0.19.5 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD`.
- **이 마일스톤은 Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**
  (데이터는 기존 CLI에서 읽음 → `git diff -- packages` 비어 있어야, 루트 TS 게이트 회귀 0).
- 게이트: `apps/macos/Baton`에서 `swift build` + `swift test`. (TS 미변경 확인.)
- UI 자동 테스트 불가 → 로직(계약/statusByRole/모니터 모델)을 BatonKit에 모아 swift test, View
  얇게 + 수동 QA. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
실행 모니터 + 조직도 라이브 점등. Swift가 기존 `baton` CLI의 team-run 명령(start/approve/reject/
review/show/list)과 `watch`를 소비. 실행 탭에서 역할 라이브 상태·승인·diff 검토·토큰, 조직도
탭에서 team-run 역할 상태로 노드 점등. **TS 변경 0.** 성공 기준은 화면이 아니라 **계약/순수
모델 테스트 + 기존 화면 보존 + TS 회귀 0 + 한국어/paperclip**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/gui-execution-monitor-v0.19.5/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 Swift: `BatonClient`(decodeJSON/runMutation/watch/CommandRunner), `JsonEnvelope`,
   `Project`/`TeamPlan` 계약, `OrgChartModel.buildOrgChart(statusByRole:)`, `OrgChartView`,
   `ProjectDetailView`(탭), `StatusDisplay`/`RoleDisplay`, `BatonTheme`, NDJSONParser/WatchEvent.
   기존 CLI 봉투: `team-run`(TeamRun), `team-run-list`. `baton project plan run --help`로 인자 확인.
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- 신규(로직): `Sources/BatonKit/Contract/TeamRun.swift`(TeamRun/Role/Usage/Summary/List Codable,
  optional 관대 디코드), `Sources/BatonKit/Org/TeamRunStatus.swift`(`teamRunStatusByRole`,
  `teamRunStatusLabel` 한국어 — awaiting-review="검토 대기"),
  `Sources/BatonKit/Store/TeamRunMonitorModel.swift`(선택/canApprove/canReview/statusByRole/latest),
  `Tests/BatonKitTests/{TeamRunContractTests,TeamRunStatusTests,TeamRunMonitorModelTests,
  BatonClientTeamRunTests}.swift`.
- 수정(로직): `Sources/BatonKit/Client/BatonClient.swift`(listTeamRuns/showTeamRun/startTeamRun/
  approveTeamRun/reviewTeamRun + StartTeamRunOptions; decodeJSON/runMutation 재사용; 봉투 kind
  team-run/team-run-list).
- 신규(View): `Sources/BatonApp/ExecutionView.swift`(모니터: 시작 토글 codex/claude/write 기본 off,
  역할 상태/승인/diff 검토/토큰/이벤트, watch 갱신).
- 수정(View): `Sources/BatonApp/ProjectDetailView.swift`(.run→ExecutionView, .org→
  `buildOrgChart(project:, statusByRole:)`), `Sources/BatonApp/OrgChartView.swift`(awaiting-review
  라벨). `apps/macos/README.md`/`UX.md`.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용). **`packages/*`(TS) 금지** — 새 CLI/코어
  변경 없이 기존 명령만. HTTP/credential 금지. 기존 화면/명령 삭제 금지(보존).

### Step-by-Step Plan
1. 설계/태스크 + 기존 BatonClient/OrgChart/ProjectDetail 읽기. `plan run --help`로 인자 확인.
2. `TeamRun.swift` 계약 + 디코딩 테스트(awaiting-review/usage/diffSummary/optional).
3. BatonClient team-run 메서드 5종 + 테스트(mock CommandRunner: 인자/봉투 디코드).
4. `TeamRunStatus.swift`(statusByRole/라벨) + `TeamRunMonitorModel`(선택/가용성/점등) + 테스트.
5. `ExecutionView`(모니터) + `ProjectDetailView` 배선(.run/.org statusByRole) + `OrgChartView`
   라벨. watch 갱신(@MainActor).
6. README/UX + 게이트(swift build/test + `git diff -- packages` 비어 있음) + 자체 diff 리뷰 +
   최종 요약(모니터/점등/수동 QA·TS 무변경 명시).

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages    # 비어 있어야(TS 회귀 0)
```
명령 미실행/실패는 정직히 보고(UI 수동 QA 명시).

### Acceptance Criteria
`.baton/runs/gui-execution-monitor-v0.19.5/acceptance-criteria.md` AC-01~14. 특히: TeamRun 디코딩
(AC-01/02), 클라이언트 메서드(AC-03), statusByRole/라벨(AC-04/05), 모니터 모델 가용성(AC-06/07),
조직도 점등(AC-09), 실행 탭 모니터/승인/검토(AC-08/10/11), TS 회귀 0(AC-13), swift 게이트(AC-14).

### Constraints
- Swift 6 concurrency. View 얇게, 로직 BatonKit(테스트). paperclip/한국어.
- `packages/*` 미수정(TS 회귀 0). 데이터는 기존 CLI. credential/HTTP 없음. 시작 기본 stub.
- base=`origin/main`. **commit/push 금지**.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + git diff -- packages)
## Tests (Passing swift / 수동 QA만(UI))
## Monitor & Lightup (역할 라이브 상태 / 승인·diff 검토 / 조직도 statusByRole 점등 / watch 갱신)
## Risks / TODOs (diff 전체 뷰어·예산·스킬 후속)
## Notes for Reviewer (TeamRun 계약·순수 statusByRole/모니터 모델, 기존 화면 보존, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
