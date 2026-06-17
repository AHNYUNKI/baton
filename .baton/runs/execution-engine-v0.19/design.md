# Implementation Design — execution-engine-v0.19

## Summary

확정 TeamPlan을 실행하는 **오케스트레이션 골격**을 신설한다. 기존 `Run`에 결합하지 않고
포트(worktree/events/artifacts/clock/worker)를 재사용하는 얇은 **`TeamRun` + `TeamRunExecutor`**.
계층(reportsTo) 순서로 역할을 **순차** 디스패치하고, **단일 pre-dispatch 승인 게이트**와
**worktree 격리**를 둔다. 실제 일꾼은 **StubWorker 기본**(실제 파일 변경/외부 CLI 없음 — 골격
검증). 역할 상태는 read API `team-run`으로 노출되어 조직도가 라이브 점등(v0.19.1).

**2단계 전달**:
- **v0.19 (본 설계)**: 코어 엔진 + read API + CLI(headless). `pnpm`만으로 전 루프 검증.
- **v0.19.1 (후속)**: Swift 실행 모니터 + 조직도 라이브 점등 + 승인/거부 UI.

## Scope

### In Scope (v0.19)
- `teamRun.schema.ts`: `TeamRun`/`TeamRunRole`/상태 enum.
- `readApi.schema.ts`: `team-run`, `team-run-list` 봉투(+ watch 이벤트 재사용).
- core `teamRuns/`: `order.ts`(위상 순서), `AgentWorkerRegistry.ts`(agentId→adapter),
  `buildRolePrompt.ts`, `TeamRunStore.ts`(원자 영속), `TeamRunExecutor.ts`(start/decide/resume).
- CLI: `baton project plan run start|approve|reject|show|list`.
- 전부 순수/포트 주입형 → 단위 테스트. StubWorker 기본.

### Out of Scope
- Swift UI(v0.19.1). 실제 codex/claude 디스패치 기본화(opt-in 훅만 남기고 기본 stub).
- 병렬 형제 실행, 역할별 게이트, fix 루프, 재위임/동적 역할 추가(후속).
- 기존 Run 파이프라인 변경.

## Proposed Architecture

### 데이터 모델 — `teamRun.schema.ts` (신규)
```ts
TeamRunRoleStatus = z.enum(["planned","running","completed","failed","skipped"])
TeamRunStatus     = z.enum(["planned","awaiting-approval","running","completed","failed","cancelled"])

TeamRunRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1),
  assignedAgentId: z.string().min(1),
  status: TeamRunRoleStatus,
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
  artifacts: z.array(z.string().min(1)).optional()
})

TeamRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  status: TeamRunStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  order: z.array(z.string().min(1)),         // 실행 순서(roleId)
  roles: z.array(TeamRunRoleSchema),
  worktreePath: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  approvals: z.array(ApprovalSchema).optional()   // 기존 ApprovalSchema 재사용(pre-dispatch)
})
```

### 실행 순서 — `order.ts` (순수)
`computeExecutionOrder(teamPlan): string[]` — reportsTo 위상 정렬: 대표 직속(root) tier 먼저,
이어서 각 부모의 자식(BFS), 동일 tier 형제는 plan 배열 순서. (사이클은 planner의
normalizeHierarchy가 이미 제거 → 여기선 root 취급. 방어적으로 미방문 잔여도 말미에 append.)

### Agent 워커 해석 — `AgentWorkerRegistry.ts`
```ts
class AgentWorkerRegistry { register(agentId, adapter); resolve(agentId): WorkerAdapter | undefined }
createAgentWorkerRegistry({codex?, claude?, runner?}): { registry, ... }  // 기본 둘 다 StubWorker
```
assignedAgentId(codex/claude)로 adapter 해석. opt-in 시 실제 어댑터, 기본 StubWorker.
미등록 agentId → StubWorker fallback(골격 관대) + reason 기록.

### 프롬프트 — `buildRolePrompt.ts` (순수)
`buildRolePrompt({project, role, teamPlan, runDirectory}): string` — 대표/프로젝트 overview +
역할 name/description + **role.instructions**(한국어) + 산출물 경로 안내. (StubWorker는 무시하나
실제 디스패치 대비 구조 확보.)

