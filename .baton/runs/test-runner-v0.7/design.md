# Implementation Design

## Summary

파이프라인의 `test` 단계를 실제화한다. `tester` 역할을 worktree에서 프로젝트
테스트를 실행하는 `TestRunnerAdapter`로 opt-in(`--test`) 연결하고, 결과를
`test_result.md`로 남긴다. CodexExecAdapter 패턴(configurable + ProcessRunner +
산출물)을 재사용하며, 테스트 명령은 config/flag로 해석한다. 테스트 실패는 step
상태로 표현해 파이프라인이 멈춘다. 코어 엔진은 provider-agnostic 유지.

## Scope

### In Scope

- `TestRunnerAdapter`(core): 명령 실행(cwd=worktree, 배열 인자, timeout), exit→success,
  stepType `test` → `test_result.md`
- `resolveTestCommand({config, flag})`
- 레지스트리 `test`/testerRoles 확장(opt-in 시 tester=TestRunner)
- CLI `--test`/`--test-command`(run/resume/approve), `--codex`/`--claude`와 조합,
  명령 미설정 경고
- 단위/통합/안전 테스트(mock)

### Out of Scope

- 프레임워크 자동 감지, 출력 구조화 파싱, 재시도, fix 루프, SQLite

## Proposed Architecture

```text
CLI run "<req>" --test [--test-command "<cmd>"] [--codex] [--claude]
  ├─ testCommand = resolveTestCommand({ flag, config })   # flag 우선, config 폴백
  ├─ if --test && !testCommand: warn → tester는 Stub 유지
  ├─ registry = createWorkerRegistry({ codex, claude, test, testCommand, runner })
  │     implementer/fixer → CodexExecAdapter (codex)
  │     analyst/architect/reviewer → ClaudeCodeAdapter (claude)
  │     tester → TestRunnerAdapter (test && testCommand)
  │     그 외 → StubWorker
  └─ RunExecutor.start(req)   # (불변) 격리·게이트·재개
        └─ worker.run({ cwd: worktreePath, metadata:{stepType:'test',...} })
              └─ TestRunnerAdapter
                    ├─ runner.run(command, args, { cwd, timeoutMs })
                    └─ write test_result.md (명령/exit/요약 + 잘린 출력)
```

