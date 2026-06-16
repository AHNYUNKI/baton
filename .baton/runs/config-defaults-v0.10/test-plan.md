# Test Plan

러너: Vitest. 모든 FS는 임시 `.baton` 디렉터리로 격리. 결정적. **네트워크/실제 워커
불필요.**

## Unit Tests

### BatonConfig schema
- 유효 config(부분/전체) parse, version 외 optional.
- 기존 `{version:1}` parse(하위호환).
- 무효(잘못된 타입, maxFixAttempts 범위 밖, 알 수 없는 키) → safeParse 실패.

### loadConfig
- 파일 부재 → 빈/기본 config(no-op).
- 유효 파일 → 검증된 객체.
- 손상 JSON/Zod 위반 → 명확한 에러(경로 포함).

### resolveRunOptions(플래그 > config > 기본값)
- config off + 플래그 `--codex` → codex on.
- config on + 플래그 미지정 → config 값 사용(on).
- config on + `--no-codex` → off.
- `--codex --no-codex` → 에러.
- testCommand: `--test-command` > config.test.command.
- maxFixAttempts: 플래그 > config > 기본 1.

## CLI Tests

### config command
- `config list` → 검증된 config 출력.
- `config get workers.codex` → 값. 없는 키 → 안내.
- `config set workers.codex true` → 머지·검증·기록, 기존 필드 보존(라운드트립).
- `config set test.command '["pnpm","test"]'` → 배열 파싱.
- `config set workers.maxFixAttempts 9` → 범위 위반 거부(미기록).
- `config set unknown.key x` → 거부.

### run with config
- config.workers 설정 후 `baton run "<req>"`(플래그 없음) → 해당 워커 등록(mock).
- 플래그가 config override(부정 플래그 포함).
- config 없음/빈 → 기본값(off/Stub) 회귀.

### init
- config 템플릿 기록, 재실행 시 기존 보존(idempotent).

### refactor 회귀
- v0.5 journal(vault env>config), v0.7 testCommand 동작 동일.

## Security Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- config 읽기/쓰기가 `.baton/config.json` 한정.

## Out of Scope (테스트 비대상)

- SQLite, 전역 config, 실제 워커/git/네트워크, 대화형 마법사.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.9 + v0.10, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
