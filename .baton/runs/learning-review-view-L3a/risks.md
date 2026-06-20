# Risks — learning-review-view-L3a

| 위험 | 영향 | 완화 |
|---|---|---|
| TS 회귀 | 코어/CLI 영향 | Swift 단독, `packages/*` 미수정(`git diff -- packages` 비어 있음 검증). |
| 봉투 포맷 차이 | 디코드 실패 | optional 관대 디코드 + 실제 CLI JSON 픽스처 테스트. |
| UI 자동 테스트 불가 | 회귀 사각 | 로직(계약/라벨/모니터/클라이언트) BatonKit 테스트, View 수동 QA(기존 패턴). |
| 체크포인트 역할 정확 강조 난이도 | 어느 역할인지 모호 | approvals 디코드(있으면) / 최근 완료 휴리스틱 + 계속 버튼·설명 패널로 핵심 충족. |
| 기존 게이트 UI 충돌 | 회귀 | canApprove/canReview/canContinueCheckpoint 상호배타 처리, 기존 보존. |

## 비목표 (재확인)
실시간 스트리밍/터미널 페인(L3b/c), 질문/수정(L2.1), TS/CLI 변경.

## 후속 (학습 로드맵)
- **L3b**: TS 스트리밍 코어(stream-output 재활용). **L3c**: Swift 터미널 페인(추론 라이브).
- L2.1 질문/수정, 연습문제/퀴즈, diff 해설.
