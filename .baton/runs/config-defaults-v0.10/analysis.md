# Analysis

## User Request

완성된 파이프라인을 실사용 가능하게: 워커/볼트/테스트/fix 설정을
`.baton/config.json`에 저장해 `baton run`의 기본값으로 쓰고, `baton config`로 관리한다.
명시 플래그는 config를 override한다.

## Intent

지금까지 각 기능은 opt-in 플래그로만 켰다(`--codex --claude --test --test-command
... --fix`). 매 실행마다 긴 플래그 체인을 입력하는 건 실사용에 큰 마찰이다. 가치의
핵심은 **설정을 한 번 저장하면 `baton run "<req>"`이 내 워커 구성으로 동작**하는 것.
부수적으로 산발된 config 파싱을 단일 `loadConfig`로 통합해 일관성을 얻는다.

## Current Repository Understanding (v0.9 / main 50d3eae 기준)

- `packages/cli/src/commands/init.ts` — `.baton/config.json`에 `{ version: 1 }`만 기록.
- `packages/cli/src/commands/journal.ts` — `loadWorkspaceConfig(cwd)`가 config.json을
  직접 파싱해 `ObsidianVaultConfig`(obsidian.vault) 추출. **산발 파싱 #1**.
- `packages/cli/src/commands/run.ts` — `resolveTestCommand({config, flag})`가 config의
  `test.command`를 읽음. **산발 파싱 #2**. `--codex`/`--claude`/`--test`/`--fix`/
  `--max-fix-attempts`는 현재 플래그로만.
- `packages/core/src/config/paths.ts` — `workspaceDir(cwd)`로 `.baton` 경로.
- `packages/core/src/journal/resolveObsidianVault.ts` — `{env, config}`로 vault 해석
  (env 우선). config 형태를 받는다.
- 워크플로우/registry: `createWorkerRegistry({codex,claude,test,testCommand,fix?...})`
  형태로 플래그가 흐름.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/batonConfig.schema.ts`(신규) | 통합 BatonConfig Zod |
| `packages/core/src/config/loadConfig.ts`(신규) | `.baton/config.json` 읽고 검증 |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/journal.ts` | loadConfig로 vault 해석 리팩터 |
| `packages/cli/src/commands/run.ts` | config 기반 기본값 해석 + 플래그/부정 override |
| `packages/cli/src/commands/config.ts`(신규) | list/get/set |
| `packages/cli/src/commands/init.ts` | 풍부한 템플릿 |
| `packages/cli/src/main.ts` | `config` 라우팅 |

## Existing Behavior

config.json은 `{version:1}`만. 기능은 전부 플래그로만 켬. config 파싱은 명령마다
중복. run 실행 시 워커 구성을 매번 플래그로 지정해야 함.

## Target Behavior

- `baton config set workers.codex true` / `set obsidian.vault /path` /
  `set test.command '["pnpm","test"]'` → 검증 후 config.json 갱신.
- `baton config list` / `config get workers` → 출력.
- `baton run "<req>"` → config.workers(codex/claude/test/fix/maxFixAttempts) +
  test.command + obsidian.vault를 기본값으로 사용. `--codex`/`--no-codex` 등 플래그가
  override.
- journal/run의 config 소비가 단일 `loadConfig`로 통일(동작 동일).

## Constraints

- 우선순위: 명시 플래그 > config > 내장 기본값. 부정 플래그로 config-on 끄기 가능.
- BatonConfig Zod 검증, 쓰기는 `.baton/config.json`에만. 잘못된 값 거부.
- vault는 `$BATON_OBSIDIAN_VAULT` > config(기존 유지). 회귀 없음.
- credential/세션 토큰 무접근. 스키마 additive(version 1 유지). FS 테스트는 임시 cwd.

## Assumptions

### Safe

- config는 프로젝트 로컬(`.baton/config.json`). 전역 config는 범위 밖.
- `BatonConfig` = { version:1, obsidian?{vault?}, test?{command?:string[]},
  workers?{codex?,claude?,test?,fix?,maxFixAttempts?} }. 모두 optional(version 제외).
- `config set`은 점(dot) 경로 키 + 값 코어션(boolean/number/string/JSON 배열) 후
  전체 Zod 검증.

### Risky

- **부정 플래그 도입**: config-on을 CLI에서 끄려면 `--no-codex`/`--no-claude`/
  `--no-test`/`--no-fix`가 필요. 플래그 파싱에 on/off 3-상태(미지정/on/off) 도입 →
  resolve 로직을 명확히(미지정이면 config, 지정이면 그 값).
- **config set 타입 코어션**: 점 경로 + 값 파싱(true/false/숫자/JSON)을 안전하게.
  실패/검증 위반은 명확한 에러. 알 수 없는 키는 거부(스키마 기준).
- **리팩터 회귀**: journal vault / run testCommand가 loadConfig로 바뀌어도 의미 동일
  유지(env 우선순위·기본값). 기존 v0.5/v0.7 테스트 회귀 없어야 함.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 부정 플래그(`--no-codex` 등)를 둘지(기본: 둠 — config override 완전성).
2. `config set` 값 코어션 범위(boolean/number/string/JSON 배열). 기본 그대로.

## Risks

`risks.md` 참조. 핵심: 우선순위 모호, 부정 플래그 3-상태, config set 코어션/검증,
리팩터 회귀, 잘못된 config로 run 실패, 보안 회귀.

## Recommendation

통합 `BatonConfig` Zod + core `loadConfig`로 단일 출처를 만들고, journal/run의 산발
파싱을 이로 리팩터한다. `baton run`은 "플래그 > config > 기본값" 3단 우선순위로 워커
구성을 해석하며 부정 플래그로 완전한 override를 제공한다. `baton config list/get/set`
으로 관리하고 set은 Zod로 검증한다. 기존 플래그 경로는 회귀 없이 유지한다.
상세는 `design.md`.
