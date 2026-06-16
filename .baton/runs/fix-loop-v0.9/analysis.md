# Analysis

## User Request

파이프라인에 **bounded Fix 루프**를 추가한다. 실패한 fixable step(기본 `test`)에 대해
`fixer` 워커가 수정을 시도하고 step을 재실행하되, 최대 `maxFixAttempts`회로 엄격히
제한한다. opt-in(`--fix`)이며 미지정 시 동작은 불변.

## Intent

지금까지 analyze/design/implement/test/review/finalize가 실제 워커로 동작한다. 마지막
빈칸은 "테스트가 깨졌을 때 자동으로 고쳐 재시도"하는 fixer 흐름이다. 가치의 핵심은
*자동 수정*이 아니라 **안전하게 경계 지어진 자동 수정**이다(무한 루프 금지, 명시 상한,
결정적 종료, opt-in, 격리, 재개 가능). 파이프라인의 마지막 조각을 닫는다.

## Current Repository Understanding (v0.8 / main 7c8ca20 기준)

- `packages/core/src/runs/RunExecutor.ts` (`executeFrom`, L149~) — step을 순서대로
  실행: `invokeWorker` → `status = success ? completed : failed` → replaceStep/event/
  save → `if (!result.success) { skipFromIndex(index+1); save failed; return }`.
  **fix 루프는 이 실패 분기 직전에 삽입**한다.
- `invokeWorker(run, workflowStep, timeoutMs)` — registry.resolve(role)로 어댑터 호출,
  cwd=worktreePath, metadata(stepType/role/runDirectory/stepId). 실패는 success:false.
- `packages/cli/src/registry.ts` — `fixer`는 codexRoles=[implementer, fixer]. 즉
  `--codex`일 때 fixer=CodexExecAdapter, 아니면 Stub.
- `packages/cli/src/commands/run.ts` — `--codex`/`--claude`/`--test` 플래그 + 조합 +
  preflight. `--fix`/`--max-fix-attempts` 추가 지점.
- `packages/schemas/src/run.schema.ts` — `RunStep`(id/type/status/startedAt/
  completedAt/reason/artifacts). optional `attempts` 추가 여지.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/runs/RunExecutor.ts` | bounded fix 루프 삽입 |
| `packages/core/src/runs/buildFixPrompt.ts`(신규, 선택) | fixer 프롬프트(실패 컨텍스트) |
| `packages/core/src/policies/FixPolicy.ts`(신규, 선택) | maxAttempts/fixableStepTypes |
| `packages/schemas/src/run.schema.ts` | optional `RunStep.attempts` |
| `packages/cli/src/commands/run.ts` | `--fix`/`--max-fix-attempts`, executor 옵션, 경고 |

## Existing Behavior

`test` step 실패 → run failed, 잔여 skipped. fixer 역할은 워크플로우에 명시되지 않고
(기본 workflow엔 fix step 없음) 자동 수정 흐름 없음.

## Target Behavior

- `baton run "<req>" --codex --test --fix [--max-fix-attempts N]` → test step 실패 시:
  attempt 1..N 동안 [fixer 실행(worktree) → test 재실행]. 통과하면 review/finalize로
  계속. N회 후에도 실패면 test `failed`, run `failed`, 잔여 skipped(기존과 동일).
- `--fix` 미지정 → 동작 불변(test 실패 = 즉시 run failed).
- `--fix`인데 fixer가 Stub(= `--codex` 없음) → 경고(실제 코드 변경 없음), 루프는 돌되
  무의미함을 안내.
- fix 시도는 이벤트(fix.attempt.*)·로그·`RunStep.attempts`로 기록.

## Constraints

- **bounded**: 하드 상한. 매 attempt = fixer 1회 + step 재실행 1회. 종료 조건:
  step 통과 / attempts==max / fixer 부재. 중첩 루프 없음. 무한 불가.
- 실패/예외는 success:false 상태로(throw 금지). 매 attempt 후 영속화.
- 어댑터 cwd=worktreePath. credential/세션 토큰 무접근, danger 무관.
- 스키마 변경 additive(optional). 모든 I/O 포트 주입·mock 테스트.

## Assumptions

### Safe

- fixable step은 기본 `test`만(FixPolicy.fixableStepTypes=['test']).
- fixer 워커는 registry의 `fixer` 역할(별도 등록 불필요).
- 기본 `maxFixAttempts`는 보수적으로 1(명시적으로 늘릴 수 있음).

### Risky

- **엔진 변경**: fix 루프는 어댑터가 아니라 `executeFrom` 내부 제어흐름이다. 핵심
  엔진을 건드리므로 회귀 위험이 가장 크다 → 변경을 잘 격리(`attemptFix` 헬퍼)하고
  기존 경로(`--fix` 미지정)는 바이트 동일하게 유지, 강한 테스트로 고정.
- **종료 보장**: attempts 카운터는 정수 하드 상한. fixer가 아무 것도 안 고쳐도 attempt는
  증가 → 무한 불가. step 재실행이 또 실패해도 카운터로 종료. 테스트로 "정확히 N회"
  단언.
- **재개와 fix**: resume 시에도 fix 루프 의미가 일관되도록, fix 상태(attempts)를
  영속화하고 종료된 step은 재실행하지 않는다(v0.2 resume 멱등 유지).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. `maxFixAttempts` 기본값 = 1(보수적) vs 2. 기본: **1**.
2. fixable step 범위 = `test`만(기본) vs test+review. 기본: **test만**.

## Risks

`risks.md` 참조. 핵심: 무한/과도 루프, 엔진 회귀, 종료 미보장, 재개 일관성, fixer
무효(Stub) 혼동, 영속/이벤트 누락.

## Recommendation

fix 루프를 `executeFrom` 실패 분기 직전에 `attemptFix` 헬퍼로 격리해 삽입한다.
`maxFixAttempts`(기본 1) 하드 상한 + 명확한 종료 조건으로 무한 루프를 원천 차단하고,
`--fix` 미지정 경로는 불변으로 유지한다. fixer는 registry의 fixer 역할을 쓰고,
실제 fixer가 없으면 경고한다. 매 attempt를 영속화·이벤트화하고 resume 멱등을 지킨다.
상세는 `design.md`.
