# Analysis

## User Request

Baton 파이프라인의 `test` 단계를 실제화한다. `tester` 역할을 worktree에서 프로젝트
테스트를 실행하는 `TestRunnerAdapter`로 연결하고, 결과를 `test_result.md`로 남긴다.
v0.3/v0.4의 어댑터 패턴(opt-in + configurable + worktree 격리 + mock 테스트)을 재사용.

## Intent

지금까지 구현(v0.3 Codex)·분석/설계/리뷰(v0.4 Claude)는 실제 워커로 동작하지만,
그 사이의 **test 단계는 여전히 Stub**이라 구현 결과를 검증하지 못한다. 가치의 핵심은
"implement 직후 자동으로 테스트를 돌려 결과를 아티팩트로 남기는" 파이프라인 완성이다.
AGENTS.md도 `test_result.md` 아티팩트와 Test Runner를 명시한다.

## Current Repository Understanding (v0.6 / main 43c586a 기준)

- `examples/workflows/default.workflow.yaml` — `test` step(type `test`, role
  `tester`)이 implement와 review 사이에 존재. 현재 tester → Stub.
- `packages/cli/src/registry.ts` — `createWorkerRegistry({codex, claude, runner})`,
  `codexRoles=[implementer,fixer]`, `claudeRoles=[analyst,architect,reviewer]`,
  나머지(=tester 포함) Stub. v0.7에서 `test`/testerRoles=[tester] 추가.
- `packages/cli/src/commands/run.ts` — `--codex`/`--claude` 플래그 + preflight +
  `createExecutor(...{useCodex,useClaude})`. `--test` 추가 지점.
- `packages/core/src/workers/codex/CodexExecAdapter.ts` — configurable command/args,
  stdin, 산출물 기록. **TestRunnerAdapter의 직접 템플릿**(stdin은 불필요).
- `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` — metadata.stepType별
  산출물(analysis.md/design.md/review.md) 기록. test→`test_result.md` 매핑에 동일 패턴.
- `packages/core/src/ports/ProcessRunner.ts` — `run(cmd,args,{cwd,timeoutMs,input?})`.
- `packages/core/src/runs/RunExecutor.ts` — worker 호출 cwd=worktreePath, metadata에
  stepType/role/runDirectory/stepId 전달. 실패는 step/run 상태로.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/workers/test/TestRunnerAdapter.ts`(신규) | 테스트 명령 실행 + test_result.md |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/registry.ts` | `test`/testerRoles → TestRunnerAdapter |
| `packages/cli/src/commands/run.ts` | `--test`/`--test-command`, 명령 해석, 조합 |
| `packages/cli/src/commands/run.ts` 또는 신규 | `resolveTestCommand({config,flag})` |

## Existing Behavior

`baton run --codex --claude`로 implement는 Codex, 분석/설계/리뷰는 Claude가 수행해도,
`test` step은 StubWorker로 무해 완료(실제 테스트 미실행, 산출물 없음).

## Target Behavior

- `baton run "<req>" --test`(+ `--test-command "<cmd>"` 또는 `.baton` config) →
  `tester` 역할이 worktree에서 테스트 명령을 실행하고 `test_result.md` 생성. exit 0
  → step completed, exit≠0 → step failed(→ run failed, 잔여 skipped).
- `--test`인데 명령 미설정 → 경고 + tester는 Stub 유지(무해).
- `--codex --claude --test` 조합 시 역할 분리(구현=Codex, 분석/설계/리뷰=Claude,
  테스트=TestRunner).
- 플래그 없으면 tester Stub(회귀 없음).

## Constraints

- opt-in(`--test`), 기본 Stub. 실행은 worktree(cwd) 격리 안에서.
- 명령+인자는 배열 전달(셸 결합 금지). timeout 지원.
- 테스트 실패는 step `failed`(throw 금지) — 의도된 신호.
- credential/세션 토큰 무접근, danger 무관. 모든 I/O 포트 주입·mock 테스트.

## Assumptions

### Safe

- TestRunnerAdapter는 CodexExecAdapter와 동형(configurable command/args, 산출물).
- 출력 산출물명은 stepType `test` → `test_result.md`.
- tester만 대상. 다른 역할은 Codex/Claude/Stub 유지.

### Risky

- **테스트 명령 출처**: `.baton/config.json`의 `test.command`(string[] 권장) 또는
  `--test-command "<cmd>"`(공백 분리 단순 파싱). 둘 다 없으면 tester 미등록(Stub)+경고.
  명령은 사용자 프로젝트 소유라 임의 실행이지만 opt-in + worktree 격리로 한정.
- **test_result.md 형식**: 명령/exit/요약(pass·fail 라벨) + 잘린 stdout/stderr.
  구조화 파싱은 후속(이번엔 캡처+exit 기준).
- **fix 루프**: 테스트 실패 시 자동 fix는 범위 밖(실패를 상태로 남기고 멈춤).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 테스트 명령 출처를 config `test.command` + `--test-command`로 둘지(기본 그렇게).
2. 명령 미설정 시 동작: tester Stub 유지 + 경고(기본) vs 하드 실패(거부).

## Risks

`risks.md` 참조. 핵심: 기본 실수 실행, 명령 출처 불명확, 셸 주입, 무한정 실행
(timeout), 산출물 누락, 조합 충돌, 안전 회귀.

## Recommendation

CodexExecAdapter 패턴으로 `TestRunnerAdapter`를 만들어 `tester` 역할에 opt-in
(`--test`) 연결한다. 명령은 config/flag로 해석하고 배열로 전달하며 timeout을 둔다.
실패는 step 상태로 표현해 파이프라인이 멈추게 한다. 명령 미설정은 경고 + Stub 유지로
무해하게 처리한다. 모든 I/O는 mock 검증한다. 상세는 `design.md`.
