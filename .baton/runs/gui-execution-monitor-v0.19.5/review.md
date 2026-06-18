# Review — gui-execution-monitor-v0.19.5

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-exec-monitor`
(branch `baton/gui-execution-monitor-v0.19.5`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 격리 | ✅ 변경 apps/macos(+runs)만, **`packages/*` 무변경**(`git diff -- packages` 비어 있음) |
| TS 회귀 | ✅ 0(미변경) |
| Swift 게이트 | ✅ `swift build` + `swift test` **76 tests passed** |
| 순수 모델 테스트 | ✅ 계약/클라이언트/statusByRole/모니터 |

## Independent Verification (직접 재실행/정독)
- **TeamRunStatus**(순수): `teamRunStatusByRole`(roleId→status), `teamRunStatusLabel` 한국어
  (awaiting-review="검토 대기" 포함). 조직도 점등 브리지.
- **TeamRunMonitorModel**(순수): `latest`(createdAt 최신, id tie-break), `canApprove`(awaiting-
  approval)/`canReview`(awaiting-review), `statusByRole`(current→매핑 / nil→[:]), select/setCurrent/
  setSummaries 상태 유지.
- **BatonClient**: list/show/start/approve/reject/review가 `project plan run …` 인자 +
  `--codex/--claude/--write/--accept/--reject/--json` 구성, 봉투 kind team-run/team-run-list 디코드.
- **계약**: TeamRun/Role/Usage/Summary/List Codable, usage/diffSummary/optional 관대 디코드.
- **뷰**: ExecutionView(모니터: 선택/시작 토글/역할 상태/승인/diff 검토/토큰), ProjectDetailView
  (.run→ExecutionView, .org→`buildOrgChart(statusByRole:)` 점등 + watch 재조회), OrgChartView
  awaiting-review 라벨/색.
- 테스트: 계약 디코딩(usage/diff/optional), statusByRole/라벨, 클라이언트 argv 5종+opt-in 플래그,
  모니터 latest/canApprove/canReview/select. swift test 76 통과.

## Acceptance Criteria
AC-01~14 충족. 뷰 렌더/라이브 점등(AC-08~11)은 swift build 컴파일 + 수동 QA — 설계대로.

## Deviations / Notes
- approve/reject/review도 team-run 봉투를 디코드(--json) — 액션 후 최신 상태 반영. 합리적.
- 시작 기본 stub(토글 off), 안전은 CLI가 강제 — 앱 우회 없음.

## Manual QA (사용자)
실행 탭: team-run 선택/시작 → 역할 상태·토큰, 승인→실행→(쓰기면) diff 검토. 조직도 탭: 현재
team-run 상태로 노드 점등(watch/새로고침 시 갱신).

## Follow-ups
- **순서 3**: 예산 게이트(플랫폼별 한도→남은 양), 스킬(v0.20). diff 전체 뷰어, 토큰 추세.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/`packages/*` 미수정.
- 머지 후 worktree 즉시 제거. TS 미변경이라 dist 재빌드 불필요.