### 실행기 — `TeamRunExecutor.ts`
포트 주입: `{ projectService, teamRunStore, artifactStore, worktreeManager, agentWorkerRegistry,
clock?, worktreeRoot?, timeoutMs? }`.
- `start(projectId, {baseBranch, timeoutMs?})`:
  1. project + teamPlan 로드(없으면 친절한 오류). order 계산.
  2. base = baseBranch ?? "main" — **main 직접 변경 금지**: worktree에서만 작업.
  3. worktree 생성(`worktreeManager.createWorktree`). 실패 → status failed.
  4. TeamRun 생성: roles 전부 `planned`, status **`awaiting-approval`** + pending Approval
     (단일 pre-dispatch 게이트). 저장 후 반환(**승인 전 디스패치 없음**).
- `decide(teamRunId, {decision, note?})`:
  - `approved` → Approval 갱신, status `running`, `executeFrom` 호출.
  - `rejected` → 모든 planned 역할 `skipped`, status `cancelled`, 저장.
- `executeFrom(teamRun)` (순차 디스패치):
  - order의 각 roleId(비종료 상태): `running` + event(`teamRun.role.started`) + 저장 →
    `agentWorkerRegistry.resolve(assignedAgentId)` → `buildRolePrompt` → `adapter.run({cwd:
    worktreePath, prompt, metadata})` → 아티팩트/이벤트 기록 → `completed`/`failed`.
  - 실패 시: 잔여 역할 `skipped`, status `failed`, 반환(골격: fix 루프 없음).
  - 전부 성공 → status `completed`.
- `resume(teamRunId)`: 승인됨+running/awaiting에서 첫 비종료 역할부터 재개(중단 복구).
- 이벤트: `events.jsonl`에 `teamRun.started/role.started/role.completed/role.failed/
  teamRun.completed/teamRun.failed/teamRun.cancelled`(EventLogger 재사용).
- 영속: `TeamRunStore`(원자 저장, RunStore 패턴). 위치: `.baton/runs/<teamRunId>/team-run.json`
  + `logs/`, `steps/`(ArtifactStore 재사용). teamRunId는 run id와 동일 네임스페이스(충돌 없는 uuid).

### Read API — `team-run` / `team-run-list`
- `TeamRunEnvelopeSchema`(kind "team-run", data TeamRunSchema), `TeamRunListEnvelopeSchema`
  (kind "team-run-list", data {teamRuns: TeamRunSummary[]}). watch 이벤트는 기존 스트림 재사용.
- 조직도 라이브(v0.19.1): app이 `team-run.roles[].status` → `statusByRole[roleId]` →
  `buildOrgChart(statusByRole:)`. (Swift 모델은 이미 지원.)

### CLI — `baton project plan run ...`
```
baton project plan run start  <projectId> [--base <branch>] [--json]   # awaiting-approval 반환
baton project plan run approve <teamRunId> [--note <t>] [--json]        # 디스패치 진행
baton project plan run reject  <teamRunId> [--note <t>] [--json]        # 취소
baton project plan run show    <teamRunId> [--json]                     # team-run 봉투
baton project plan run list    <projectId> [--json]                     # team-run-list
# 라이브: 기존 `baton watch` 재사용
```
워커 기본 = **stub**(골격). `--codex`/`--claude` opt-in 플래그는 자리만 마련(기본 비활성).

