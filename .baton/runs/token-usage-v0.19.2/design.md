# Implementation Design — token-usage-v0.19.2

## Summary

Baton이 호출한 **토큰 사용량을 플랫폼별(codex/claude)로 집계·표시**한다. 역할 완료 시
`usage{inputTokens, outputTokens, estimated}`를 산출해 role 상태에 영속하고(실측 metadata.usage가
있으면 사용, 없으면 prompt/stdout 길이 기반 **추정**), `aggregateTeamRunUsage`로 플랫폼별/총합을
계산해 `plan run show`에 **추정/실측 병기**로 표시한다. 구독 플랜 잔량은 범위 밖(공식·안전
수단 없음). 스키마는 선택 필드 추가(회귀 0). **headless TS, stub 기본**(실제 디스패치 파싱·Swift
후속).

## Scope

### In Scope
- 순수 `usage.ts`: `estimateTokens(text)`, `readOrEstimateUsage(prompt, result)`,
  `aggregateTeamRunUsage(teamRun)`.
- `TeamRunRoleUsage` 스키마 + `TeamRunRole.usage?`(선택).
- `TeamRunExecutor`: 역할 완료 시 usage 산출·저장.
- CLI `plan run show`: 플랫폼별 사용량 요약(추정/실측 표기). `--json`엔 usage 포함(role.usage로 자동).
- 테스트(추정/집계/실행기/CLI).

### Out of Scope
- 실제 codex/claude usage **파싱**(디스패치 마일스톤 — 이번엔 metadata.usage 수신 계약만).
- 구독 플랜 잔량/계정 토큰 접근(공식 API 없음, 금지). 예산 설정/초과 게이트(후속 옵션).
- Swift 표시(후속). 비용(USD) 환산은 이번 범위 밖(토큰 수만; 단가 환산은 후속 옵션).

## Proposed Architecture

### 스키마 — teamRun.schema (추가)
```ts
TeamRunRoleUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  estimated: z.boolean()
})
// TeamRunRoleSchema 에 usage: TeamRunRoleUsageSchema.optional() 추가
```
선택 필드 → 기존 team-run/readApi 봉투 회귀 0.

### 순수 — usage.ts
```ts
export function estimateTokens(text: string): number
//  근사: Math.ceil(text.length / 4). 빈 문자열 0. (heuristic — 정확치 아님)

export type RoleUsage = { inputTokens: number; outputTokens: number; estimated: boolean }
export function readOrEstimateUsage(prompt: string, result: WorkerRunResult): RoleUsage
//  result.metadata.usage{inputTokens,outputTokens}(숫자)가 유효하면 {…, estimated:false},
//  아니면 { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(result.stdout),
//           estimated:true }.

export type UsageAggregate = {
  byPlatform: Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; roles: number }>
  total: { inputTokens: number; outputTokens: number; totalTokens: number }
  anyEstimated: boolean
}
export function aggregateTeamRunUsage(teamRun: TeamRun): UsageAggregate
//  usage 있는 role을 assignedAgentId별 합산 + 총합 + anyEstimated(하나라도 estimated면 true).
```

### 실행기 — TeamRunExecutor (수정)
- invokeWorker가 prompt와 result를 모두 가지므로, 역할 완료(성공/실패) 시
  `const usage = readOrEstimateUsage(prompt, result)`를 산출해 `replaceRole`에 `usage` 포함 저장.
  (prompt 접근을 위해 invokeWorker가 usage까지 계산해 반환하거나, prompt를 호출부로 노출.)
- summary/상태 저장과 동일 지점에서 usage도 저장. resume 안전(영속).
- 이벤트(`teamRun.role.completed`) payload에 usage 요약(inputTokens/outputTokens/estimated) 추가(관찰).

### read API / CLI
- read API: 추가 봉투 불필요 — `team-run` 봉투의 roles[].usage로 자동 노출(`--json`).
- CLI `plan run show <teamRunId>`(텍스트): "## 토큰 사용량(추정/실측)" 섹션 —
  `aggregateTeamRunUsage` 결과를 플랫폼별 표(codex/claude: input/output/total/역할수) + 총합 +
  `anyEstimated`면 "※ 추정치 포함(실측 디스패치 시 정확)" 주석.

