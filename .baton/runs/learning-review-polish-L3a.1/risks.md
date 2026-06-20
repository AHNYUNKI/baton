# Risks — learning-review-polish-L3a.1

| 위험 | 영향 | 완화 |
|---|---|---|
| 커스텀 접기 동작 회귀 | 펼침/토글 깨짐 | @State Bool + Button 토글로 DisclosureGroup 대체, 기본 펼침 유지. swift build + 수동 QA. |
| 텍스트 줄바꿈/폭 | 잘림/밀림 | `.frame(maxWidth:.infinity, alignment:.leading)` + `.fixedSize(horizontal:false, vertical:true)`. |
| 헤딩 형식 변형 | 미제거 | displayExplanation는 `## 학습 설명` 기준; 다르면 원문 트림(graceful). |
| 게이트 안내 누락 | 사용자 혼란 | 설명 본문 대신 역할명 + "위 강조 역할 검토 후 계속" 안내 유지. |
| TS 회귀 | 코어 영향 | Swift 단독, packages 무변경 검증. |

## 비목표
마크다운 풀 렌더(헤딩/리스트 스타일), TS 변경, 스트리밍(L3b/c).

## 참고 (착시)
spec/architecture 설명 동일은 **stub 합성 문구**라 그럴 뿐 — 실제 codex/claude면 역할마다 다름(버그 아님).

## 후속
L3b 스트리밍 코어 → L3c Swift 터미널 페인. L2.1 질문/수정.
