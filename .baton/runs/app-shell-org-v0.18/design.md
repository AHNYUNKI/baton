# Implementation Design

## Summary

Paperclip식 **앱 셸(그룹형 사이드바 IA)** + **AI 조직도**를 macOS 앱에 추가한다.
사이드바: 액션(새 실행/대시보드/받은 함) · 작업(실행) · 프로젝트(목록→개요/계획/조직도/
실행 탭) · 에이전트(AI+대표 👑) · 계정. 조직도 = TeamPlan(v0.17) 시각화(대표 정점→역할/
담당AI/상태). 데이터는 기존 CLI에서만 → **TS 변경 0**. 네비/조직도/필터는 순수 모델로
테스트, View는 수동 QA. 실행 엔진은 v0.19, 스킬은 v0.20.

## Scope

### In Scope
- BatonKit: `AppNavigationModel`(선택 상태), `OrgChartModel.buildOrgChart`(TeamPlan→트리),
  Inbox 필터(awaiting-approval) — 순수, 테스트
- Views: SidebarView(그룹), RootView(라우팅), ProjectDetailView(탭), OrgChartView, InboxView
- 기존 화면 보존(탭/라우팅 destination으로 재배치), paperclip/한국어, README/UX

### Out of Scope
- 실행 엔진/디스패치(v0.19, "실행" 탭 placeholder), 조직도 라이브 점등(v0.19), 스킬(v0.20),
  멀티 워크스페이스/검색 고도화, TS 코어/CLI 변경

## Proposed Architecture

```text
BatonKit (순수, 테스트)
  AppNavigationModel:
    enum Section { dashboard, inbox, runs, project(id), agents, settings }
    var section; var projectTab: ProjectTab(.overview/.plan/.org/.run)
    select(section) / selectProject(id) / selectTab(tab)  (전이 규칙)
  OrgChartModel.buildOrgChart(project, teamPlan, statusByRole?) -> OrgChart {
    lead: { agentId, label } ; nodes: [{ roleId, name, assignedAgentId, status }] }
  inboxRuns(runs) -> runs.filter { $0.status == "awaiting-approval" }

BatonApp (얇은 View, 수동 QA)
  RootView = HSplit(SidebarView | mainContent(by navigation))
  SidebarView: 액션/작업/프로젝트/에이전트/계정 (선택 → navigation)
  mainContent:
    .dashboard → 기존 대시보드(state/runs)
    .runs      → RunsList(기존)
    .inbox     → InboxView(inboxRuns)
    .project   → ProjectDetailView(탭: 개요/계획(ProjectPlanView 기존)/조직도(OrgChartView)/실행 placeholder)
    .agents    → 선택 프로젝트의 AI 목록 + 대표 👑
    .settings  → SettingsView(기존)
```

데이터: `listProjects`/`showTeamPlan`/`listRuns`/`state`(기존 BatonClient). 새 CLI 없음.

## File-Level Plan

| File | Change |
|---|---|
| `Sources/BatonKit/Navigation/AppNavigationModel.swift`(신규) | 선택 상태/전이 |
| `Sources/BatonKit/Org/OrgChartModel.swift`(신규) | buildOrgChart + 노드 타입 |
| `Sources/BatonKit/Inbox/InboxFilter.swift`(신규) | awaiting-approval 필터 |
| `Sources/BatonApp/Shell/{RootView,SidebarView}.swift`(신규) | 셸/라우팅 |
| `Sources/BatonApp/ProjectDetailView.swift`(신규) | 개요/계획/조직도/실행 탭 |
| `Sources/BatonApp/OrgChartView.swift`(신규) | 조직도 렌더(대표 정점→역할 노드) |
| `Sources/BatonApp/InboxView.swift`(신규) | 받은 함 |
| `Sources/BatonApp/BatonApp.swift` | 루트를 RootView로 교체(기존 store/client 재사용) |
| `Tests/BatonKitTests/*` | 네비/조직도/필터 테스트 |
| `apps/macos/README.md`/`UX.md` | IA·조직도·수동 QA |

## Data Model Changes
없음(TS/스키마/CLI 불변). Swift 측 표현 모델(Navigation/OrgChart)만 추가.

## API / CLI Changes
없음. 기존 `project list --json`/`project plan show`/`run list`/`state --json` 사용.

## Workflow / Safety
- 앱은 기존처럼 `baton` CLI만 호출(읽기). `.baton` 직접 변경/credential 접근 없음.
- 조직도 상태는 정적(실행 미연결). 실행/점등은 v0.19. 대규모 변경은 기존 화면 보존으로 위험 완화.

## Error Handling
- teamPlan/프로젝트 없음 → 조직도/탭 빈 상태 안내. baton 미발견 → 기존 에러. 라우팅 방어.

## Test Plan
`test-plan.md`: 네비 전이/조직도 빌드/받은함 필터 swift test, View 컴파일 + 수동 QA,
TS 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~14.

## Non-Goals
- 실행 엔진/디스패치, 라이브 점등, 스킬, 멀티 워크스페이스, TS 변경.

