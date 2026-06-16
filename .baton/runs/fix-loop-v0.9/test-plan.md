# Test Plan

러너: Vitest. 모든 부수효과(워커/프로세스/시계/FS)는 주입 포트·mock으로 격리,
`$BATON_HOME`는 임시 디렉터리. **실제 codex/git/네트워크 금지.** 루프 경계는
mock 호출 횟수로 결정적 단언.

## Unit Tests

### schema
- `RunStep.attempts` optional: 있는/없는 run.json 모두 parse.

### RunExecutor — fix disabled (회귀)
- `--fix` 미지정(fixEnabled=false): test 실패 → 즉시 run failed, 잔여 skipped,
  fixer **호출 0회**. 기존 v0.2~v0.8 시나리오 회귀 없음.

### RunExecutor — fix loop
- fix 활성 + test 실패 후 1회 fix로 통과: fixer 1회 + test 재실행 1회 → test
  completed → review/finalize 진행. `attempts`=1, fix 이벤트 기록.
- N회 모두 실패: fixer 정확히 N회 + test 재실행 정확히 N회 → test failed, run failed,
  잔여 skipped. **호출 횟수 정확히 N(상한 초과 없음)** 단언.
- 처음부터 test 통과: fix 루프 미진입(fixer 0회).
- fixer 미등록(Stub만): 코드 변경 없음, 상한 내 종료, 무한 없음.
- 모든 fixer/재실행 cwd === worktreePath 단언.
- 매 attempt 후 영속화(중간 상태 load 가능), attempts 갱신.

### RunExecutor — resume + fix
- fix 도중 영속 상태에서 resume: 종료 step 재실행 0회, 일관 종료.

### maxFixAttempts 검증
- 기본 1. `--max-fix-attempts 3` → 상한 3. 비정수/0/음수/과대 → 에러 또는 클램프(정의대로).

## CLI / Integration Tests

- `run "<req>" --codex --test --test-command ... --fix`: test 실패 시 fix 루프 동작
  (mock runner로 fixer/test 시퀀스), 성공 시 파이프라인 계속.
- `--fix` without `--codex`(fixer Stub) → 경고 출력.
- `--max-fix-attempts` 파싱/검증.
- resume/approve + `--fix` 조합.
- `--fix` 미지정 → 회귀 없음(fixer 0회).

## Security Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- fixer/재실행 cwd가 base/main 아님.

## Out of Scope (테스트 비대상)

- 실제 codex 수정/실제 git, review 자동 수정, LLM fix 전략, SQLite, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.8 + v0.9, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
