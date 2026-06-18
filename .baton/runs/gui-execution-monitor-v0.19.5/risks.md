# Risks — gui-execution-monitor-v0.19.5

| 위험 | 영향 | 완화 |
|---|---|---|
| TS 회귀 | 코어/CLI 영향 | **Swift 단독**, `packages/*` 미수정(`git diff -- packages` 비어 있음 검증). |
| UI 자동 테스트 불가 | 회귀 사각 | 로직(계약/statusByRole/모니터 모델/클라이언트)을 BatonKit에 모아 swift test, View는 수동 QA(기존 패턴). |
| 봉투 포맷 불일치 | 디코드 실패 | optional 관대 디코드 + 실제 CLI JSON 픽스처 테스트. start/approve 후 showTeamRun 재조회로 확정. |
| awaiting-review 라벨 누락 | "검토 대기" 미표시 | OrgChartView/teamRunStatusLabel에 명시 추가 + 테스트. |
| watch 동시성/race | 갱신 꼬임 | @MainActor + 기존 watch 패턴 재사용. 새로고침 폴백. |
| 큰 diff 표시 | UI 부담 | 요약(diffSummary)만, 전체는 diff.patch 경로 안내. |
| GUI에서 실제/쓰기 시작 | 부작용 | 안전은 CLI가 강제(읽기전용 기본·이중 게이트·worktree 격리). 앱은 플래그 전달만, 시작 기본 stub(토글 off). |

## 비목표 (재확인)
TS/CLI 변경, diff 전체 뷰어, 멀티 team-run 고급 관리, 예산 게이트, 스킬, 실제 디스패치 종단 자동 테스트.

## 후속 (로드맵)
- **순서 3**: 예산 게이트(플랫폼별 한도→남은 양), 스킬(v0.20).
- diff 전체 뷰어, 멀티 team-run 타임라인, 실측 토큰 추세, 병렬/역할별 게이트 시각화.
