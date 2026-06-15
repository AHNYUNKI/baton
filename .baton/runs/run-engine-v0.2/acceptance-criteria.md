# Acceptance Criteria

v0.2 Run 실행 엔진이 완료되려면 아래가 모두 충족되어야 한다.

## Schemas

- [ ] AC-01 `RunStatus`에 `awaiting-approval`이 추가된다(기존 값 유지).
- [ ] AC-02 `RunStepStatus`(planned|running|completed|failed|skipped)가 정의되고
  `RunStep.status`가 이를 사용한다.
- [ ] AC-03 `RunStep`에 optional `startedAt`, `completedAt`, `reason`,
  `artifacts: string[]`가 추가된다.
- [ ] AC-04 `Run`에 optional `worktreePath`, `baseBranch`, `updatedAt`가 추가된다.
- [ ] AC-05 `Approval`에 optional `decidedAt`, `note`가 추가되고 기존 run.json
  (신규 필드 없음)도 parse 된다(하위호환).

## RunStore (state persistence)

- [ ] AC-06 `RunStore.save(run)`가 `.baton/runs/<runId>/run.json`을 원자적으로 쓴다.
- [ ] AC-07 `RunStore.load(runId)`가 run.json을 Zod로 검증해 반환하고, 없으면
  명확한 에러를 던진다.

## RunExecutor (execution loop)

- [ ] AC-08 `start(request, options)`가 run을 생성(status `running`)하고 worktree를
  1회 생성한 뒤 step을 순서대로 실행한다.
- [ ] AC-09 mutating step의 worker 호출 cwd는 항상 run의 `worktreePath`이며,
  base/main 경로가 cwd로 전달되지 않는다.
- [ ] AC-10 각 step 실행 시 stdout/stderr를 `logs/<stepId>.{stdout,stderr}.log`로,
  결과를 step 아티팩트로 기록하고 `step.started`/`step.completed`/`step.failed`
  이벤트를 events.jsonl에 남긴다.
- [ ] AC-11 worker가 실패(success=false)하면 해당 step은 `failed`, run은 `failed`,
  잔여 step은 `skipped`가 되며 엔진은 throw 하지 않는다.
- [ ] AC-12 역할에 등록된 worker가 없으면 step은 `skipped`(reason 명시)로 처리된다.
- [ ] AC-13 매 step 종료마다 RunStore로 상태가 영속화된다.

## Approval Gate

- [ ] AC-14 `approve` 타입 step 또는 `ApprovalPolicy.requiresApprovalFor`(기본
  `['implement','fix']`)에 해당하는 step에 도달하면, 승인 레코드가 없을 때 run은
  `awaiting-approval`로 영속화되고 **다운스트림 step은 실행되지 않는다**.
- [ ] AC-15 `decide(runId, decision, note?)`가 현재 대기 중인 게이트 step에 대한
  Approval(`approved`/`rejected`, `decidedAt`)을 기록한다.
- [ ] AC-16 거부(`rejected`) 시 run은 `cancelled`, 잔여 step은 `skipped`가 된다.
- [ ] AC-17 승인 후 `resume(runId)`가 게이트 step을 통과해 계속 실행한다.

## Resume

- [ ] AC-18 `resume(runId)`가 영속 상태에서 첫 비종료 step부터 이어 실행하며,
  이미 `completed`/`skipped`/`failed`인 step의 worker를 **재호출하지 않는다**.

## CLI

- [ ] AC-19 `baton run "<request>"`(--dry-run 없이)가 엔진을 실행하고 결과
  상태/아티팩트 경로를 출력한다(기본 레지스트리는 미연결 역할에 StubWorker 사용).
- [ ] AC-20 `baton run --dry-run`이 기존대로 계획만 출력한다(회귀 없음).
- [ ] AC-21 `baton run status <runId>`가 run + step 상태를 출력한다.
- [ ] AC-22 `baton run resume <runId>`가 실행을 재개한다.
- [ ] AC-23 `baton run approve <runId> [--reject]`가 승인/거부를 기록한다
  (approve는 decide 후 resume까지 수행).
- [ ] AC-24 알 수 없는 서브커맨드/누락 인자는 사용법 + 비정상 종료 코드.

## Safety

- [ ] AC-25 미승인 게이트 step에서 worker가 호출되지 않음을 테스트로 단언.
- [ ] AC-26 코드/테스트에 credential 경로 접근, `danger-full-access` 기본값,
  main 직접 수정 경로가 없음.
- [ ] AC-27 StubWorker 결과/이벤트에 스텁임이 명시되고, CLI가 스텁 경고를 출력한다.

## Gates / Compat

- [ ] AC-28 `pnpm typecheck && pnpm test && pnpm build` 통과, 기존 v0.1 테스트
  모두 유지(회귀 없음), CLI `--help` 스모크 정상.
