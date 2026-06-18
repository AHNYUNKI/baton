# Acceptance Criteria — gui-execution-monitor-v0.19.5

Swift 실행 모니터 + 조직도 라이브 점등이 완료되려면 아래 모두 충족. 로직은 swift test, View는
swift build 컴파일 + 수동 QA.

## 계약 (swift test)
- [ ] AC-01 `TeamRun`/`TeamRunRole`/`TeamRunRoleUsage`/`TeamRunSummary`/`TeamRunList` Codable 정의.
  봉투 kind `team-run`/`team-run-list` 디코딩.
- [ ] AC-02 실제 CLI JSON 픽스처 디코딩: `awaiting-review` 상태, `usage`, `diffSummary`, optional
  필드 누락 모두 관대히 디코드(추가 필드 무시).

## 클라이언트 (swift test, mock CommandRunner)
- [ ] AC-03 `listTeamRuns`/`showTeamRun`/`startTeamRun`/`approveTeamRun`/`reviewTeamRun`가 올바른
  CLI 인자(`project plan run …`, `--codex/--claude/--write/--base/--timeout-ms/--accept/--reject/
  --note/--json`)를 만들고 봉투를 디코드한다.
- [ ] AC-12 시작 기본은 **stub**(provider 토글 off면 플래그 없음). 안전 옵션은 CLI가 강제(앱은 전달만).

## 순수 모델 (swift test)
- [ ] AC-04 `teamRunStatusByRole(teamRun)`가 roleId→status 맵을 만든다(순수).
- [ ] AC-05 `teamRunStatusLabel`이 한국어 라벨(특히 `awaiting-review`="검토 대기")을 반환한다.
- [ ] AC-06 `TeamRunMonitorModel.canApprove`(status==awaiting-approval)/`canReview`(status==
  awaiting-review)가 정확하다.
- [ ] AC-07 `latest`(createdAt 최신)/`selected`/`statusByRole`(current 있으면 매핑, 없으면 빈) 파생이
  정확하다. 단위 테스트.

## 뷰 (manual QA)
- [ ] AC-08 실행 탭이 team-run 모니터를 표시: 역할별 상태 점+한국어 라벨, 담당 AI, summary, 토큰.
- [ ] AC-09 조직도 탭이 `buildOrgChart(project:, statusByRole:)`로 **현재 team-run 역할 상태에 따라
  노드를 점등**한다(team-run 없으면 정적). 색만 아님 — 라벨 병기 유지.
- [ ] AC-10 `canApprove`면 승인/거부, `canReview`면 **diff 검토**(diffSummary + accept/reject,
  diff.patch 경로 안내) 액션이 노출되고 CLI를 호출한다.
- [ ] AC-11 시작(provider/write 토글, 기본 off) → `startTeamRun`. watch 이벤트 또는 새로고침으로
  상태가 갱신된다(라이브).

## 안전 & 게이트
- [ ] AC-13 `packages/*` 미수정(`git diff -- packages` 비어 있음) → 루트 TS 게이트 회귀 0. 앱은
  `baton` CLI만, credential 무접근.
- [ ] AC-14 `swift build` + `swift test`(계약/클라이언트/순수 모델) 통과. 기존 화면 보존(회귀 없음).
  한국어/paperclip. README/UX 갱신.
