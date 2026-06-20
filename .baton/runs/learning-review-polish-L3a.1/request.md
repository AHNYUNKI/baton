# Request — learning-review-polish-L3a.1

## 배경 (L3a QA 피드백)
L3a(학습 검토 뷰) 머지 후 앱 QA에서 사용자 지적:
- **가독성 저하**: "왜" 설명 텍스트가 오른쪽으로 크게 밀리고 `## 학습 설명` 마크다운 헤딩이 그대로 노출.
- **내용 중복**: 같은 설명이 역할 카드 "왜" 패널 + 게이트 섹션 체크포인트 블록에 **두 번** 표시.
- (착시) spec/architecture 설명이 동일 → **stub 합성 문구라 그럴 뿐**, 실제 AI면 다름(버그 아님).

## 진단 (코드)
- ExecutionView 역할 카드: explanation을 `DisclosureGroup`으로 표시 → macOS 기본 **내용 들여쓰기**로
  텍스트 우측 밀림. `## 학습 설명` 헤딩 미제거.
- ExecutionView 게이트 섹션(canContinueCheckpoint, ~239–244줄): 체크포인트 역할 explanation **재출력**
  → 역할 카드와 중복.

## 이 마일스톤 (수정)
1. 가독성: DisclosureGroup → 커스텀 접기(들여쓰기 제거, 전체폭 좌측정렬) + 순수 `displayExplanation`
   (`## 학습 설명` 헤딩 제거·트림).
2. 중복 제거: 게이트 섹션은 설명 재출력 제거 → 역할명 + 짧은 안내("위 강조 역할 검토 후 계속") + 버튼만.

## 범위
Swift 단독, `packages/*` 무변경(TS 회귀 0). 로직(displayExplanation) BatonKit 테스트, View 수동 QA.

## 결과물
`.baton/runs/learning-review-polish-L3a.1/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
