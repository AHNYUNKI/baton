# Review — app-shell-org-v0.18

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-app-shell-org`(branch `baton/app-shell-org-v0.18`,
base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| Swift 단독/격리 | ✅ 변경 apps/macos만, `packages/*` 무수정 |
| TS 회귀 | ✅ **218 passed**(미변경이라 회귀 0) |
| Swift 게이트 | ✅ `swift build` 성공, **62 tests passed** |
| 순수 모델 테스트 | ✅ 네비/조직도/받은함 |
| 기존 화면 보존 | ✅ 6개 화면 재사용(라우팅 destination) |

## Independent Verification
- `swift build/test`(62) + `corepack pnpm test`(218) 직접 재실행 통과. `git diff -- packages` 없음.
- 순수 모델 테스트:
  - AppNavigationModel: 초기(dashboard/overview), 섹션 전환, 프로젝트 선택+기본탭,
    탭 전환이 임시 섹션 전환에도 유지, 잘못된 프로젝트 선택 무시. (AC-01/02)
  - OrgChartModel: 대표+역할 매핑, teamPlan 없음→빈 상태, 단일 agent→대표 폴백,
    statusByRole override. (AC-03/04)
  - InboxFilter: awaiting-approval만/빈 케이스. (AC-11)
- View 재사용: RootView/ProjectDetailView가 RunsList·RunDetailView·NewRunView·
  NewProjectView·SettingsView·ProjectPlanView 호출 → 기존 기능 보존(회귀 없음). (AC-07)
- 셸(사이드바 그룹)·프로젝트 탭(개요/계획/조직도/실행 placeholder)·OrgChartView·InboxView
  존재. 조직도 정적 상태(실행 점등 v0.19). (AC-05/06/08/09/10)

## Acceptance Criteria
AC-01 ~ AC-14 충족(셸/조직도/받은함 렌더는 swift build 컴파일 + README/UX 수동 QA — 설계대로).

## Deviations / Notes
- 실행 탭 placeholder, 조직도 상태 정적(v0.19에서 실행 연결 시 라이브 점등) — 설계 의도대로.

## Follow-ups
- v0.19: 실행 엔진 + 모니터(조직도 라이브 점등). v0.20: 스킬 관리/부착.

## Reviewer Notes
- 커밋/푸시 없음. `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/`packages/*` 미수정.
- 머지 후 worktree 즉시 제거. TS 미변경이라 dist 재빌드 불필요.
