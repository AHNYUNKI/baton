# Analysis

## User Request
Baton이 호출한 토큰 사용량을 **플랫폼별(codex/claude)** 로 집계·표시. 구독 플랜 잔량은 범위 밖
(공식·안전 수단 없음). 지금은 stub → 추정치(라벨), 실제 디스패치 시 실측 자동 반영.

## Intent
사용자가 토큰 비용에 민감(컨텍스트 릴레이도 그 맥락). "이번 작업에 어느 플랫폼이 얼마나
썼나"를 가시화 → 비용 인지 + 향후 예산 게이트의 토대.

## Current Repository Understanding
- `WorkerRunResult`(workers/WorkerAdapter.ts): `{success,exitCode,stdout,stderr,durationMs,
  artifacts, metadata?: Record<string,unknown>}`. **metadata가 자유 백** → `usage` 실어 나르기 적합.
- `StubWorker`: metadata{provider:'stub', stub:true, ...} 반환. 실제 토큰 정보 없음.
- 실제 어댑터: `ClaudeCodeAdapter`는 현재 `--print`(평문)만 → usage 미파싱(실측은 디스패치
  마일스톤에서 `--output-format json` 등으로). `CodexExecAdapter`는 `exec` 평문.
- `TeamRunExecutor.executeFrom`: 역할 완료 시 `replaceRole`로 상태/summary 저장 — 여기에
  `usage`도 같이 저장하면 됨. invokeWorker가 prompt와 result를 모두 가짐 → 추정 산출 가능.
- `TeamRunRole`(teamRun.schema): {roleId,name,assignedAgentId,status,startedAt?,completedAt?,
  reason?,artifacts?,summary?}. **usage 필드 없음.**
- read API: `team-run` 봉투가 TeamRunSchema 재사용 → role.usage 추가 시 자동 통과.
- CLI: `project plan run show <teamRunId>` 가 team-run 봉투 출력 — 여기에 사용량 요약 추가.

## Relevant Files
| File | Reason |
|---|---|
| `packages/schemas/src/teamRun.schema.ts` | `TeamRunRoleUsage` + `TeamRunRole.usage?` |
| `packages/core/src/teamRuns/usage.ts`(신규) | estimateTokens, readOrEstimateUsage, aggregateTeamRunUsage(순수) |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | 완료 시 usage 산출·저장 |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/project.ts` | `plan run show` 사용량 요약(플랫폼별) |
| 각 `*.test.ts` | 추정/집계/실행기/CLI |

## Existing Behavior
실행 후 토큰 사용량 정보 없음.

## Target Behavior
역할 완료 시 `usage{inputTokens,outputTokens,estimated}` 산출·영속:
- `metadata.usage`(실측)가 있으면 사용(estimated=false),
- 없으면 prompt(입력)·stdout(출력) 길이 기반 **추정**(estimated=true).
`aggregateTeamRunUsage(teamRun)`가 **assignedAgentId별(codex/claude)** + 총합 + `anyEstimated`
산출. `plan run show`가 플랫폼별 표로 표시(추정/실측 표기 병기).

## Constraints
- **정직성**: 추정 ≠ 실측. `estimated` 플래그로 명확 구분, 표시에 "추정"/"실측" 병기.
- **안전**: 구독 플랜 잔량/계정 토큰 접근 금지(공식 API 없음 + credential 금지). Baton 호출분만.
- **하위호환**: `usage`는 선택 필드(team-run/Run/CLI 회귀 0). stub 기본 유지.
- headless TS. Swift·실제 디스패치 파싱은 후속(이번엔 추정 + 실측 수신 계약만).
- 토큰 추정은 근사(heuristic)임을 코드·표시에 명시.

## Assumptions
- 추정식: 대략 `ceil(chars/4)`(영문 기준 근사). 정확치 아님 — "추정" 라벨로 충분히 고지.
- 플랫폼 = assignedAgentId(codex/claude). 미래에 새 agentId 추가돼도 집계는 키별로 일반화.
- 실측 usage 포맷은 어댑터가 `metadata.usage{inputTokens,outputTokens}`로 정규화해 제공(이번엔
  계약만 정의, 실제 파싱은 디스패치 마일스톤).

## Open Questions
없음. 추정/실측 구분과 플랫폼별 집계로 확정.

## Risks
- 추정치를 실측으로 오인 → `estimated` 플래그 + 표시 병기로 방지.
- 스키마 변경이지만 선택 필드 → 회귀 위험 낮음.
- 추정 정확도 낮음 → 명시적 근사 고지, 실제 디스패치 시 실측으로 대체.

## Recommendation
순수 `usage.ts`(estimate/readOrEstimate/aggregate) + `TeamRunRole.usage?` + 실행기에서 완료 시
usage 저장 + `plan run show` 플랫폼별 표시(추정/실측 병기). stub·headless, 게이트 회귀 0.
