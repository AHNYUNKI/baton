# Risks — learning-checkpoint-L2

| 위험 | 영향 | 완화 |
|---|---|---|
| continue 후 재멈춤 루프 | 무한 정지 | 완료(terminal) 체크포인트 역할은 resume 시 루프 skip + 승인 확인. 테스트로 재멈춤 없음 보장. |
| 게이트 합성 복잡 | 상태 꼬임 | 각 게이트(pre-dispatch/checkpoint/post-run)는 return-후-재진입 동일 패턴, 순차 처리. resume 분기 명시. |
| 스키마 변경 회귀 | 봉투/기존 plan 깨짐 | checkpoint? 선택 + awaiting-checkpoint 추가값. checkpoint 없는 plan 현행(회귀 0). 테스트. |
| Swift 미지원 구간 | 앱에서 멈춰 continue 버튼 없음 | L2는 CLI continue로 동작(헤드리스). Swift 체크포인트 UI는 L3. show가 CLI 안내 제공. |
| 플래너가 체크포인트 남발/누락 | 너무 자주 멈춤/안 멈춤 | 프롬프트로 "검토 역할만" 유도. 사용자 편집 가능(후속 plan 편집). 기본 false. |

## 비목표 (재확인)
Swift 체크포인트 UI(L3), 질문(AI에 되묻기)·수정(편집)(L2.1), 스트리밍(L3).

## 후속 (학습 로드맵)
- **L2.1(선택)**: 체크포인트에서 질문(follow-up 디스패치)·수정(지침/계획 편집).
- **L3**: 스트리밍 + Swift 학습 뷰(체크포인트 UI·설명 표시·추론 라이브). 이전 stream-output 설계 재활용.
