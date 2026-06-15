# Implementation Design

## Summary

v0.1 dry-run 계획을 실제 실행으로 확장하는 **Run 실행 엔진**을 추가한다. 신규
`RunExecutor`가 worktree 격리를 만들고 워크플로우 step을 순차 실행하며,
역할별 `WorkerRegistry`로 디스패치하고, `approve`/정책 게이트에서 멈추고,
`RunStore`로 상태를 영속화해 재개 가능하게 한다. `RunService`의 dry-run 계획은
유지한다. 실제 Codex 연결은 다음 마일스톤으로 분리하고, 이번엔 `StubWorker`로
엔진을 end-to-end 검증한다.

## Scope

### In Scope

- 스키마 확장: `RunStepStatus`, `awaiting-approval`, step/run optional 필드, 승인 결정
- `RunStore`(run.json 원자적 영속화 + 로드)
- `WorkerRegistry`(role→adapter), `ApprovalPolicy`, `StubWorker`
- `RunExecutor`: `start`/`resume`/`decide`, 순차 실행, worktree 격리, 승인 게이트,
  step별 로그/아티팩트/이벤트, 실패/스킵 처리
- CLI: `run <request>`(실행), `run status|resume|approve` (기존 `--dry-run` 유지)
- 단위/통합/보안 회귀 테스트

### Out of Scope

- 실제 Codex CLI 실행 연결(다음 마일스톤), SQLite 영속화, 동시 실행,
  worktree 자동 정리, 풍부한 prompt 컨텍스트 주입

## Proposed Architecture

```text
RunExecutor.start(request, opts)
  ├─ RunService.planRun(request, opts)        # 계획(steps) 재사용
  ├─ RunStore.save(run: running)              # 영속
  ├─ GitWorktreeManager.createWorktree(...)   # baton/<runId> 격리 1회
  └─ executeFrom(run, firstStep)
        for step in steps[startIndex:]:
          if isGate(step) and not approved(step):
            run.status = awaiting-approval; RunStore.save; return AWAITING
          if step.type == approve:            # 승인된 게이트
            step.completed; continue
          adapter = registry.resolve(step.role)
          if !adapter: step.skipped(reason); continue
          step.running; events.step.started
          result = try worker.run({cwd: worktreePath, prompt, timeoutMs})
                   catch → failure result
          write logs/<stepId>.{stdout,stderr}.log + step artifact
          step.status = result.success ? completed : failed
          events.step.(completed|failed); RunStore.save
          if failed: mark remaining skipped; run.failed; return FAILED
        run.completed; return COMPLETED

RunExecutor.decide(runId, decision, note?)
  └─ load → write Approval(decision, decidedAt) for current gate step → save

RunExecutor.resume(runId)
  └─ load → executeFrom(run, firstNonTerminalStep)
```

### Layering

- `cli → core → schemas` 유지. 엔진은 주입된 `WorkerRegistry`/`GitWorktreeManager`
  /`ArtifactStore`/`EventLogger`/`Clock`/`RunStore`에만 의존(provider-agnostic).
