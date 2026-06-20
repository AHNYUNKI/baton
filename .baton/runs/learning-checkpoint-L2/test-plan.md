# Test Plan — learning-checkpoint-L2

게이트: 루트 **pnpm typecheck/test/build**(회귀 0). stub로 무토큰 헤드리스.

## Unit — schema
- TeamRole.checkpoint 부재/true. TeamRunStatus awaiting-checkpoint 수용. 봉투 round-trip.

## Unit — planner
- buildPlanPrompt에 checkpoint 표시 지시 + JSON 예시 필드 포함.

## Unit — TeamRunExecutor (mock runner + stub)
- checkpoint 역할 성공 완료 → awaiting-checkpoint + pending approval(checkpoint:<roleId>), 다음 역할 미실행.
- continueCheckpoint(continue) → 진행 → (체크포인트 더 없으면) completed.
- continueCheckpoint(reject) → 잔여 skipped + cancelled.
- 다중 체크포인트: 각 멈춤, 순차 continue로 끝까지.
- continue 후 같은 체크포인트 재멈춤 없음(완료 terminal skip). 무한 루프 없음.
- checkpoint 없는 plan → 멈춤 없이 현행(회귀).
- 체크포인트 역할 실패 → 멈춤 없이 기존 정지(failed).
- resume: awaiting-checkpoint → 게이트 유지.
- 게이트 합성: pre-dispatch→체크포인트→(쓰기면)post-run review 순.

## Integration — CLI
- plan run continue <id> → 진행. --reject → cancelled.
- show: awaiting-checkpoint면 현재 체크포인트 역할 explanation/출력 + 계속 안내.
- 기존 run/teamRuns/project 테스트 회귀 0.

## Regression / Safety
- checkpoint 없는 기존 흐름 불변. 안전 정책 불변. Swift 미변경.

## Manual (헤드리스)
- checkpoint:true plan → start→approve→(멈춤)→show→continue→완료(stub).

## Out of Scope
- Swift 체크포인트 UI(L3), 질문/수정(L2.1), 스트리밍.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
