# Acceptance Criteria

v0.9 bounded Fix 루프가 완료되려면 아래가 모두 충족되어야 한다.

## Schema

- [ ] AC-01 `RunStep`에 optional `attempts?: number`가 추가된다(기존 run.json 하위호환).

## Bounded fix loop (RunExecutor)

- [ ] AC-02 fix가 비활성(`--fix` 미지정)이면 동작이 기존과 **완전히 동일**하다
  (fixable step 실패 → 즉시 run failed, fixer 미호출). 기존 RunExecutor 테스트 회귀 없음.
- [ ] AC-03 fix 활성 + fixable step(기본 `test`) 실패 + fixer 등록됨이면, attempt
  1..N 동안 [fixer 실행 → 해당 step 재실행]을 수행한다.
- [ ] AC-04 루프는 **하드 상한 `maxFixAttempts`** 로 제한된다: fixer 호출 횟수와 step
  재실행 횟수가 각각 최대 N. step이 통과하면 즉시 종료하고 파이프라인을 계속한다.
- [ ] AC-05 N회 후에도 실패면 step `failed`, run `failed`, 잔여 step `skipped`(기존
  실패 경로와 동일), 엔진은 throw 하지 않는다.
- [ ] AC-06 fixable step이 처음에 통과하면 fix 루프에 진입하지 않는다(fixer 미호출).
- [ ] AC-07 fixer가 등록되지 않았으면(예: Stub만) fix 루프로 코드가 바뀌지 않으며,
  CLI가 경고한다(루프 진입 시에도 상한 내 종료, 무한 없음).
- [ ] AC-08 fixer/재실행 호출 cwd === worktreePath(격리), main 미수정.
- [ ] AC-09 매 attempt 후 상태가 영속화되고, `RunStep.attempts`와 fix 이벤트
  (fix.attempt.* / step.retried)가 기록된다.
- [ ] AC-10 resume는 종료된 step(completed/failed/skipped)을 재실행하지 않으며 fix
  상태와 일관된다(멱등).

## CLI

- [ ] AC-11 `--fix`가 fix 루프를 활성화하고, `--max-fix-attempts <n>`(기본 1)로 상한을
  설정한다. 잘못된 값(비정수/0 이하/과대)은 사용법/검증 에러.
- [ ] AC-12 `--fix`는 `--codex`/`--claude`/`--test`와 조합되며, resume/approve도 지원한다.
- [ ] AC-13 `--fix`인데 실제 fixer가 없으면(=`--codex` 미지정) 명확한 경고를 출력한다.

## Safety & Compat

- [ ] AC-14 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`가 없다.
- [ ] AC-15 자동화 테스트는 실제 codex/git을 실행하지 않는다(mock). 루프 경계는
  mock 호출 횟수로 단언한다(정확히 N회).
- [ ] AC-16 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.8 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