엔진 변경 없음. TestRunnerAdapter는 기존 Codex/Claude 어댑터와 동형.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/workers/test/TestRunnerAdapter.ts`(신규) | 명령 실행 + test_result.md + 실패 매핑 |
| `packages/core/src/index.ts` | `TestRunnerAdapter` export |
| `packages/cli/src/registry.ts` | `WorkerRegistryOptions`에 `test?`/`testCommand?`; testerRoles=[tester] → TestRunnerAdapter |
| `packages/cli/src/commands/run.ts` | `--test`/`--test-command` 파싱, `resolveTestCommand`, createExecutor 조합, 명령 미설정 경고 |
| `packages/cli/src/commands/run.ts` 또는 신규 `testCommand.ts` | `resolveTestCommand({config, flag})` |
| `README.md` | `--test`/`--test-command`/config `test.command`/안전 문서화 |
| `packages/*/test/*` | adapter/resolve/registry/run/security 테스트 |

## Data Model Changes

스키마 변경 없음. config(`.baton/config.json`)에 optional `test?: { command?: string[] }`
관례를 추가(읽기 측에서 안전 파싱; Zod 추가는 선택). `WorkerRunInput.metadata`는 기존
`stepType` 재사용. 출력 산출물은 파일 규약(`test_result.md`).

## API / CLI Changes

```bash
baton run "<request>"                                  # (회귀) tester Stub
baton run "<request>" --test --test-command "pnpm test"
baton run "<request>" --test                            # config의 test.command 사용(없으면 경고)
baton run "<request>" --codex --claude --test           # 구현=Codex/분석·설계·리뷰=Claude/테스트=TestRunner
baton run resume <runId> [--test] [--codex] [--claude]
baton run approve <runId> [--test] [--codex] [--claude] [--reject]
```

신규 core API: `TestRunnerAdapter`. 신규 CLI: `resolveTestCommand`,
`createWorkerRegistry({test,testCommand})`.

## Workflow Changes

실행 의미(격리·게이트·재개) 불변. `test` step이 실제 테스트를 돌려 `test_result.md`를
남기고, 실패 시 파이프라인을 failed로 멈춘다(review/finalize는 skipped). 자동 fix는
범위 밖.

## Error Handling

- 명령 미설정 + `--test` → 경고 + tester Stub(무해, run 정상).
- 테스트 실패/timeout/예외 → `success:false` → step failed, run failed, 잔여 skipped.
  `test_result.md`는 남긴다.
- 산출물 write 실패 → 결과에 반영하되 throw 금지.
- 잘못된 인자 → 사용법 + 비정상 종료.

## Security Considerations

- 실제 실행 opt-in(`--test`). 기본 tester Stub.
- 명령+인자 **배열 전달**(셸 평가/주입 없음). config는 string[] 권장.
- 어댑터 cwd=worktreePath(격리). base/main 미접근. `danger-full-access` 무관.
- credential/세션 토큰 무접근(기존 안전 유지, grep 회귀).
- 임의 명령 실행은 사용자 자신의 프로젝트 + opt-in + 격리로 한정(문서 명시).

## Test Plan

`test-plan.md` 참조. 요지: 플래그 없으면 호출 0회, 명령 배열·cwd 격리, test_result.md,
실패→failed+잔여 skipped, 미설정 경고+Stub, 조합 등록, 셸 결합·토큰 부재.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-601 → task-605 의존성 순서를 따른다.
- v0.1~v0.6 공개 동작/테스트를 깨지 말 것(기본 Stub, --codex/--claude, 게이트, 이력 조회).
- 명령은 배열 전달(셸 결합 금지). 실패는 상태로(throw 금지).
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- 프레임워크 감지, 출력 파싱, 재시도, fix 루프, SQLite.

## Review Checklist

- [ ] 플래그 없으면 TestRunner 호출 0회(기본 Stub 회귀).
- [ ] `--test`는 tester만 실제, 명령 미설정 시 경고+Stub.
- [ ] 명령 배열 전달(셸 결합 없음), cwd==worktreePath.
- [ ] test_result.md 기록, 실패→failed+잔여 skipped(throw 없음).
- [ ] `--codex --claude --test` 역할 분리. credential/토큰/danger 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.6 누적). 예:
  `git worktree add ../baton-test-runner-v0.7 -b baton/test-runner-v0.7 origin/main`
- 분기 직후 확인: `packages/cli/src/registry.ts`의 `createWorkerRegistry({codex,claude})`,
  `packages/core/src/workers/{codex,claude}/*`, `packages/core/src/runs/listRuns.ts`(v0.6),
  그리고 `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(109)보다 줄면 base를 의심하라.

### Goal

Baton 파이프라인의 `test` 단계를 실제화한다. `tester` 역할을 worktree에서 프로젝트
테스트를 실행하는 `TestRunnerAdapter`로 opt-in(`--test`) 연결하고 결과를
`test_result.md`로 남긴다. CodexExecAdapter 패턴을 재사용하며, 명령은 config/flag로
해석하고 배열로 전달한다. 테스트 실패는 step 상태로 표현(throw 금지). 기본은 Stub.

성공 기준은 "테스트 실행"뿐 아니라 **opt-in 안전 + worktree 격리 + 실패의 상태화 +
회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/test-runner-v0.7/design.md`
3. `.baton/runs/test-runner-v0.7/tasks.json`
4. `.baton/runs/test-runner-v0.7/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.6 코드 컨벤션(`CodexExecAdapter`, `ClaudeCodeAdapter`,
   `createWorkerRegistry`, `run.ts`의 `--codex`/`--claude`)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/workers/test/TestRunnerAdapter.ts`
- `packages/core/test/testRunnerAdapter.test.ts`

### Files to Modify

- `packages/core/src/index.ts` — `TestRunnerAdapter` export
- `packages/cli/src/registry.ts` — `WorkerRegistryOptions`에 `test?`/`testCommand?`,
  testerRoles=[tester] → TestRunnerAdapter
- `packages/cli/src/commands/run.ts` — `--test`/`--test-command` 파싱,
  `resolveTestCommand({config,flag})`, createExecutor 조합, 명령 미설정 경고, resume/approve
- `README.md` — `--test`/`--test-command`/config `test.command`/안전 문서화
- `packages/cli/test/cli.test.ts` — run/registry/조합/미설정/실패 테스트

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 실제 테스트 명령/git을 실행하는 자동화 테스트 금지(mock만).
- fix 루프/프레임워크 감지/출력 파싱 추가 금지(범위 밖).
- 런타임 의존성 추가 금지(`zod`, `yaml`). 셸 문자열 결합 명령 실행 금지.

### Step-by-Step Implementation Plan

1. `.baton/runs/test-runner-v0.7/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `TestRunnerAdapter`: configurable command/args/timeout, `input.cwd`에서 ProcessRunner
   실행(배열), stepType `test` → `test_result.md`(명령/exit/요약+잘린 출력) +
   artifacts, exit/timeout/예외→success:false, 토큰 무접근 + 테스트. (task-601)
3. `resolveTestCommand({config, flag})`: `--test-command` 우선(공백 분리), config
   `test.command`(string[]) 폴백, 없으면 undefined + 테스트. (task-602)
4. `createWorkerRegistry({..., test, testCommand, runner})`: test&&testCommand면
   tester=TestRunnerAdapter, 아니면 기존 규칙 + 테스트. (task-603)
5. CLI `--test`/`--test-command`: 파싱, resolveTestCommand, 미설정 경고+Stub,
   조합(`--codex`/`--claude`), resume/approve, 플래그 없으면 호출 0회 + 실패→failed
   + 테스트. (task-604)
6. README/help 갱신, 보안 회귀(토큰/danger/셸결합 0), 전체 게이트 + 스모크, 자체
   diff 리뷰, 최종 요약. (task-605)

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

`.baton/runs/test-runner-v0.7/acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.
특히: 플래그 없으면 호출 0회(AC-09), tester만 실제(AC-08), 명령 배열·cwd 격리
(AC-01/16), test_result.md(AC-02), 실패→failed+잔여 skipped(AC-14), 미설정 경고+Stub
(AC-11), 조합 분리(AC-12).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- opt-in(`--test`), 기본 Stub. 실행은 worktree(cwd) 격리.
- 명령+인자 배열 전달(셸 결합 금지). timeout 지원. 실패는 success:false(throw 금지).
- 어댑터 cwd=worktreePath, base/main 미접근. credential/세션 토큰 무접근, danger 무관.
- 코어 엔진 provider-agnostic 유지(어댑터 주입은 CLI 레이어).
- base = `origin/main`. 작업은 새 worktree에서. **commit/push 하지 말 것**.

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
- fix 루프, 출력 구조화 파싱, SQLite 등 남은 항목

## Notes for Reviewer
- 기본 Stub 회귀, 명령 배열·cwd 격리, test_result.md, 실패의 상태화, 미설정 경고,
  --codex --claude --test 조합을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