## Review Checklist
- [ ] AppNavigationModel/OrgChartModel/Inbox 필터 순수·테스트.
- [ ] 사이드바 그룹 IA + 라우팅, 프로젝트 탭(개요/계획/조직도/실행).
- [ ] 조직도 대표 👑 정점 + 역할/담당AI/상태(라벨 병기). 실행 탭 placeholder.
- [ ] 기존 화면 보존(회귀 없음). TS 미변경(회귀 0). credential/HTTP 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-app-shell-org
  -b baton/app-shell-org-v0.18 origin/main`. `git merge-base --is-ancestor origin/main HEAD`.
- **이 마일스톤은 Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**
  (데이터는 기존 CLI에서 읽음 → 루트 TS 게이트 회귀 0이어야 함).
- 게이트: `apps/macos/Baton`에서 `swift build` + `swift test`, 그리고 루트
  `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- UI는 자동 테스트 불가 → 로직(네비/조직도/필터)을 BatonKit에 모아 swift test, View 얇게 +
  수동 QA. (머지 후 worktree 제거 예정.)

### Goal

Paperclip식 앱 셸(그룹형 사이드바 IA) + AI 조직도. 사이드바(액션/작업/프로젝트/에이전트/
계정) + 프로젝트 탭(개요/계획/조직도/실행) + 조직도(대표 👑 정점→역할/담당AI/상태,
TeamPlan 시각화). 데이터는 기존 CLI에서만(TS 변경 0). 네비/조직도/필터는 순수 모델로
테스트, View는 수동 QA. **실행 엔진은 범위 밖(v0.19, "실행" 탭 placeholder).**

성공 기준은 "화면"이 아니라 **순수 모델(네비/조직도/필터) 테스트 + 기존 화면 보존(회귀
없음) + TS 회귀 0 + 한국어/paperclip**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/app-shell-org-v0.18/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`,
   `.baton/runs/lead-agent-orchestration/vision.md`
5. 기존 GUI: BatonClient(projects/teamPlan/runs/state), RunsStore, BatonTheme/컴포넌트,
   ProjectPlanView/Projects/NewProject/RunsList(v0.16~v0.17.2)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- 신규(로직): `Sources/BatonKit/Navigation/AppNavigationModel.swift`,
  `Sources/BatonKit/Org/OrgChartModel.swift`, `Sources/BatonKit/Inbox/InboxFilter.swift`,
  `Tests/BatonKitTests/{AppNavigationModelTests,OrgChartModelTests,InboxFilterTests}.swift`
- 신규(View): `Sources/BatonApp/Shell/{RootView,SidebarView}.swift`,
  `Sources/BatonApp/{ProjectDetailView,OrgChartView,InboxView}.swift`
- 수정: `Sources/BatonApp/BatonApp.swift`(루트→RootView, 기존 store/client 재사용),
  `apps/macos/README.md`/`UX.md`

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용).
- **`packages/*`(TS) 금지** — 새 CLI/코어 변경 없이 기존 명령만 사용. HTTP/네트워크 금지.
- 실행 엔진/디스패치 로직 금지(v0.19). 스킬 금지(v0.20). 기존 화면 삭제 금지(재배치/보존).

### Step-by-Step Plan
1. 설계/태스크/vision + 기존 GUI 구조 읽기.
2. `AppNavigationModel`(섹션/프로젝트/탭 + 전이) + 테스트. (task-S01)
3. `OrgChartModel.buildOrgChart`(대표 정점→역할 노드, teamPlan/대표 없음/status 케이스) +
   테스트. (task-S02)
4. `InboxFilter`(awaiting-approval) + 테스트. (task-S02에 포함 가능)
5. `RootView`+`SidebarView`(그룹 IA + 라우팅), 기존 화면을 destination으로 재배치. (task-S03)
6. `ProjectDetailView`(탭: 개요/계획(기존)/조직도(OrgChartView)/실행 placeholder) +
   `OrgChartView`(paperclip 트리) + `InboxView`. BatonApp 루트 교체. (task-S04)
7. README/UX(IA·조직도·수동 QA) + 전체 게이트(swift build/test + 루트 TS 회귀 0) +
   자체 diff 리뷰 + 최종 요약(UI 수동 QA 명시). (task-S05)

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
명령 미실행/실패는 정직히 보고(UI 수동 QA, 실행 탭은 placeholder 명시).

### Acceptance Criteria
`.baton/runs/app-shell-org-v0.18/acceptance-criteria.md` AC-01~14. 특히: 네비/조직도/필터
모델 테스트(AC-02/04/11), 사이드바 IA+라우팅(AC-05/06), 기존 화면 보존(AC-07), 조직도
렌더(AC-09), TS 회귀 0(AC-12), swift 게이트(AC-13).

### Constraints
- Swift 6 concurrency 준수. View 얇게, 로직 BatonKit(테스트). paperclip/한국어.
- `packages/*` 미수정(TS 회귀 0). 데이터는 기존 CLI. credential/HTTP 없음.
- base = `origin/main`. **commit/push 하지 말 것**.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + 루트 TS 게이트)
## Tests (Passing swift/TS / Failing / 수동 QA만(UI))
## Risks / TODOs (실행 엔진 v0.19, 스킬 v0.20)
## Notes for Reviewer (네비/조직도/필터 모델, 기존 화면 보존, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
