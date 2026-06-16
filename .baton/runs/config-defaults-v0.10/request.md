# Request

## Run

- runId: `config-defaults-v0.10`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `fix-loop-v0.9` (PR #9, merged → main `50d3eae`)

## User Request

이제 파이프라인은 완성됐다(analyze→design→implement→test→fix→review→finalize). 다만
실사용하려면 매번 `--codex --claude --test --test-command "..." --fix
--max-fix-attempts N`을 입력해야 한다. v0.10은 이 설정들을 **`.baton/config.json`에
저장해 기본값으로** 쓰게 한다. `baton config` 명령으로 읽고/쓰며, `baton run`이
config를 해석해 워커/볼트/테스트/fix 기본값을 채운다(명시 플래그가 override).

## Scope (v0.10)

- 통합 `BatonConfig` Zod 스키마(version + obsidian + test + workers)
- core `loadConfig(cwd)`: `.baton/config.json` 읽고 검증(단일 출처)
- 산발 파싱(journal의 vault, run의 testCommand)을 `loadConfig`로 리팩터
- `baton run`이 config.workers/test/obsidian로 기본값 해석 + 플래그/부정 플래그 override
- `baton config list|get <key>|set <key> <value>` 명령
- `baton init`이 풍부한 config 템플릿 기록
- 단위/통합 테스트, README

## Out of Scope

- SQLite, 전역(홈) config, 환경변수 전체 매핑(vault의 $BATON_OBSIDIAN_VAULT는 유지),
  대화형 설정 마법사

## Constraints

- 우선순위: **명시 플래그 > config > 내장 기본값**. 부정 플래그(`--no-codex` 등)로
  config-on을 끌 수 있어야 함.
- config 쓰기/검증은 Zod로(잘못된 값 거부). 쓰기는 `.baton/config.json`에만.
- 기존 동작(플래그 그대로 쓰던 경로) 회귀 없음. credential/세션 토큰 무접근.
- 런타임 의존성 추가 없음(zod/yaml). base = `origin/main`(v0.1~v0.9). 스키마 additive.
