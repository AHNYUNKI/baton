# Implementation Design — context-relay-v0.19.1

## Summary

v0.19 실행 골격에 **컨텍스트 릴레이**를 추가한다. 역할 AI를 호출(=트리거)하기 직전, 그 역할의
**보고 체인 상위 역할**(reportsTo 상향: root→…→직속 부모) 중 **완료된** 것들의 요약·산출물
경로를 요청 프롬프트에 동봉한다. 단방향·이벤트 트리거·역할당 1회 호출을 유지하고, **토큰
효율**을 위해 보고 체인만(전체 누적 금지)·요약 절단·산출물은 경로 참조로 제한한다. 역할 완료
시 `summary`를 role에 영속해 resume·관찰에 대비한다. **stub·headless**(실제 디스패치 다음,
Swift 그 다음).

## Scope

### In Scope
- 순수 `collectUpstream`(보고 체인 상위 roleId, 사이클 방어), `summarizeResult`(절단 요약).
- `buildRolePrompt`에 "Upstream Context" 섹션(완료 상위의 이름/담당AI/상태/요약/산출물 경로).
- `TeamRunRole.summary?`(선택 필드) — 완료 시 영속.
- `TeamRunExecutor`: 완료 시 summary 저장, 호출 전 upstream 주입, 트리거 이벤트에
  `upstreamRoleIds`. 릴레이 예산 옵션(maxChars 등).
- 테스트(순수 + 실행기 릴레이 + resume).

### Out of Scope
- 실제 codex/claude 디스패치(다음 마일스톤). Swift 모니터/라이브 점등(그 다음).
- 명시적 데이터 의존(`dependsOn`), 형제/전역 누적 릴레이, 양방향 대화/상시 LLM 대표, 병렬.

## Proposed Architecture

### 릴레이 경로 = 보고 체인 (토큰 경계 명확)
역할 R의 upstream = R.reportsTo 체인을 root까지 따라간 상위들(자기 제외), **root→…→부모**
순서. 사이클/미존재 부모는 끊김(상위 없음)으로 방어(order.ts의 `hasCyclicAncestry` 패턴 재사용).
→ O(트리 깊이). 전체 역할 누적이 아님(토큰 절약).

### 순수 함수
```ts
// collectUpstream.ts
export function collectUpstreamRoleIds(roleId: string, teamPlan: TeamPlan): string[]
//  보고 체인 상위 roleId를 root→부모 순으로. 자기 제외. 사이클/미존재 부모 방어(끊김).

// summarizeResult.ts
export function summarizeWorkerResult(result: WorkerRunResult, maxChars?: number): string
//  result.stdout(성공) 또는 stderr(실패)를 maxChars(기본 1500)로 절단 + 절단 표시('…(truncated)').
//  공백/빈 출력 → 간단한 상태 문구. 순수.
```

### 프롬프트 — buildRolePrompt (수정)
입력에 `upstream?: UpstreamContextEntry[]` 추가.
```ts
type UpstreamContextEntry = { roleId; name; assignedAgentId; status; summary; artifacts: string[] }
```
"## Upstream Context (대표가 전달한 이전 작업 결과)" 섹션 렌더:
- 각 항목: `- {name} ({roleId}, {assignedAgentId}, 상태:{status})` + 요약(절단됨) + 산출물 경로 목록.
- 산출물은 **경로만**(내용 미첨부 — 다운스트림이 worktree/runDirectory에서 직접 읽음).
- upstream 비었으면 섹션 생략 또는 "(이전 단계 없음)". 기존 섹션은 유지.

### 스키마 — teamRun.schema (수정, 추가)
`TeamRunRoleSchema`에 `summary: z.string().optional()`. 완료 시 set(절단 요약). 선택 필드라
기존 team-run/readApi 회귀 0. (관찰용 — 후속 모니터가 표시 가능.)

### 실행기 — TeamRunExecutor.executeFrom (수정)
- 호출 직전: `const upstreamIds = collectUpstreamRoleIds(roleId, teamPlan)`;
  `const upstream = upstreamIds.map(id => teamRun.roles.find(r => r.roleId === id))
     .filter(r => r?.status === "completed").map(toUpstreamEntry)`;
  `invokeWorker(... )` → `buildRolePrompt({..., upstream})`.
- 트리거 이벤트: `teamRun.role.started` payload에 `upstreamRoleIds` 추가(관찰/트리거 가시화).
- 역할 성공 완료 시: `summary = summarizeWorkerResult(result, relayMaxChars)`를 role에 저장
  (`replaceRole`에 summary 포함). 실패 시 summary 생략(또는 stderr 절단 — 선택).
