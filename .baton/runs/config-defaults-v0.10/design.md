# Implementation Design

## Summary

완성된 파이프라인을 실사용 가능하게: 워커/볼트/테스트/fix 설정을 통합
`BatonConfig`(`.baton/config.json`)에 저장해 `baton run`의 기본값으로 쓴다. core
`loadConfig`로 단일 출처를 만들고 산발 파싱(journal vault, run testCommand)을
리팩터한다. `baton run`은 "명시 플래그 > config > 내장 기본값" 3단 우선순위로 워커
구성을 해석하며 부정 플래그로 완전한 override를 제공한다. `baton config list/get/set`
으로 관리하고 set은 Zod로 검증한다. 기존 플래그 경로는 회귀 없이 유지한다.

## Scope

### In Scope

- `BatonConfig` Zod 스키마 + core `loadConfig(cwd)`
- journal/run의 config 소비를 loadConfig로 리팩터(동작 동일)
- `baton run` config 기반 기본값 + 플래그/부정 플래그 override
- `baton config list|get|set`, `baton init` 템플릿
- 단위/통합/안전 테스트

### Out of Scope

- SQLite, 전역(홈) config, 환경변수 전체 매핑, 대화형 마법사, config 원자적 쓰기

## Proposed Architecture

```text
BatonConfig (schemas, Zod)
  { version:1, obsidian?{vault?}, test?{command?:string[]},
    workers?{codex?,claude?,test?,fix?,maxFixAttempts?(1..5)} }

core/config/loadConfig(cwd)
  read <cwd>/.baton/config.json → JSON.parse → BatonConfigSchema.parse
    부재 → { version:1 } (빈 기본)
    손상/위반 → throw(경로 포함)

cli/commands/run.ts
  config = loadConfig(cwd)
  opts = resolveRunOptions({ flags, config })   # 플래그 > config > 기본
     codex = flags.codex ?? config.workers?.codex ?? false   # 3-상태
     ... claude/test/fix 동일, maxFixAttempts = flags ?? config ?? 1
     testCommand = flags.testCommand ?? config.test?.command
  registry = createWorkerRegistry({ ...opts })
  vault = resolveObsidianVault({ env, config })  # env > config (유지)

cli/commands/config.ts
  list → loadConfig 출력
  get <dotted> → 경로 값
  set <dotted> <value> → load → setAtPath(coerce(value)) → BatonConfigSchema.parse
                          → write .baton/config.json (기존 필드 보존)
```

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/batonConfig.schema.ts`(신규) | BatonConfig Zod + 타입 |
| `packages/schemas/src/index.ts` | re-export |
| `packages/core/src/config/loadConfig.ts`(신규) | 읽기+검증, 부재 빈 기본 |
| `packages/core/src/index.ts` | re-export |
| `packages/cli/src/commands/run.ts` | loadConfig + resolveRunOptions(플래그/부정/config) |
| `packages/cli/src/commands/journal.ts` | loadConfig로 vault 해석 리팩터 |
| `packages/cli/src/commands/config.ts`(신규) | list/get/set + dotted 경로 + 코어션 |
| `packages/cli/src/commands/init.ts` | 풍부한 템플릿(idempotent) |
| `packages/cli/src/main.ts` | `config` 라우팅, help |
| `README.md` | config/기본값/우선순위 문서화 |
| `packages/*/test/*` | schema/loadConfig/resolve/config/run/회귀/보안 테스트 |

## Data Model Changes

```ts
// batonConfig.schema.ts
BatonConfig = {
  version: 1;
  obsidian?: { vault?: string };
  test?: { command?: string[] };
  workers?: {
    codex?: boolean; claude?: boolean; test?: boolean; fix?: boolean;
    maxFixAttempts?: number;   // 1..5 (FixPolicy와 일관)
  };
}
```

기존 `{version:1}` 하위호환(전부 optional). 기존 `ObsidianVaultConfig`/testCommand
형태는 BatonConfig의 부분집합으로 흡수.

## API / CLI Changes

```bash
baton config list
baton config get workers.codex
baton config set workers.codex true
baton config set workers.maxFixAttempts 3
baton config set test.command '["pnpm","test"]'
baton config set obsidian.vault /path/to/vault

baton run "<request>"                 # config 기본값으로 동작
baton run "<request>" --no-codex      # config-on을 끔
```

신규 core API: `BatonConfig`, `loadConfig`. 신규 CLI: `config` 명령, `resolveRunOptions`.

## Workflow Changes

실행 의미 불변. run의 워커 구성 결정이 플래그-only에서 "플래그>config>기본"으로 확장.
journal/run의 config 소비가 단일 loadConfig로 통일.

## Error Handling

- loadConfig: 부재 → 빈 기본. 손상/Zod 위반 → 명확한 에러(경로). run은 config 없거나
  비어도 기본값으로 동작.
- `config set`: 코어션 실패/스키마 위반/알 수 없는 키 → 거부(미기록) + 에러 + 비정상 종료.
- `--codex --no-codex` 동시 → 충돌 에러.
- run은 config가 잘못돼도 안전하게 실패(상태 보존).

## Security Considerations

- config 읽기/쓰기는 `.baton/config.json`에만. 외부/네트워크/토큰 미접근.
- credential/세션 토큰 무접근. `danger-full-access` 무관.
- 보안 회귀 테스트 유지.

## Test Plan

`test-plan.md` 참조. 요지: 스키마/loadConfig 하위호환, resolveRunOptions 3단 우선순위
+ 부정 플래그, config list/get/set 라운드트립·검증, run config 기반 + override,
init idempotent, journal/test 리팩터 회귀, 보안.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-901 → task-905 의존성 순서를 따른다.
- v0.1~v0.9 공개 동작/테스트를 깨지 말 것(특히 v0.5 vault / v0.7 testCommand / 모든
  플래그 경로). config 미설정 시 기존 기본값과 동일.
- 우선순위 명문화(플래그 > config > 기본), 부정 플래그 3-상태.
- strict TS/ESM(.js), 런타임 의존성 추가 없음. 스키마 additive.

## Non-Goals

- SQLite, 전역 config, 환경변수 전체 매핑, 대화형 마법사.

## Review Checklist

- [ ] BatonConfig optional/하위호환, loadConfig 부재 no-op·위반 에러.
- [ ] journal/run 리팩터 회귀 없음(vault env>config, testCommand).
- [ ] resolveRunOptions 우선순위(플래그>config>기본), 부정 플래그, 충돌 에러.
- [ ] config set 코어션/머지/검증/보존, 잘못된 값 거부. init idempotent.
- [ ] config는 `.baton/config.json` 한정, credential/토큰/danger 회귀 없음. v0.1~v0.9 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.9 누적). 예:
  `git worktree add ../baton-config-defaults-v0.10 -b baton/config-defaults-v0.10 origin/main`
- 분기 직후 확인: `packages/core/src/runs/RunExecutor.ts`(v0.9 fix 루프),
  `packages/cli/src/commands/journal.ts`(loadWorkspaceConfig),
  `packages/cli/src/commands/run.ts`(resolveTestCommand, --fix), 그리고
  `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(145)보다 줄면 base를 의심하라.

### Goal

완성된 파이프라인을 실사용 가능하게: 워커/볼트/테스트/fix 설정을 통합 `BatonConfig`
(`.baton/config.json`)에 저장해 `baton run` 기본값으로 쓴다. core `loadConfig`로 단일
출처를 만들고 산발 파싱을 리팩터한다. run은 "명시 플래그 > config > 내장 기본값" 3단
우선순위 + 부정 플래그로 완전한 override를 제공한다. `baton config list/get/set`으로
관리한다. **기존 플래그 경로는 회귀 0.**

성공 기준은 "config 기능"뿐 아니라 **3단 우선순위 정확성 + 리팩터 회귀 0 + 검증된
set + 하위호환**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/config-defaults-v0.10/design.md`
3. `.baton/runs/config-defaults-v0.10/tasks.json`
4. `.baton/runs/config-defaults-v0.10/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.9 코드 컨벤션(journal의 loadWorkspaceConfig, run의 resolveTestCommand,
   resolveObsidianVault, createWorkerRegistry)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/schemas/src/batonConfig.schema.ts`
- `packages/core/src/config/loadConfig.ts`
- `packages/cli/src/commands/config.ts`
- `packages/core/test/loadConfig.test.ts`, `packages/schemas/test/batonConfig.test.ts`

### Files to Modify

- `packages/schemas/src/index.ts` / `packages/core/src/index.ts` — re-export
- `packages/cli/src/commands/run.ts` — loadConfig + `resolveRunOptions`(플래그/부정/
  config) + executor 전달
- `packages/cli/src/commands/journal.ts` — loadConfig로 vault 해석(중복 파싱 제거)
- `packages/cli/src/commands/init.ts` — 풍부한 템플릿(idempotent)
- `packages/cli/src/main.ts` — `config` 라우팅 + help
- `packages/cli/test/cli.test.ts` — config/run-with-config/회귀 테스트
- `README.md` — config/기본값/우선순위 문서화

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 전역/홈 config 도입 금지(프로젝트 로컬만). SQLite 금지.
- 기존 플래그 경로 동작 변경 금지(config 미설정 시 회귀 0).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/config-defaults-v0.10/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `BatonConfig` Zod(version + obsidian/test/workers, optional, maxFixAttempts 1~5) +
   core `loadConfig(cwd)`(부재 빈 기본, 위반 에러) + 하위호환 테스트. (task-901)
3. journal/run의 config 소비를 loadConfig로 리팩터(vault env>config, testCommand 의미
   유지) + v0.5/v0.7 회귀 확인. (task-902)
4. `resolveRunOptions({flags, config})`: 플래그>config>기본, 부정 플래그(--no-x),
   `--codex --no-codex` 충돌 에러; run에 연결 + 테스트(각 조합). (task-903)
5. `baton config list|get|set`(dotted 경로, 값 코어션, 머지·Zod 검증·기록, 기존 보존,
   잘못된 값/키 거부) + `init` 풍부 템플릿(idempotent) + main 라우팅 + 테스트. (task-904)
6. README/help, 보안 회귀(토큰/danger 0, `.baton/config.json` 한정), 전체 게이트 +
   스모크, 자체 diff 리뷰, 최종 요약. (task-905)

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

`.baton/runs/config-defaults-v0.10/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: 우선순위 플래그>config>기본(AC-07), 부정 플래그/충돌(AC-07/08), config 미설정
회귀(AC-09), set 검증/보존(AC-12/13), 리팩터 회귀 0(AC-04), 하위호환(AC-03).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 우선순위: 명시 플래그 > config > 내장 기본값. 부정 플래그 3-상태.
- config 읽기/쓰기는 `.baton/config.json`에만. 스키마 additive. 기존 플래그 회귀 0.
- credential/세션 토큰 무접근. base = `origin/main`. 새 worktree. **commit/push 금지**.

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
- SQLite, 전역 config, 원자적 쓰기 등 남은 항목

## Notes for Reviewer
- 3단 우선순위·부정 플래그, 리팩터 회귀 0, config set 검증/보존, 하위호환, config
  미설정 회귀를 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