- 기본 CLI 레지스트리만 `CodexExecAdapter`/`StubWorker`를 알며, 코어 엔진은 모름.

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/run.schema.ts` | `RunStatus` += `awaiting-approval`; `RunStepStatus` 신규; `RunStep` += startedAt/completedAt/reason/artifacts; `Run` += worktreePath/baseBranch/updatedAt |
| `packages/schemas/src/approval.schema.ts` | += optional `decidedAt`, `note` |
| `packages/schemas/test/schemas.test.ts` | 신규 필드/상태/하위호환 테스트 추가 |
| `packages/core/src/runs/RunStore.ts` (신규) | save(원자적 temp→rename)/load(Zod 검증) |
| `packages/core/src/runs/RunService.ts` | `createRun` 유지; 계획 추출을 `planRun()`로 분리해 executor가 재사용(공개 동작 불변) |
| `packages/core/src/policies/ApprovalPolicy.ts` (신규) | `requiresApproval(stepType)`, 기본 `['implement','fix']` |
| `packages/core/src/workers/WorkerRegistry.ts` (신규) | `resolve(role)`, `register(role, adapter)` |
| `packages/core/src/workers/StubWorker.ts` (신규) | `WorkerAdapter` 구현, success + `stub:true` 메타/메시지 |
| `packages/core/src/runs/RunExecutor.ts` (신규) | start/resume/decide + 실행 루프 + prompt 빌드 |
| `packages/core/src/runs/buildStepPrompt.ts` (신규, 선택) | 요청+step+아티팩트 포인터 최소 prompt |
| `packages/core/src/index.ts` | 신규 공개 API 재export |
| `packages/cli/src/commands/run.ts` | execute/status/resume/approve 서브커맨드 분기 |
| `packages/cli/src/registry.ts` (신규) | 기본 WorkerRegistry(implementer→Stub 또는 Codex, 미연결→Stub) |
| `packages/cli/test/cli.test.ts` | run 서브커맨드 테스트 추가 |
| `packages/core/test/*` | RunStore/Registry/Policy/StubWorker/RunExecutor 테스트 |
| `README.md` | 실행/승인/재개 사용법, v0.2 비목표/TODO |

## Data Model Changes

```ts
// run.schema.ts
RunStatus = 'planned'|'running'|'awaiting-approval'|'completed'|'failed'|'cancelled'
RunStepStatus = 'planned'|'running'|'completed'|'failed'|'skipped'

RunStep = {
  id: string; type: WorkflowStepType; status: RunStepStatus;
  startedAt?: string; completedAt?: string; reason?: string; artifacts?: string[];
}
Run = {
  id; request; workflowId; projectId?; status: RunStatus; dryRun: boolean;
  createdAt: string; steps: RunStep[];
  worktreePath?: string; baseBranch?: string; updatedAt?: string;
}

// approval.schema.ts
Approval = {
  runId; stepId; status: 'pending'|'approved'|'rejected'; createdAt: string;
  decidedAt?: string; note?: string;
}
```

모든 신규 필드 optional → 기존 v0.1 run.json 하위호환. enum은 값 추가만.

## API / CLI Changes

신규 core 공개 API: `RunExecutor`, `RunStore`, `WorkerRegistry`,
`ApprovalPolicy`, `StubWorker`. `ExecutionResult = { run, outcome:
'completed'|'awaiting-approval'|'failed'|'cancelled' }`.

CLI(`baton run`):

| Form | 동작 |
|---|---|
| `run "<request>"` | 실행(worktree+step 루프), 결과/아티팩트 출력. 게이트면 안내 |
| `run "<request>" --dry-run` | (회귀) 계획만 출력 |
| `run status <runId>` | run+step 상태 출력 |
| `run resume <runId>` | 재개 |
| `run approve <runId>` / `--reject` | 승인/거부(approve는 decide+resume) |

## Workflow Changes

`RunExecutor`가 workflow step을 라이프사이클 상태기계로 구동:
- Run: planned → running → (awaiting-approval ↔ running) → completed|failed|cancelled
- Step: planned → running → completed|failed|skipped
게이트 통합 규칙: `isGate(step) = step.type==='approve' || policy.requiresApproval(step.type)`.

## Error Handling

- worker 호출은 try/catch로 감싸 실패를 step `failed`로 변환(throw 금지).
- RunStore.load 실패(없음/손상)는 명확한 에러. save는 temp→rename 원자성.
- CLI는 예상 사용자 오류(없는 runId 등) → 메시지+비정상 종료, 내부 예외와 구분.
- 부분 실패에도 항상 일관된 run.json을 남겨 재개 가능.

## Security Considerations

- mutating worker cwd는 항상 `worktreePath`. base/main 경로를 worker cwd로 전달
  금지. worktree 브랜치 `baton/<runId>`, main 직접 수정 경로 없음.
- credential 무접근, sandbox 기본 `workspace-write`, `danger-full-access` 금지.
- 미승인 게이트 step worker 호출 0회(테스트 단언).
- StubWorker는 실제 실행을 흉내내지 않고 명시적 스텁 결과만 반환.

## Test Plan

`test-plan.md` 참조. 요지: happy/failure/skip/gate/reject/resume 전 경로를 mock
worker·worktree·fixed Clock·temp $BATON_HOME로 검증. 미승인 worker 호출 0회,
완료 step resume 시 재호출 0회, cwd==worktreePath, 보안 grep 회귀.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-28 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-101 → task-110 의존성 순서를 따른다.
- v0.1 공개 동작(특히 `RunService.createRun` dry-run, 기존 테스트)을 깨지 말 것.
- 스키마 변경은 additive(모든 신규 필드 optional, enum 값 추가만).
- 실제 git worktree/Codex를 실행하는 코드 경로를 새로 만들지 말 것(엔진은
  주입된 매니저/어댑터 사용, 테스트는 mock, CLI 기본은 StubWorker).
- strict TS/ESM(.js 확장자), 런타임 의존성 추가 없음(zod/yaml 유지).
- 각 task마다 테스트 추가, 자체 diff 리뷰.

## Non-Goals

- 실제 Codex 실행 연결, SQLite 영속화, 동시 실행, worktree 자동 정리,
  풍부한 prompt 컨텍스트, 승인 UI.

## Review Checklist

- [ ] 미승인 게이트 step worker 호출 0회, 거부 시 cancelled.
- [ ] mutating worker cwd==worktreePath, main 직접 수정 경로 없음.
- [ ] worker 실패가 throw 아닌 step/run 상태로 표현, 잔여 skipped.
- [ ] resume가 완료 step worker 재호출 안 함, 첫 비종료부터.
- [ ] 매 step 종료마다 영속화, run.json 하위호환.
- [ ] dry-run/기존 v0.1 테스트 회귀 없음, 게이트 통합 규칙 일관.
- [ ] credential/`danger-full-access` 부재, 런타임 의존성 zod/yaml 유지.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### Goal

Baton v0.2 **Run 실행 엔진**을 구현한다. v0.1의 dry-run 계획을 실제 실행으로
확장한다: worktree 격리 + 역할별 워커 디스패치 + 승인 게이트 + step별 로그/
아티팩트/이벤트 + 재개 가능한 파일 기반 상태. 실제 Codex 실행 연결은 이번 범위가
아니며(다음 마일스톤), 미연결 역할은 `StubWorker`로 엔진을 end-to-end 검증한다.

성공 기준은 기능 완성도가 아니라 **안전한 실행 루프의 정확성과 테스트 가능성**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/run-engine-v0.2/design.md`
3. `.baton/runs/run-engine-v0.2/tasks.json`
4. `.baton/runs/run-engine-v0.2/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1 코드 컨벤션
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/runs/RunStore.ts`
- `packages/core/src/runs/RunExecutor.ts`
- `packages/core/src/runs/buildStepPrompt.ts`
- `packages/core/src/policies/ApprovalPolicy.ts`
- `packages/core/src/workers/WorkerRegistry.ts`
- `packages/core/src/workers/StubWorker.ts`
- `packages/cli/src/registry.ts`
- 신규 테스트: `packages/core/test/{runStore,workerRegistry,approvalPolicy,stubWorker,runExecutor}.test.ts`

### Files to Modify

- `packages/schemas/src/run.schema.ts` — `RunStatus`(+`awaiting-approval`),
  `RunStepStatus` 신규, `RunStep`/`Run` optional 필드 추가
- `packages/schemas/src/approval.schema.ts` — optional `decidedAt`, `note`
- `packages/schemas/test/schemas.test.ts` — 신규 필드/하위호환 테스트
- `packages/core/src/runs/RunService.ts` — 계획 추출 `planRun()` 분리(공개 동작 불변)
- `packages/core/src/index.ts` — 신규 공개 API 재export
- `packages/cli/src/commands/run.ts` — execute/status/resume/approve 서브커맨드
- `packages/cli/test/cli.test.ts` — run 서브커맨드 테스트
- `README.md` — 실행/승인/재개 사용법, v0.2 비목표/TODO

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 실제 git worktree/Codex를 강제 실행하는 코드 경로 신규 작성 금지.
- 런타임 의존성 추가 금지(`zod`, `yaml` 유지). 네이티브 의존 금지.

### Step-by-Step Implementation Plan

1. `.baton/runs/run-engine-v0.2/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. 스키마 확장(additive): `RunStepStatus`, `awaiting-approval`, step/run optional
   필드, Approval 결정 필드 + 하위호환 테스트. (task-101)
3. `RunStore`(temp→rename 원자적 save, Zod 검증 load) + 테스트. (task-102)
4. `ApprovalPolicy`(기본 `['implement','fix']`) + `WorkerRegistry`(role→adapter) +
   `StubWorker`(success, `stub:true` 명시) + 테스트. (task-103)
5. `RunService.planRun()` 추출(기존 dry-run 동작 불변 유지). (task-104)
6. `RunExecutor.start`: run 생성(running), worktree 1회 생성, step 순차 실행,
   로그/아티팩트/이벤트, 실패→failed+잔여 skipped, 미등록 역할→skipped, 매 step
   영속화 + 테스트(happy/failure/skip, cwd==worktreePath). (task-105)
7. 승인 게이트: `isGate` 통합 규칙, 미승인 도달 시 `awaiting-approval` 반환 +
   다운스트림 미실행, `decide` 기록, 거부→cancelled + 테스트(미승인 worker 0회). (task-106)
8. `resume`: 첫 비종료 step부터, 완료 step worker 재호출 0회 + 테스트. (task-107)
9. CLI `run` 서브커맨드(execute/status/resume/approve) + 기본 `registry.ts`
   (미연결 역할→StubWorker, 스텁 경고 출력) + dry-run 회귀 유지 + 테스트. (task-108)
10. core `index.ts` 재export 정리, `README.md` 갱신, 보안 grep 회귀 테스트. (task-109)
11. 전체 게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-110)

### Test Commands

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
node packages/cli/dist/main.js run --help
```

명령 미실행/실패는 성공으로 위장하지 말고 그대로 보고.

### Acceptance Criteria

`.baton/runs/run-engine-v0.2/acceptance-criteria.md`의 AC-01 ~ AC-28 전부 충족.
특히: 미승인 게이트 worker 호출 0회(AC-14/25), cwd==worktreePath(AC-09),
worker 실패가 throw 아닌 상태로(AC-11), resume 재호출 0회(AC-18), 하위호환(AC-05),
dry-run 회귀 없음(AC-20).

### Constraints

- strict TS, ESM(NodeNext), 상대 임포트 `.js`, export 함수 명시 반환 타입.
- 런타임 의존성 `zod`/`yaml`만, 네이티브 의존 금지.
- 엔진은 provider-agnostic — 주입된 registry/worktreeManager/store에만 의존.
- worktree 격리 필수, mutating worker cwd=worktreePath, main 직접 수정 금지.
- credential 무접근, sandbox 기본 `workspace-write`, `danger-full-access` 금지.
- worker 실패는 상태로 표현(throw 금지). 매 step 종료마다 영속화(재개 가능).
- 작업은 새 브랜치/worktree에서. **commit/push 하지 말 것**(명시 요청 전까지).
- 과도한 추상화 금지.

### Expected Final Summary Format

```md
## Summary
- 무엇이 / 왜 바뀌었는지

## Changed Files
| File | Change |
|---|---|

## Commands Run
| Command | Result |
|---|---|

## Tests
- Passing:
- Failing:
- Not run:

## Risks / TODOs
- 실제 Codex 실행 연결, SQLite 영속화, worktree 정리 등 남은 항목

## Notes for Reviewer
- 게이트 무실행 보장, cwd 격리, resume 멱등, 하위호환을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