- **resume 안전**: upstream을 메모리가 아니라 **영속된 teamRun.roles[].summary**에서 읽으므로,
  중단 후 재개해도 이전 완료 역할의 요약이 그대로 전달됨.
- 릴레이 예산 옵션: `TeamRunExecutorOptions.relayMaxChars?`(기본 1500). (필요 시
  `relayMaxUpstreamRoles?`도 — 기본 무제한이나 보고 체인이라 깊이로 자연 제한.)

### 이벤트 트리거 프레이밍
실행기의 완료→다음 호출이 곧 "트리거"이며, `teamRun.role.started{upstreamRoleIds}` +
`teamRun.role.completed`가 `events.jsonl`/`baton watch`로 스트림된다(SSE형). 별도 pub/sub
버스는 도입하지 않는다(순차 단일 프로세스엔 불필요 — 후속 병렬/분산 시 검토).

## File-Level Plan
| File | Change |
|---|---|
| `packages/core/src/teamRuns/collectUpstream.ts`(신규) | 보고 체인 상위 roleId(순수) |
| `packages/core/src/teamRuns/summarizeResult.ts`(신규) | 결과 절단 요약(순수) |
| `packages/core/src/teamRuns/buildRolePrompt.ts` | upstream 섹션 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | summary 저장 + upstream 주입 + 이벤트 |
| `packages/schemas/src/teamRun.schema.ts` | `TeamRunRole.summary?` |
| `packages/core/src/index.ts` | 신규 export |
| 각 `*.test.ts` | 순수/실행기/resume 테스트 |

## Data Model Changes
`TeamRunRole.summary?`(선택) 추가. 그 외 불변. team-run 봉투는 자동 통과(회귀 0).

## API / CLI Changes
없음. 기존 `plan run` 명령 그대로(프롬프트 내용만 풍부해짐). watch 이벤트에 `upstreamRoleIds`
추가(추가 필드, 하위호환).

## Error Handling
- 보고 체인 사이클/미존재 부모 → 상위 없음으로 방어(릴레이 빈 섹션).
- 미완료/실패 상위 → 컨텍스트에서 제외(혼란 방지) 또는 상태만 표기(요약 없음).
- 요약 초과 길이 → 강제 절단(토큰 가드).

## Security Considerations
- 단방향·역할당 1회 유지(상시 루프 없음 → 비용·폭주 방지).
- 산출물은 경로 참조(내용을 프롬프트에 통째로 싣지 않음 → 토큰·민감정보 노출 최소).
- stub 기본(실제 외부 호출 없음). worktree 격리·base≠main(기존) 불변. credential/HTTP 없음.

## Test Plan
`test-plan.md`. 순수(collectUpstream 체인/사이클, summarize 절단) + buildRolePrompt(섹션 유무) +
실행기(자식이 부모 요약 수신·형제 무관 컨텍스트 미수신·summary 영속·resume 릴레이) + 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~10.

## Non-Goals
실제 디스패치, Swift, dependsOn/형제/전역 누적, 양방향 대화, 병렬.

## Review Checklist
- [ ] 릴레이 경로 = 보고 체인만(전체 누적 아님). 요약 절단. 산출물 경로 참조(내용 미첨부).
- [ ] `collectUpstream`/`summarizeResult` 순수·테스트. 사이클 방어.
- [ ] 자식 프롬프트에 부모 요약 포함, 무관 형제 컨텍스트 미포함(테스트).
- [ ] `summary` 영속 → resume 시 릴레이 유지. 트리거 이벤트 `upstreamRoleIds`.
- [ ] 단방향·1회 호출·stub 유지. team-run/Run/CLI 회귀 0. Swift/실제 디스패치 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-context-relay
  -b baton/context-relay-v0.19.1 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(schemas/core). **Swift 변경 금지. 실제 codex/claude 디스패치 금지(stub 유지).**
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- 머지 후 worktree 즉시 제거. **commit/push 금지**(리뷰 후 본 에이전트 진행).

### Goal
v0.19 TeamRun 실행에 **컨텍스트 릴레이**를 추가한다. 역할 호출 직전, 그 역할의 **보고 체인
상위(reportsTo 상향, root→부모)** 중 **완료된** 역할들의 요약·산출물 경로를 프롬프트에 동봉.
단방향·이벤트 트리거·역할당 1회 호출 유지. **토큰 효율**: 보고 체인만(전체 누적 금지), 요약은
maxChars 절단, 산출물은 **경로만**(내용 미첨부). 완료 시 `summary`를 role에 영속(resume·관찰).

