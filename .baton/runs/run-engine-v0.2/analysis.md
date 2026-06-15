# Analysis

## User Request

v0.1 부트스트랩 위에 **Run 실행 엔진**을 얹는다. dry-run 계획을 실제 실행으로
확장하되, worktree 격리·역할별 워커 디스패치·승인 게이트·재개 가능한 상태
영속화·step별 아티팩트를 모두 안전하게 갖춘다.

## Intent

Baton이 "계획만 출력"하는 도구에서 "역할 기반 워커를 실제로 조율하는
오케스트레이터"로 처음 동작하게 만드는 것. 가치의 핵심은 *안전한 실행 루프*다:
격리(worktree) + 게이트(승인) + 관찰가능성(이벤트/로그/아티팩트) + 재개(영속 상태).
실제 Codex 호출 자체는 다음 마일스톤으로 분리해, 이번엔 엔진의 정확성·안전성·
테스트 가능성에 집중한다.

## Current Repository Understanding

v0.1(merged, PR #1) 기준 관련 모듈:

- `packages/core/src/runs/RunService.ts` — `createRun(request, {dryRun})`.
  non-dryRun은 `throw new Error("Baton v0.1 only supports dry-run planning.")`.
  workflow 선택, runId 생성, `request.md`+`run.json`(status `planned`) 기록,
  `worker`/`worktreeManager`는 주입받지만 호출하지 않음(`void`).
- `packages/core/src/workers/WorkerAdapter.ts` — 공통 워커 인터페이스(`run`).
- `packages/core/src/workers/codex/CodexExecAdapter.ts` — ProcessRunner 기반
  skeleton(기본 sandbox `workspace-write`, timeout 지원).
- `packages/core/src/git/GitWorktreeManager.ts` — `createWorktree`/`removeWorktree`
  /`list`, 브랜치 `baton/<runId>`, base 기본 `main`, 인자 배열 전달.
- `packages/core/src/artifacts/ArtifactStore.ts` — `writeArtifact`/`readArtifact`.
- `packages/core/src/events/EventLogger.ts` — Clock 주입 JSONL append.
- `packages/core/src/ports/{ProcessRunner,Clock}.ts` — 주입 포트 + mock 헬퍼.
- `packages/schemas/src/run.schema.ts` — `RunStatus`(planned|running|completed|
  failed|cancelled), `RunStep{id,type,status}`, `Run{...,status,dryRun,createdAt,steps}`.
- `packages/cli/src/commands/run.ts` — `run <request> --dry-run`.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/run.schema.ts` | 상태/타임스탬프/worktreePath/step 필드 확장 |
| `packages/schemas/src/approval.schema.ts` | 승인 결정 필드(decidedAt/note) 확장 |
| `packages/core/src/runs/RunService.ts` | dry-run 계획 로직 재사용(실행과 분리 유지) |
| `packages/core/src/runs/RunStore.ts`(신규) | run.json 읽기/쓰기, 재개용 상태 |
| `packages/core/src/runs/RunExecutor.ts`(신규) | 실행 루프 코어 |
| `packages/core/src/workers/WorkerRegistry.ts`(신규) | role → adapter 해석 |
| `packages/core/src/workers/StubWorker.ts`(신규) | 미연결 역할용 안전 스텁 |
| `packages/core/src/policies/ApprovalPolicy.ts`(신규) | 승인 필요 step 타입 정책 |
| `packages/core/src/git/GitWorktreeManager.ts` | 실행 시 실제 worktree 생성에 사용 |
| `packages/core/src/events/EventLogger.ts` | step 라이프사이클 이벤트 |
| `packages/cli/src/commands/run.ts` | execute/status/resume/approve 서브커맨드 |

## Existing Behavior

`baton run <request> --dry-run`만 의미 있게 동작. non-dry-run은 명시적 throw.
worker/worktree는 주입되지만 절대 호출되지 않음(테스트로 고정).

## Target Behavior

- `baton run "<request>"` → run 생성(status `running`), worktree 격리 생성,
  step 순차 실행, 승인 게이트에서 일시중지, step별 로그/아티팩트/이벤트 기록.
  완료 시 `completed`, 워커 실패 시 `failed`(잔여 step `skipped`).
- 게이트 도달 시 status `awaiting-approval`로 영속화 후 반환(다운스트림 미실행).
- `baton run approve <runId> [--reject]` → 승인/거부 기록(거부 시 `cancelled`).
- `baton run resume <runId>` → 영속 상태에서 첫 비종료 step부터 계속.
- `baton run status <runId>` → run + step 상태 출력.

## Constraints

- worktree 격리 필수. mutating worker는 cwd=worktree에서만. main 직접 수정 경로
  없음. base 브랜치는 worktree 브랜치 생성 입력으로만 사용(읽기 전용).
- credential 무접근, `danger-full-access` 기본값 금지, sandbox 기본 `workspace-write`.
- worker 실패는 throw가 아닌 `WorkerRunResult`/step 상태로. 엔진은 부분 실패에도
  일관된 영속 상태를 남긴다.
- 모든 I/O 포트 주입, 네트워크/실제 git/실제 codex 의존 테스트 금지.

## Assumptions

### Safe

- 실행 상태는 v0.2에서 파일 기반(run.json) — SQLite는 후속.
- worktree 경로는 Baton 홈 하위(`<batonHome>/worktrees/<runId>`)로 repo 워킹트리
  밖에 둔다(중첩 worktree 회피).
- step 실행은 순차. 동시성 없음.
- 미연결 역할은 `StubWorker`(CLI 기본) 또는 미등록 시 `skipped`로 처리.

### Risky

- **승인 모델**: `approve` 타입 step과 `policy.requiresApprovalFor`(기본
  `['implement','fix']`) step을 "게이트"로 통합한다. 게이트는 `(runId, stepId)`
  승인 레코드를 요구하며, 없으면 `awaiting-approval`로 멈춘다.
- **prompt 구성**: step별 워커 프롬프트는 요청 + step 이름 + run 디렉터리
  아티팩트 포인터로 최소 구성(`buildStepPrompt`). 풍부한 컨텍스트 주입은 후속.
- **재개 경계**: `decide`는 승인만 기록하고 `resume`가 진행한다(결정/진행 분리로
  테스트 결정성 확보). CLI `run approve`는 UX상 decide+resume를 합쳐 호출한다.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 승인 필요 기본 정책을 `['implement','fix']`로 둘지(기본 그렇게).
2. run 완료/실패 후 worktree를 남길지(기본: **남김**, 검사 위해. 정리는 후속
   `run clean`).

## Risks

`risks.md` 참조. 핵심: 게이트 누수로 미승인 mutating step 실행, worktree 격리
실패로 main 오염, 부분 실패 시 상태 비일관/재개 불가, 엔진이 worker 오류를
throw로 전파, StubWorker가 실제 워커로 오인되어 실행됨, 스키마 변경의 하위호환.

## Recommendation

`RunService`(dry-run 계획)는 유지하고, 실행은 신규 `RunExecutor`로 분리한다.
상태는 `RunStore`(run.json)로 영속화해 재개 가능하게 한다. 게이트는 `approve`
타입 + `ApprovalPolicy`를 통합한 단일 규칙으로 처리한다. 미연결 역할은
`StubWorker`로 엔진을 end-to-end 검증하되 **실제 Codex 연결은 다음 마일스톤**으로
분리한다. 모든 부수효과는 주입 포트 뒤에서 mock 검증한다. 상세는 `design.md`.