## File-Level Plan
| File | Change |
|---|---|
| `packages/schemas/src/teamRun.schema.ts` | `TeamRunRoleUsage` + `TeamRunRole.usage?` |
| `packages/core/src/teamRuns/usage.ts`(신규) | estimate/readOrEstimate/aggregate(순수) |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | 완료 시 usage 산출·저장 + 이벤트 |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/project.ts` | `plan run show` 사용량 요약 |
| 각 `*.test.ts` | 추정/집계/실행기/CLI |

## Data Model Changes
`TeamRunRoleUsage`(신규) + `TeamRunRole.usage?`(선택). 그 외 불변. team-run 봉투 자동 통과.

## API / CLI Changes
read API 종류 불변(roles[].usage가 team-run에 포함). CLI `plan run show` 텍스트에 사용량 섹션
추가(`--json`은 구조에 usage 포함). 새 명령 없음.

## Error Handling
- metadata.usage 형식 불량/음수/비숫자 → 무시하고 추정으로 폴백(estimated:true).
- usage 없는 role(미실행/skip) → 집계에서 제외.
- 빈 텍스트 → 0 토큰.

## Security Considerations
- **구독 플랜 잔량/계정 토큰 접근 없음**(공식 API 없음 + credential 금지). Baton 호출분만 집계.
- 추정/실측 명확 구분(`estimated`) — 오인 방지. stub 기본(외부 호출 없음). credential/HTTP 없음.

## Test Plan
`test-plan.md`. 순수(estimate 경계/aggregate 플랫폼별·anyEstimated) + readOrEstimate(실측 우선/
추정 폴백) + 실행기(완료 시 usage 저장·resume 보존) + CLI(show 사용량 표·추정 주석) + 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~10.

## Non-Goals
실제 usage 파싱, 구독 잔량, 예산 게이트, USD 환산, Swift 표시.

## Review Checklist
- [ ] `usage`는 선택 필드 — team-run/Run/CLI 회귀 0.
- [ ] readOrEstimateUsage: 실측 metadata.usage 우선, 없으면 추정 + `estimated` 정확.
- [ ] aggregateTeamRunUsage: 플랫폼별(assignedAgentId) 합산 + 총합 + anyEstimated. 순수·테스트.
- [ ] 완료 시 role.usage 영속(resume 보존). `plan run show` 플랫폼별 표 + 추정/실측 병기.
- [ ] 구독 잔량/credential 접근 없음. stub 기본. Swift/실제 파싱 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-token-usage
  -b baton/token-usage-v0.19.2 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(schemas/core/cli). **Swift 변경 금지. 실제 codex/claude 디스패치/usage 파싱
  금지(stub 유지).**
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- 머지 후 worktree 즉시 제거. **commit/push 금지**(리뷰 후 본 에이전트 진행).

### Goal
Baton이 호출한 **토큰 사용량을 플랫폼별(codex/claude)로 집계·표시**한다. 역할 완료 시
`usage{inputTokens,outputTokens,estimated}`를 산출(실측 `metadata.usage` 우선, 없으면 prompt/
stdout 길이 기반 **추정**)해 role에 영속하고, `aggregateTeamRunUsage`로 플랫폼별 합산해
`plan run show`에 **추정/실측 병기**로 표시. 구독 플랜 잔량은 범위 밖(공식 API 없음, credential
금지). **stub·headless** — 지금은 추정치가 나오고, 실제 디스패치가 켜지면 같은 필드에 실측이 들어감.

성공 기준: 순수 추정/집계 함수의 정확성 + 역할 완료 시 usage 영속(resume 보존) + `plan run show`
플랫폼별 표(추정 표기) + 기존 회귀 0. 전부 stub·headless로 결정적 검증.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/token-usage-v0.19.2/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드: `teamRun.schema.ts`, `TeamRunExecutor.ts`(executeFrom/invokeWorker/replaceRole/
   roleEvent), `workers/WorkerAdapter.ts`(WorkerRunResult.metadata), `StubWorker.ts`,
   `summarizeResult.ts`(순수 패턴 참고), `commands/project.ts`(plan run show).
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- 신규: `packages/core/src/teamRuns/usage.ts`
  - `estimateTokens(text): number` — `Math.ceil(text.length / 4)`, 빈 문자열 0. 근사임을 주석에 명시.
  - `readOrEstimateUsage(prompt, result): {inputTokens,outputTokens,estimated}` — result.metadata.
    usage{inputTokens,outputTokens}가 유효한 음이 아닌 숫자면 {…,estimated:false}, 아니면
    {inputTokens:estimateTokens(prompt), outputTokens:estimateTokens(result.stdout), estimated:true}.
  - `aggregateTeamRunUsage(teamRun): UsageAggregate` — usage 있는 role을 assignedAgentId별
    합산(input/output/total/roles) + 총합 + anyEstimated. 순수.
  - `core/src/index.ts` export.
- 수정: `teamRun.schema.ts`(`TeamRunRoleUsageSchema{inputTokens,outputTokens int≥0, estimated
  bool}` + `TeamRunRoleSchema.usage` optional). `TeamRunExecutor.ts`(역할 완료 시
  `readOrEstimateUsage(prompt, result)` 산출 → replaceRole에 usage 포함; prompt 접근 위해
  invokeWorker가 usage를 계산·반환하거나 prompt를 노출; `teamRun.role.completed` payload에 usage
  요약 추가). `commands/project.ts`(`plan run show` 텍스트에 "토큰 사용량(추정/실측)" 섹션 —
  aggregateTeamRunUsage 결과를 플랫폼별 표 + 총합 + anyEstimated 주석).
- 테스트: usage(추정 경계/실측 우선/집계 플랫폼별·anyEstimated), executor(완료 시 usage 저장,
  resume 보존), CLI(show 사용량 표·추정 주석).

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용). Swift(`apps/macos/**`) 금지.
- 실제 codex/claude usage 파싱/디스패치 금지(StubWorker 유지 — 추정 경로만). 기존 `Run`/CLI
  동작 변경 금지(회귀 0). 구독 잔량/계정 토큰/credential/HTTP 접근 금지.

### Step-by-Step Plan
1. 설계/태스크 + 기존 teamRuns 코드 읽기.
2. `usage.ts`(estimate/readOrEstimate/aggregate) + 테스트.
3. `teamRun.schema.ts` usage 필드 + 봉투 회귀 테스트.
4. `TeamRunExecutor.ts`: 완료 시 usage 산출·저장 + 이벤트. 테스트(저장/resume 보존).
5. `commands/project.ts`: `plan run show` 사용량 섹션 + 테스트.
6. 전체 게이트 + 자체 diff 리뷰 + 최종 요약(추정/실측 구분·플랫폼별·stub 명시).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
명령 미실행/실패는 정직히 보고.

### Acceptance Criteria
`.baton/runs/token-usage-v0.19.2/acceptance-criteria.md` AC-01~10. 특히: 추정/실측 구분
(AC-02/03), 플랫폼별 집계(AC-04), 완료 시 usage 영속·resume(AC-05/06), show 표시(AC-07/08),
선택 필드 회귀 0(AC-09/10).

### Constraints
- 추정 ≠ 실측: `estimated` 플래그 + 표시 병기로 정직하게. 구독 잔량/credential 접근 금지.
- 순수 로직(usage.ts) 분리. `usage` 영속으로 resume 안전. stub 기본 유지.
- base=`origin/main`. commit/push 금지. UI/CLI 한국어, 식별자/필드 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Usage Behavior (실측 metadata.usage 우선 / 없으면 추정 / 플랫폼별 집계 / resume 보존)
## Honesty (estimated 플래그·표시 병기, 구독 잔량 미제공 이유)
## Risks / TODOs (실제 usage 파싱·예산 게이트·USD 환산·Swift 후속)
## Notes for Reviewer (순수 usage.ts, 선택 필드 회귀 0, stub 추정)
```
명령 미실행/테스트 실패는 정직히 보고.
