# Review — gui-project-cwd-v0.19.6

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-project-cwd`
(branch `baton/gui-project-cwd-v0.19.6`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 격리 | ✅ apps/macos만, `packages/*` 무변경(TS 회귀 0) |
| Swift 게이트 | ✅ `swift build` + `swift test` **79 tests passed** |
| 배선 | ✅ 스코프 client가 ProjectPlanView/ExecutionView/team-run/watch에 사용 |
| 글로벌 보존 | ✅ 대시보드/목록 기존 client 유지 |

## Independent Verification (직접 재실행/정독)
- `localWorkingDirectory(for:)`(순수): `source.kind == .local` + 비공백 → `URL(fileURLWithPath:
  source.value)`, github/빈/공백 → nil. 테스트(local/github/blank).
- `ProjectDetailView`: `client = BatonClient(executable: BatonLocation.resolve(preference:),
  workingDirectory: localWorkingDirectory(for: project))` — 스코프 client 구성. ProjectPlanView/
  ExecutionView/listTeamRuns/showTeamRun/watch가 그 client 사용.
- `RootView`/`BatonApp`: `batonExecutablePreference`를 ProjectDetailView에 전달.
- 글로벌 뷰(대시보드/프로젝트 목록/실행 목록)는 기존 글로벌 client 유지(회귀 없음).

## Acceptance Criteria
AC-01~06 충족. 앱 수동 QA(calc-demo 선택→실행 탭 run 표시→조직도 점등)는 사용자 QA — 설계대로.

## Deviations / Notes
- BatonApp이 이미 preference를 RootView에 전달 중이라 추가 수정 불필요(Codex 보고와 일치).

## Manual QA (사용자, 테스트 목표)
앱에서 **계산기 데모**(로컬, `/Users/ahnyunki/app/calc-demo`) 선택 → 실행 탭에 CLI로 만든
team-run 표시 → (실제 AI 쓰기 실행 시) 조직도 라이브 점등.

## Follow-ups
- 테스트: GUI에서 실제 AI 쓰기 실행 → 조직도 점등 수동 QA. 순서 3: 예산 게이트, 스킬(v0.20).

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/`packages/*` 미수정.
- 머지 후 worktree 즉시 제거. TS 미변경이라 dist 재빌드 불필요.
