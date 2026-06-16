# Acceptance Criteria

v0.10 Config 기반 기본값이 완료되려면 아래가 모두 충족되어야 한다.

## Schema & loader

- [ ] AC-01 `BatonConfig` Zod 스키마: `{ version: 1, obsidian?: { vault?: string },
  test?: { command?: string[] }, workers?: { codex?, claude?, test?, fix?: boolean,
  maxFixAttempts?: number(1~5) } }`. version 외 전부 optional.
- [ ] AC-02 `loadConfig(cwd)`가 `.baton/config.json`을 읽어 Zod 검증 후 반환하고,
  파일 부재 시 빈/기본 config를 반환한다(no-op). 손상/검증 실패는 명확한 에러.
- [ ] AC-03 기존 config(`{version:1}`)가 회귀 없이 parse 된다(하위호환).

## Refactor — single source

- [ ] AC-04 `journal.ts`의 vault 해석과 `run.ts`의 testCommand 해석이 `loadConfig`를
  사용하며, 기존 v0.5(Obsidian)/v0.7(test) 동작/테스트가 회귀 없이 통과한다.
- [ ] AC-05 vault 우선순위(`$BATON_OBSIDIAN_VAULT` > config.obsidian.vault)가 유지된다.

## run — config-driven defaults

- [ ] AC-06 `baton run`이 config.workers(codex/claude/test/fix/maxFixAttempts) +
  test.command를 기본값으로 사용한다.
- [ ] AC-07 우선순위가 **명시 플래그 > config > 내장 기본값**이다. 부정 플래그
  (`--no-codex`/`--no-claude`/`--no-test`/`--no-fix`)가 config-on을 끈다.
- [ ] AC-08 `--codex`와 `--no-codex`가 동시에 오면 명확한 에러 + 비정상 종료.
- [ ] AC-09 config가 없거나 비어도 run은 내장 기본값(전부 off/Stub)으로 동작한다
  (회귀 없음).

## config command

- [ ] AC-10 `baton config list`가 (검증된) 현재 config를 출력한다.
- [ ] AC-11 `baton config get <dotted.key>`가 해당 값을 출력하고, 없는 키는 명확히 안내.
- [ ] AC-12 `baton config set <dotted.key> <value>`가 값을 코어션(true/false/정수/JSON
  배열/문자열)해 머지·Zod 검증 후 `.baton/config.json`에 기록한다. 기존 필드는 보존된다.
- [ ] AC-13 잘못된 값/알 수 없는 키/스키마 위반은 거부(미기록) + 명확한 에러 + 비정상 종료.

## init

- [ ] AC-14 `baton init`이 풍부한(주석 대신 구조가 드러나는) config 템플릿을 기록하되,
  기존 config가 있으면 덮어쓰지 않는다(idempotent).

## Safety & Compat

- [ ] AC-15 config 읽기/쓰기는 `.baton/config.json`에만. credential/세션 토큰 접근,
  `danger-full-access`가 없다(보안 회귀 테스트).
- [ ] AC-16 모든 FS 테스트는 임시 `.baton` 디렉터리. `pnpm typecheck && pnpm test &&
  pnpm build` 통과, v0.1~v0.9 회귀 없음, `run --help` 스모크 정상.
