# Analysis

## User Request

Paperclip식 앱 셸(사이드바 IA) + AI 조직도. 사이드바 그룹 + 프로젝트 탭(개요/계획/
조직도/실행) + 조직도(대표 정점 → 역할/담당AI/상태 트리). 실행/스킬은 후속.

## Intent

지금 앱은 단순 구조(실행 목록 + 프로젝트 위저드 등 화면들이 평면적). 사용자는 Paperclip
같은 **그룹형 사이드바 IA + 조직도**로 "팀을 운영하는 대시보드" 느낌을 원한다. v0.18은
**전체 네비게이션 셸**을 그 형태로 세우고, 이미 있는 데이터(프로젝트/TeamPlan/런)를 그
틀에 배치한다. 조직도는 TeamPlan(v0.17)의 시각화 — 새 데이터 없이 읽어서 그린다.

## Current Repository Understanding (main 823a3e5 기준)

- GUI: BatonApp(@main, 활성화 정책 v0.17.1), RunsList/RunDetail/NewRun/Projects/
  NewProject/ProjectPlan 화면들. BatonClient(projects/teamPlan/runs/state 봉투 디코드),
  RunsStore, paperclip 테마(BatonTheme)/한국어, StatusPill/RoleBadge 등 컴포넌트.
- 데이터: `project list --json`(Project+teamPlan+overview), `project plan show`,
  `run list`/`state --json`, `watch`. **조직도/네비에 필요한 데이터는 이미 있음.**
- 현재 루트 화면 구성은 사이드바 그룹 IA가 아님 → 재구성 대상.

## Relevant Files (apps/macos/Baton)

| File | Reason |
|---|---|
| `Sources/BatonKit/Navigation/AppNavigationModel.swift`(신규) | 섹션/프로젝트/탭 선택 상태(순수) |
| `Sources/BatonKit/Org/OrgChartModel.swift`(신규) | TeamPlan→조직도 노드(순수) |
| `Sources/BatonApp/Shell/SidebarView.swift`(신규) | 그룹형 사이드바 |
| `Sources/BatonApp/Shell/RootView.swift`(신규/수정) | 셸 + 본문 라우팅 |
| `Sources/BatonApp/ProjectDetailView.swift`(신규) | 개요/계획/조직도/실행 탭 |
| `Sources/BatonApp/OrgChartView.swift`(신규) | OrgChartModel 렌더 |
| `Sources/BatonApp/InboxView.swift`(신규) | 받은 함(승인 대기 run) |
| `Sources/BatonApp/BatonApp.swift` | 루트를 RootView로 |

## Existing Behavior

화면들이 평면적으로 연결됨. 그룹형 사이드바·프로젝트 탭·조직도 없음.

## Target Behavior

- 좌측 사이드바: 액션(새 실행/대시보드/받은 함) · 작업(실행) · 프로젝트(색점+상태) ·
  에이전트(AI + 대표 👑) · 하단 계정·설정. 선택 시 본문 전환.
- 프로젝트 선택 → 상세에 **탭**: 개요 / 계획(기존 ProjectPlan) / **조직도** / 실행(placeholder).
- 조직도: `buildOrgChart`로 대표(leadAgentId) 정점 + 역할 노드(역할명/담당AI 배지/상태).
  상태는 현재 정적(실행 연결은 v0.19에서 라이브).
- 받은 함: `run list`에서 awaiting-approval만 필터.

## Constraints

- TS 코어/CLI 변경 없음(데이터는 기존 명령). 루트 TS 게이트 회귀 0.
- 네비/조직도 모델은 순수·테스트. View 수동 QA. 기존 화면 보존(탭/라우팅으로 재배치).
- paperclip/한국어. base origin/main.

## Assumptions

### Safe
- 조직도는 TeamPlan을 1단계 트리(대표→역할)로. assignedAgentId→AI 배지, 역할 status는
  (실행 전) 정적/placeholder, 추후 run 상태로 점등.
- 네비게이션 모델은 enum 기반 선택 상태(섹션/프로젝트id/탭).
- 받은 함 = awaiting-approval run 목록(기존 listRuns/run list 재사용).

### Risky
- **대규모 View 재구성**: 평면 화면 → 셸+라우팅. 기존 화면을 destination으로 재배치하며
  회귀(깨진 네비) 위험 → 기존 화면 보존 + 라우팅만 추가. swift build로 컴파일 보장.
- **검증 비대칭**: 셸/조직도 렌더는 자동 테스트 불가 → 로직 모델 최대화 + 수동 QA 체크리스트.
- **에이전트 섹션 범위**: 프로젝트별 AI + 대표 표시(전역 카탈로그 아님, 합의대로).

## Open Questions

(기본값 진행, 떠오르면 말해주기로 함.)
1. 조직도 상태는 v0.18 정적(실행 연결 v0.19)로. 2. 실행 탭은 placeholder.

## Risks

`risks.md` 참조: View 재구성 회귀, 검증 비대칭, 네비 상태, 조직도 매핑, 데이터 의존.

## Recommendation

네비게이션·조직도를 **순수 모델로 분리해 테스트**하고, 사이드바 셸 + 프로젝트 탭 +
OrgChartView를 그 위에 얇게 얹는다. 데이터는 기존 CLI에서 읽어 TS 변경 0. 기존 화면은
탭/라우팅으로 재배치(보존). 실행 상태 점등은 v0.19. 상세는 `design.md`.
