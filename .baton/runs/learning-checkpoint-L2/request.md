# Request — learning-checkpoint-L2

## 배경
학습 전환 L 시리즈. L1(설명형 디스패치) 완료 → 역할이 "무엇을·왜"를 설명(`role.explanation`).
L2는 사용자가 가장 원한 **"설계 확인 후 진행"**: 지정 체크포인트에서 멈춰 설명을 읽고 이해/
판단 후 다음으로. "AI가 깜깜이로 알아서 다 해버리는" 불안 해소. ([[baton-learning-direction]])

## 이 마일스톤 (L2)

**학습 체크포인트**: `checkpoint=true`로 지정된 역할이 완료되면 실행을 **멈추고**(awaiting-checkpoint)
사람이 그 역할의 설명/출력을 검토 → **continue(진행)/reject(중단)**. 여러 체크포인트 가능.

## 범위
- `TeamRole.checkpoint?`(선택) + `TeamRunStatus += awaiting-checkpoint`.
- 플래너가 설계/계획 성격 역할을 checkpoint로 표시(편집 가능).
- 실행기: 체크포인트 역할 완료 시 멈춤 + `continueCheckpoint(continue/reject)` + resume 게이트.
- CLI `plan run continue <id> [--reject]` + `show`에 체크포인트 역할 설명 표시.
- TS 단독, stub로 헤드리스 검증. **Swift 체크포인트 UI는 L3**(그 전까지 CLI로 continue).
- "질문/수정"(AI에 되묻기·편집)은 후속(L2.1). L2 핵심 = 멈춤+검토+진행/중단.

## 결과물
`.baton/runs/learning-checkpoint-L2/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
