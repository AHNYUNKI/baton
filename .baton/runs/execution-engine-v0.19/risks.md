# Risks — execution-engine-v0.19

| 위험 | 영향 | 완화 |
|---|---|---|
| 기존 Run 회귀 | 실행 파이프라인/명령 깨짐 | **TeamRun을 별도 신설**(Run 무변경). 포트만 재사용. 회귀 테스트로 확인(AC-16). |
| 승인 전 디스패치(안전) | 사람 게이트 우회 | start는 항상 **awaiting-approval**에서 멈춤. 승인 전 roles 전부 planned(테스트 AC-07). |
| 메인 브랜치 직접 변경 | 데이터 손상 | 모든 디스패치 cwd=worktreePath. base ≠ main 강제. worktree 격리(AC-13). |
| 실제 파일 변경/외부 CLI | 부작용 | **StubWorker 기본** — 골격은 실제 변경/CLI 없음. 실제는 opt-in(후속, 별도 승인 강화). |
| 순서/상태 전이 오류 | 잘못된 실행 | order는 순수 함수 테스트, 상태머신은 주입형 mock로 전 전이 테스트. |
| 무한 루프(사이클/재개) | 행 | order 사이클 방어(root 취급), bounded 순차, resume은 비종료부터 1패스. |
| worktree 적체 | 폴더 쌓임 | 생성/실패·취소 경로 정리 책임 명시. (정리 명령/정책은 후속에서 강화) |
| teamPlan 미확정 실행 | 빈 실행 | teamPlan 없음 → 친절한 비영 오류(AC-15). |

## 비목표 (재확인)
Swift UI/라이브 점등(v0.19.1), 실제 codex/claude 디스패치 기본화, 병렬 형제/역할별 게이트/
fix 루프/재위임, 기존 Run 변경.

## 후속 (로드맵)
- **v0.19.1**: Swift 실행 모니터 + 조직도 라이브 점등(`buildOrgChart(statusByRole:)`) + 승인/거부 UI.
- **v0.19.x**: 실제 codex/claude 디스패치(강화된 승인), 병렬 형제, 역할별 게이트, fix 루프.
- **v0.20**: 스킬(SKILL.md) 부착.
