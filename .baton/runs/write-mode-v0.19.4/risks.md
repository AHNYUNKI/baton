# Risks — write-mode-v0.19.4

| 위험 | 영향 | 완화 |
|---|---|---|
| 실제 파일 수정 사고 | 코드 손상 | **worktree 격리(cwd=worktree)** + base≠main + **자동 머지/푸시/revert 없음** + 이중 게이트. main 절대 무영향. |
| 의도치 않은 광범위 편집 | 위험 변경 | claude `acceptEdits`만(‐‐dangerously‐skip 금지), codex `workspace-write`(작업공간 한정). 끝난 뒤 diff 검토 게이트로 사람 확인. |
| 우발적 쓰기 활성화 | 예상 외 변경 | **이중 opt-in**(`--write` + provider). 기본 읽기전용/stub. |
| reject 후 worktree 누적 | 폴더 쌓임 | reject=cancelled+**보존**(작업 유실 방지 우선). 정리는 사용자/후속(자동 제거 안 함). |
| diff 캡처 실패 | 검토 누락 | 실패 시 보수적 처리(요약 경고 또는 failed) + diff.patch 아티팩트. |
| 상태 enum 추가(awaiting-review) | 기존 분기 영향 | 추가값 — 기존 처리 무해. CLI/테스트에서 신규 상태 처리. |
| 종단 자동검증 불가 | 회귀 사각 | 단위는 mock runner/worktreeManager(인자/전이), 종단은 수동 QA(문서화). |

## 비목표 (재확인)
자동 머지/푸시/revert, 중간(역할별) 게이트, 병렬/fix 루프/재위임, Swift 모니터, worktree 자동 정리,
codex usage 정밀화.

## 후속 (로드맵)
- **순서 1**: Swift 실행 모니터 + 조직도 라이브 점등(실측 상태/토큰/diff 요약).
- **순서 3**: 예산 게이트(플랫폼별 한도→남은 양), 스킬(v0.20).
- 쓰기 run worktree 정리 정책, 병렬/역할별 게이트, fix 루프, diff를 다음 역할 릴레이에 반영.
