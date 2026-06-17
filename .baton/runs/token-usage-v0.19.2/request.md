# Request — token-usage-v0.19.2

## 사용자 요청

"토큰 얼마 썼나"를 **각 플랫폼별(codex/claude)** 로 표시. (계정 구독 플랜 잔량은 안전·공식
수단으로 불가 → 범위 밖. "Baton이 호출한 만큼의 사용량"만 집계.)

## 결정된 범위 (대화로 확정)

- **표시 대상 = Baton이 호출한 사용량**(각 역할 호출의 input/output 토큰), 역할→실행→**플랫폼별**
  집계. 구독 플랜 전체 잔량은 비목표(공식 API 없음, credential/비공식 접근 금지).
- 지금은 **StubWorker**라 실측 토큰이 없음 → **추정치(명확히 "추정" 표기)** 로 집계 파이프라인
  완성. 실제 codex/claude 디스패치가 켜지면 **실측치**로 자동 반영(같은 필드).
- headless TS(코어/스키마/CLI). Swift·실제 디스패치는 후속.

## 아키텍처 판단 (설계 에이전트, 리뷰 대상)

- 사용량은 `WorkerRunResult.metadata.usage`(실측) **또는** 프롬프트/출력 길이 기반 **추정**으로
  산출 → 역할 상태에 `usage{ inputTokens, outputTokens, estimated }` 영속.
- 추정/실측은 `estimated` 플래그로 **정직하게 구분**. stub=추정, 실제 디스패치=실측.
- 집계는 순수 함수(`aggregateTeamRunUsage`) — assignedAgentId(codex/claude)별 합산.
- read API/CLI에서 표시. (Swift는 후속.)

## 결과물

`.baton/runs/token-usage-v0.19.2/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
