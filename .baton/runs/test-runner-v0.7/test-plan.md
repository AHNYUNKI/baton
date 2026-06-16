# Test Plan

러너: Vitest. 모든 부수효과(프로세스/시계/FS)는 주입 포트로 mock,
`$BATON_HOME`는 임시 디렉터리로 격리. **실제 테스트 명령/git/네트워크 실행 금지.**

## Unit Tests

### TestRunnerAdapter
- 구성된 명령+인자를 mock ProcessRunner로 `input.cwd`에서 실행(인자 배열, 셸 결합 없음).
- stepType `test` metadata → `test_result.md` 작성(명령/exit/요약 포함), artifacts에 경로.
- 비-test stepType → test_result.md 강제 안 함(해당 시).
- exit 0 → success:true. exit≠0 → success:false. 예외/timeout(모의) → success:false.
- timeout 옵션 전달 검증.
- credential/세션 토큰 경로 부재 단언.

### resolveTestCommand
- `--test-command "<cmd>"` → 공백 분리 파싱.
- config `test.command`(string[]) → 그대로.
- flag 우선, 둘 다 없으면 undefined.

### registry
- `createWorkerRegistry({})` → tester Stub.
- `{test:true, testCommand}` → tester=TestRunner, 나머지 규칙 유지.
- `{test:true}` 명령 없음 → tester Stub(미등록).
- `{codex:true,claude:true,test:true,testCommand}` → 역할 분리(겹침 없음).

## CLI / Integration Tests

- `run "<req>"`(플래그 없음): TestRunner 미호출(mock runner 호출 0회).
- `run "<req>" --test --test-command "<cmd>"`: tester step이 worktree에서 실행,
  cwd === worktreePath, `test_result.md` 생성.
- `run "<req>" --test`(명령 미설정): 경고 출력 + tester Stub, run 정상.
- 테스트 실패(mock exit≠0): tester `failed`, run `failed`, 잔여 `skipped`,
  `test_result.md` 존재.
- `run "<req>" --codex --claude --test`: 역할 분리 등록.
- `run resume <runId> --test` / `approve --test`: 동일 등록.
- 알 수 없는 인자 → 사용법 + 비정상 종료.

## Security Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- 명령은 배열 전달(셸 평가 없음), cwd가 base/main 아님.

## Out of Scope (테스트 비대상)

- 실제 테스트 프레임워크 실행, 실제 git worktree, 출력 구조화 파싱, SQLite, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.6 + v0.7, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
