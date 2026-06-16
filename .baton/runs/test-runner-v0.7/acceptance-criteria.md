# Acceptance Criteria

v0.7 Test Runner 연결이 완료되려면 아래가 모두 충족되어야 한다.

## TestRunnerAdapter

- [ ] AC-01 `TestRunnerAdapter`(WorkerAdapter)가 구성된 명령+인자를 `input.cwd`
  (worktree)에서 ProcessRunner로 실행한다(셸 문자열 결합 없이 배열 전달).
- [ ] AC-02 stepType `test`일 때 `test_result.md`(명령/exit/요약 + 잘린 출력)를
  runDirectory에 기록하고 `WorkerRunResult.artifacts`에 경로를 포함한다.
- [ ] AC-03 exitCode===0 → `success:true`, exit≠0/timeout/예외 → `success:false`.
- [ ] AC-04 timeout 옵션이 ProcessRunner로 전달된다.
- [ ] AC-05 어댑터/테스트에 credential/세션 토큰 경로 접근이 없다.

## Test command resolution

- [ ] AC-06 `resolveTestCommand({config, flag})`가 `--test-command` 우선, 없으면
  `.baton` config(`test.command`)로 명령(+인자)을 해석한다.
- [ ] AC-07 명령이 string[]이면 그대로, `--test-command` 문자열은 공백 분리로 파싱.
  둘 다 없으면 `undefined`.

## Registry & CLI opt-in

- [ ] AC-08 `createWorkerRegistry({..., test, testCommand, runner})`가 `test`이고
  명령이 있으면 `tester` 역할에만 `TestRunnerAdapter`를 등록하고, 그 외 역할은
  기존 규칙(codex/claude/stub)을 유지한다.
- [ ] AC-09 `baton run "<req>"`(플래그 없음)는 TestRunner를 호출하지 않는다(tester Stub).
- [ ] AC-10 `baton run "<req>" --test --test-command "<cmd>"`(또는 config)는 tester
  step을 worktree에서 실제 명령으로 실행한다(어댑터 호출 cwd === worktreePath).
- [ ] AC-11 `--test`인데 명령 미설정 → 명확한 경고 + tester는 Stub 유지(무해, run 정상).
- [ ] AC-12 `--codex --claude --test` 조합 시 역할이 충돌 없이 분리 등록된다
  (구현=Codex, 분석/설계/리뷰=Claude, 테스트=TestRunner).
- [ ] AC-13 `run resume <runId>` / `approve`도 `--test`를 동일하게 지원한다.

## Pipeline behavior

- [ ] AC-14 테스트 실패(exit≠0)면 tester step `failed`, run `failed`, 잔여 step
  `skipped`가 되며 엔진은 throw 하지 않는다(`test_result.md`는 남는다).

## Safety & Compat

- [ ] AC-15 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`,
  셸 문자열 결합 명령 실행이 없다(보안 회귀 테스트).
- [ ] AC-16 어댑터 호출 cwd === worktreePath(격리), base/main 경로 미전달.
- [ ] AC-17 자동화 테스트는 실제 테스트 명령/git을 실행하지 않는다(전부 mock).
- [ ] AC-18 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.6 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
