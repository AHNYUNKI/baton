# Risks — learning-stream-L3b

| 위험 | 영향 | 완화 |
|---|---|---|
| 비-stream 회귀 | 기존 동작 깨짐 | `--stream` opt-in, 콜백 미설정 시 현행 경로. 회귀 테스트. |
| 출력 폭증 | 채널 부담 | 코어는 청크 전달만. 버퍼 상한은 L3c(앱). |
| 콜백 예외 | 실행 중단 | onStdout/onOutput/eventSink 예외 try/catch 삼킴 — 실행 계속. |
| claude json usage vs 라이브 텍스트 상충 | usage 부정확/포맷 충돌 | 이번엔 stub/codex 텍스트 청크로 채널 검증, claude usage 기존 유지. stream-json 정밀은 후속. 상충 시 보고. |
| 안전 정책 흔들림 | 우려 | 스트리밍은 전송만 추가, 승인 게이트·체크포인트·worktree·읽기전용·credential 불변. |
| continue 경로 누락 | 체크포인트 이후 출력 안 보임 | start/approve/continue 모두 --stream + eventSink 적용. 테스트. |

## 비목표 (재확인)
Swift 터미널 페인 + **역할 출력 영역 재정리(summary/stub 노이즈+라이브+설명 배치)** = L3c.
claude stream-json 정밀 usage, watch/Run 변경.

## 후속
- **L3c**: Swift 터미널 페인(라이브 출력 표시, 버퍼 상한) + **출력 영역 재정리**(보류 메모).
- L2.1 질문/수정. claude stream-json usage 정밀화.