## File-Level Plan
| File | Change |
|---|---|
| `packages/schemas/src/teamRun.schema.ts`(신규) | TeamRun/Role/상태 |
| `packages/schemas/src/readApi.schema.ts` | team-run, team-run-list 봉투 |
| `packages/schemas/src/index.ts` | export |
| `packages/core/src/teamRuns/order.ts`(신규) | 위상 실행 순서 |
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts`(신규) | agentId→adapter |
| `packages/core/src/teamRuns/buildRolePrompt.ts`(신규) | 역할 프롬프트 |
| `packages/core/src/teamRuns/TeamRunStore.ts`(신규) | 원자 영속 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts`(신규) | start/decide/resume/executeFrom |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/project.ts` | `plan run` 하위명령 + 도움말 |
| `packages/cli/src/registry.ts` | createAgentWorkerRegistry(필요 시 위임) |
| 각 `*.test.ts` | 순서/실행기/스토어/CLI 테스트 |

## Data Model Changes
신규 `TeamRun`(별도). 기존 `Run`/`Project`/`TeamPlan` **불변**. ApprovalSchema 재사용.

## API / CLI Changes
read API에 team-run/team-run-list **추가**(기존 종류 불변). CLI에 `plan run` 하위명령 추가.

## Error Handling
- teamPlan 없음/프로젝트 없음 → 친절한 오류(비영 exit, 한국어 메시지).
- worktree 생성 실패 → status failed + reason.
- 워커 실패 → 역할 failed, 잔여 skipped, teamRun failed(골격).
- 잘못된 상태 전이(예: 승인 없는데 approve 대상 아님) → 명확한 오류.
- base=main 방지: worktree 외 작업 금지(기존 격리 패턴).

## Security Considerations
- **pre-dispatch 승인 게이트**: 사람 승인 전 어떤 디스패치도 없음.
- **worktree 격리**: 항상 worktree에서만(메인 브랜치 직접 변경 금지).
- **StubWorker 기본**: 골격은 실제 파일 변경/외부 CLI 호출 없음(opt-in 시에만 실제).
- bounded 순차(무한 루프 없음). credential 무접근. 네트워크/HTTP 없음.

## Test Plan
`test-plan.md`. 순수(order/buildRolePrompt) + 상태머신(start→awaiting, approve→완료, reject→
취소, 실패→정지, resume) + Store 원자성 + CLI(start/approve/reject/show/list) + 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~16.

## Non-Goals
Swift UI(v0.19.1), 실제 디스패치 기본화, 병렬/역할별 게이트/fix 루프/재위임, 기존 Run 변경.

## Review Checklist
- [ ] TeamRun 별도 — 기존 Run/명령/테스트 회귀 0.
- [ ] order 위상 정렬(root tier→자식, 형제 순차) 순수·테스트. 사이클 방어.
- [ ] pre-dispatch 승인 게이트(승인 전 디스패치 없음) + worktree 격리 + StubWorker 기본.
- [ ] start/decide/resume 상태 전이 + 실패 정지 + 이벤트/아티팩트, 테스트.
- [ ] CLI plan run start/approve/reject/show/list + team-run 봉투. credential/HTTP 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 v0.19(코어+CLI) 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-execution-engine
  -b baton/execution-engine-v0.19 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD`.
- 본 마일스톤은 **TypeScript 전용**(schemas/core/cli). **Swift 변경 금지**(v0.19.1).
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- 머지 후 worktree 즉시 제거. **commit/push 금지**(리뷰 후 본 에이전트 진행).

### Goal
확정 TeamPlan을 실행하는 **오케스트레이션 골격**을, 기존 `Run`에 결합하지 않고 포트를
재사용하는 **신규 `TeamRun` + `TeamRunExecutor`** 로 구현한다. 계층(reportsTo) 순서 **순차**
디스패치 + **단일 pre-dispatch 승인 게이트** + **worktree 격리** + **StubWorker 기본**.
역할 상태는 read API `team-run`으로 노출(조직도 점등은 v0.19.1). **실제 codex/claude 디스패치
기본화·Swift·병렬·fix 루프는 범위 밖.**

성공 기준은 "실제 코드 생성"이 아니라 **상태머신/순서/게이트/격리/이벤트의 정확성과 안전**
(StubWorker로 전 루프가 awaiting-approval→approve→순차 completed로 흐르고, reject→cancelled,
실패→정지가 결정적으로 동작 + 회귀 0).

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/execution-engine-v0.19/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드 패턴: `RunExecutor.ts`(게이트/이벤트/worktree/상태전이), `RunStore.ts`(원자 저장),
   `WorkerRegistry.ts`/`WorkerAdapter.ts`/`StubWorker.ts`, `cli/registry.ts`,
   `GitWorktreeManager.ts`, `EventLogger.ts`, `ArtifactStore.ts`, `ApprovalSchema`,
   `ProjectService.getTeamPlan`, `teamPlan.schema.ts`(reportsTo), `readApi.schema.ts`,
   `commands/project.ts`(plan generate/show/set).
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- 신규 schemas: `teamRun.schema.ts`(설계의 스키마 그대로) + `index.ts` export +
  `readApi.schema.ts`에 `TeamRunEnvelopeSchema`(kind "team-run")·`TeamRunListEnvelopeSchema`
  (kind "team-run-list", data {teamRuns: 요약[]}).
