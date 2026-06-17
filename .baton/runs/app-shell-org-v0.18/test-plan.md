# Test Plan

게이트: **swift build/test**(로직 모델) + **루트 TS 게이트 회귀 0**(TS 미변경 확인).
View는 swift build 컴파일 + 수동 QA. 실제 baton은 주입형 mock(필요 시). 네트워크 없음.

## Swift Unit Tests (swift test)

### AppNavigationModel
- 초기 상태(대시보드 등 기본).
- 섹션 전환(대시보드↔실행↔받은 함↔에이전트↔설정).
- 프로젝트 선택 → 기본 탭(개요), 탭 전환(개요/계획/조직도/실행).
- 다른 섹션 갔다 프로젝트 복귀 시 상태 일관.

### OrgChartModel.buildOrgChart
- 정상 TeamPlan → 대표 정점 + 역할 노드(roleId/name/assignedAgentId/status).
- teamPlan 없음 → 빈/안내(노드 0, hasPlan=false).
- leadAgentId 없음 + 단일 agent → 그 agent를 대표로.
- statusByRole 제공 → 노드 상태 반영 / 미제공 → 정적 기본.

### Inbox 필터
- runs 목록 → awaiting-approval만 반환(다른 상태 제외). 빈 상태.

## Build / Manual QA
- `swift build`: 셸/탭/조직도/받은 함 View 포함 컴파일.
- 수동 QA 체크리스트:
  - 사이드바 그룹(액션/작업/프로젝트/에이전트/계정) 표시 + 선택 라우팅.
  - 프로젝트 → 개요/계획/조직도/실행 탭 전환. 조직도에 대표 👑 + 역할/담당AI 표시.
  - 받은 함 = 승인 대기 run.
  - 기존 기능(새 실행/프로젝트 생성/계획 생성·편집) 여전히 동작.

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 루트 pnpm typecheck/test/build 회귀 0.
- 앱은 `baton` CLI만 호출, `.baton` 직접 변경/credential 접근 없음.

## Out of Scope (테스트 비대상)
- 실행 엔진/디스패치(v0.19), 조직도 라이브 점등, 스킬(v0.20), SwiftUI 자동 UI 테스트.

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
