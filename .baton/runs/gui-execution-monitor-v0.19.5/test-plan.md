# Test Plan — gui-execution-monitor-v0.19.5

게이트: **swift build/test**(로직) + **TS 회귀 0**(`git diff -- packages` 비어 있음). View는
swift build 컴파일 + 수동 QA. 네트워크 없음(CommandRunner mock).

## Swift Unit (swift test)

### TeamRun 계약 디코딩
- 실제 CLI 봉투(team-run/team-run-list) JSON 픽스처 디코딩.
- `awaiting-review` 상태, `usage`, `diffSummary` 포함/누락(optional) 모두 성공.
- 알 수 없는 추가 필드 무시(관대).

### BatonClient (mock CommandRunner)
- listTeamRuns/showTeamRun/startTeamRun/approveTeamRun/reviewTeamRun: 인자 배열 정확
  (`--codex/--claude/--write/--base/--timeout-ms/--accept/--reject/--note/--json`).
- 봉투 kind 검증 + 디코드. 시작 토글 off → 플래그 없음(stub).

### 순수 모델
- teamRunStatusByRole: roleId→status.
- teamRunStatusLabel: 한국어, awaiting-review="검토 대기".
- TeamRunMonitorModel: canApprove/canReview/latest/selected/statusByRole.

## Build / Manual QA
- `swift build`: ExecutionView/조직도 점등 포함 컴파일.
- 수동 QA 체크리스트:
  - 실행 탭: team-run 선택/시작(토글), 역할 상태·승인·diff 검토·토큰 표시.
  - 조직도: 현재 team-run 상태로 노드 점등(승인/실행/완료 색+라벨), team-run 없으면 정적.
  - 승인→실행→(쓰기면) diff 검토 accept/reject 흐름.
  - watch/새로고침으로 상태 갱신(라이브).
  - 기존 기능(개요/계획/새 실행/프로젝트) 정상.

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 앱은 `baton` CLI만, `.baton` 직접 변경/credential 무접근.

## Out of Scope (테스트 비대상)
- diff 전체 뷰어, 멀티 team-run 고급 관리, 예산/스킬, SwiftUI 자동 UI 테스트, 실제 디스패치 종단.

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```