- 신규 core `teamRuns/`: `order.ts`(computeExecutionOrder, 순수), `AgentWorkerRegistry.ts`
  (+ `createAgentWorkerRegistry`, 기본 StubWorker), `buildRolePrompt.ts`(순수),
  `TeamRunStore.ts`(원자 저장·load/save/list, RunStore 패턴), `TeamRunExecutor.ts`
  (start/decide/resume/executeFrom). `core/src/index.ts` export.
- 수정 CLI `commands/project.ts`: `plan run start|approve|reject|show|list` 하위명령 +
  도움말. 기본 워커 stub. `--base`, `--note`, `--json`. (필요 시 `registry.ts`에
  createAgentWorkerRegistry 추가.)
- 테스트: order/AgentWorkerRegistry/buildRolePrompt/TeamRunStore/TeamRunExecutor/CLI plan run.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용).
- **Swift(`apps/macos/**`) 금지**(v0.19.1). 기존 `Run`/`RunExecutor`/`RunStore`/기존 CLI
  명령 동작 변경 금지(회귀 0). credential/HTTP/네트워크 금지.
- 실제 codex/claude 디스패치 **기본화 금지**(opt-in 자리만, 기본 stub). 병렬/역할별 게이트/
  fix 루프/재위임 금지.

### Step-by-Step Plan
1. 설계/태스크 + 기존 패턴(RunExecutor/RunStore/StubWorker/registry) 읽기.
2. `teamRun.schema.ts` + index export + readApi 봉투(team-run/team-run-list) + 테스트.
3. `order.ts`(위상 순서) + 테스트(다단계/형제/사이클 방어).
4. `AgentWorkerRegistry`(기본 stub) + `buildRolePrompt` + 테스트.
5. `TeamRunStore`(원자 저장) + 테스트.
6. `TeamRunExecutor`(start→awaiting / approve→순차 completed / reject→cancelled / 실패→정지 /
   resume) + 이벤트/아티팩트/worktree + 테스트(ProcessRunner/Clock/worktreeManager mock 주입).
7. CLI `plan run start/approve/reject/show/list` + 테스트(StubWorker 전 루프).
8. 전체 게이트 + 자체 diff 리뷰 + 최종 요약(StubWorker 기본·게이트·격리 명시).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
명령 미실행/실패는 정직히 보고.

### Acceptance Criteria
`.baton/runs/execution-engine-v0.19/acceptance-criteria.md` AC-01~16. 특히: 순서(AC-03/04),
pre-dispatch 게이트·승인 전 무디스패치(AC-06/07), 순차 실행·실패 정지(AC-08/09), reject 취소
(AC-10), resume(AC-11), worktree 격리·StubWorker 기본(AC-13/14), team-run 봉투·CLI(AC-12/15),
기존 Run 회귀 0(AC-16).

### Constraints
- 기존 Run에 결합 금지 — 포트만 재사용. 순수 로직 분리(order/prompt) + 주입형 포트(테스트 용이).
- pre-dispatch 승인 게이트·worktree 격리·StubWorker 기본·bounded 순차. base ≠ main.
- credential/HTTP 없음. UI/CLI 한국어 라벨, 식별자/플래그 영어. base=`origin/main`. commit/push 금지.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Execution Loop (start→awaiting / approve→순차 completed / reject→cancelled / 실패→정지 / resume)
## Safety (pre-dispatch 게이트, worktree 격리, StubWorker 기본, base≠main)
## Risks / TODOs (실제 디스패치·Swift 모니터 v0.19.1, 병렬/역할별 게이트/fix 후속)
## Notes for Reviewer (TeamRun 별도·기존 Run 회귀 0, 순수 order/prompt, 주입형 포트)
```
명령 미실행/테스트 실패는 정직히 보고.