성공 기준: 자식 역할의 프롬프트에 부모 요약이 들어가고, 무관한 형제 컨텍스트는 안 들어가며,
요약이 절단되고, resume 후에도 상위 요약이 유지되는 것(전부 stub·headless로 결정적 검증) + 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/context-relay-v0.19.1/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드: `teamRuns/order.ts`(hasCyclicAncestry 패턴), `buildRolePrompt.ts`,
   `TeamRunExecutor.ts`(executeFrom/replaceRole/roleEvent), `teamRun.schema.ts`,
   `workers/WorkerAdapter.ts`(WorkerRunResult), `StubWorker.ts`.
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- 신규: `packages/core/src/teamRuns/collectUpstream.ts`
  (`collectUpstreamRoleIds(roleId, teamPlan): string[]` — 보고 체인 root→부모, 자기 제외,
  사이클/미존재 방어), `packages/core/src/teamRuns/summarizeResult.ts`
  (`summarizeWorkerResult(result, maxChars=1500): string` — stdout(성공)/stderr(실패) 절단 +
  '…(truncated)' 표시, 빈 출력 처리). 둘 다 순수.
- 수정: `buildRolePrompt.ts`(입력에 `upstream?: UpstreamContextEntry[]` 추가 + "Upstream
  Context" 섹션; 비면 생략; 산출물은 경로만). `teamRun.schema.ts`(`TeamRunRoleSchema`에
  `summary: z.string().optional()`). `TeamRunExecutor.ts`(호출 전 collectUpstream→완료 상위만
  매핑→buildRolePrompt에 전달; `teamRun.role.started` payload에 `upstreamRoleIds`; 성공 완료
  시 `summary = summarizeWorkerResult(result, relayMaxChars)`를 role에 저장; `relayMaxChars?`
  옵션 기본 1500; resume 시 영속 summary에서 upstream 구성). `core/src/index.ts` export.
- 테스트: collectUpstream/summarizeResult(순수), buildRolePrompt(섹션 유무), TeamRunExecutor
  (부모 요약 수신·형제 무관 미수신·summary 영속·resume 릴레이).

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용). Swift(`apps/macos/**`) 금지.
- 실제 codex/claude 디스패치 금지(StubWorker 유지). 기존 `Run`/CLI 명령 동작 변경 금지(회귀 0).
- 양방향 대화/상시 LLM 대표/병렬/`dependsOn`/형제·전역 누적 릴레이 금지. credential/HTTP 금지.

### Step-by-Step Plan
1. 설계/태스크 + 기존 teamRuns 코드 읽기.
2. `summarizeResult.ts`(절단) + 테스트.
3. `collectUpstream.ts`(보고 체인, 사이클 방어) + 테스트.
4. `teamRun.schema.ts` `summary?` + 봉투 회귀 테스트.
5. `buildRolePrompt.ts` upstream 섹션 + 테스트(있음/없음, 산출물 경로만).
6. `TeamRunExecutor.ts`: 완료 시 summary 저장, 호출 전 upstream 주입, 이벤트 upstreamRoleIds.
   테스트(부모 요약 수신/형제 무관/summary 영속/resume).
7. 전체 게이트 + 자체 diff 리뷰 + 최종 요약(릴레이 경로=보고 체인·절단·경로참조·stub 명시).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
명령 미실행/실패는 정직히 보고.

### Acceptance Criteria
`.baton/runs/context-relay-v0.19.1/acceptance-criteria.md` AC-01~10. 특히: 보고 체인 릴레이
(AC-02/05), 절단/토큰 가드(AC-03), 산출물 경로 참조(AC-06), summary 영속·resume(AC-07/08),
단방향·1회·stub 유지(AC-09), 회귀 0(AC-10).

### Constraints
- 릴레이 = **보고 체인만**(전체 누적 금지). 요약 절단·산출물 경로 참조(내용 미첨부) — **토큰 효율**.
- 순수 로직(collectUpstream/summarizeResult) 분리. `summary` 영속으로 resume 안전.
- 단방향·역할당 1회·stub 유지. base=`origin/main`. commit/push 금지. UI/CLI 한국어, 식별자 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Relay Behavior (보고 체인 상위 요약 동봉 / 형제 무관 미포함 / 절단 / 산출물 경로참조 / resume 유지)
## Token Guard (보고 체인 한정, maxChars 절단, 산출물 내용 미첨부)
## Risks / TODOs (실제 디스패치·Swift 모니터 후속, dependsOn/형제 릴레이 미구현)
## Notes for Reviewer (순수 collectUpstream/summarizeResult, summary 영속, 단방향·stub 유지)
```
명령 미실행/테스트 실패는 정직히 보고.
