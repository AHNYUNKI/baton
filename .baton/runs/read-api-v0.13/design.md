# Implementation Design

## Summary

향후 Swift macOS GUI가 바인딩할 **통합 계약**을 HTTP 데몬 없이 CLI 표면으로 확정한다.
read `--json` 출력을 버전드 봉투 `{ schemaVersion, kind, data }`로 표준화하고,
`baton state`(개요)와 `baton watch`(NDJSON 변경 스트림, 순수 diff + `--once`)를 추가한다.
스냅샷은 v0.12 인덱스/파일 폴백을 재사용한다(read 전용). `docs/INTEGRATION.md`로 계약을
명문화한다. 로컬 우선·비목표(Local API server) 존중.

## Scope

### In Scope

- `readApi.schema.ts`(봉투 + watch 이벤트 Zod)
- read `--json` 봉투화: `run list`, `run show`, `run status`
- `baton state [--json]`(개요)
- `detectRunChanges`(순수) + `baton watch [--interval <s>] [--once]`(NDJSON)
- `docs/INTEGRATION.md` + README 링크
- 단위/통합/안전 테스트

### Out of Scope

- HTTP/소켓 서버, 데몬, 인증, 웹소켓, 양방향 쓰기 API, 실제 GUI

## Proposed Architecture

```text
JSON envelope (schemas):
  { "schemaVersion": 1, "kind": "run-list"|"run-detail"|"state", "data": ... }

read commands (read-only, snapshot = listRuns(v0.12 index/file fallback)):
  run list --json   → kind run-list,  data { runs:[summary], skipped }
  run show --json   → kind run-detail, data { run, artifacts:[file] }
  run status --json → kind run-detail (동일)
  state --json      → kind state,      data { total, byStatus, recent:[summary] }
  state             → 사람용 텍스트 개요

watch (NDJSON stdout, HTTP 없음):
  detectRunChanges(prev, curr) → events[]   # 순수: created/removed/status-changed/updated
  baton watch --once            → 현재 스냅샷을 이벤트로 1회 emit 후 종료(결정적)
  baton watch [--interval s]    → 초기 스냅샷 emit 후, interval마다 listRuns 재스냅샷 →
                                   detectRunChanges diff emit. SIGINT/SIGTERM 클린 종료.
  각 이벤트 = 한 줄 JSON(개행 종료): { schemaVersion, kind:"event", data:{type,runId,...} }
```

read/watch는 v0.12 스냅샷 소스를 재사용 — 신규 스캔/쓰기 없음.

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/readApi.schema.ts`(신규) | 봉투 + 이벤트 Zod + 타입 |
| `packages/schemas/src/index.ts` | re-export |
| `packages/core/src/runs/detectRunChanges.ts`(신규) | 순수 스냅샷 diff |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/run.ts` | list/show/status `--json` 봉투화 |
| `packages/cli/src/commands/state.ts`(신규) | 개요 [--json] |
| `packages/cli/src/commands/watch.ts`(신규) | NDJSON 스트림(--interval/--once) |
| `packages/cli/src/main.ts` | state/watch 라우팅, help |
| `docs/INTEGRATION.md`(신규) | GUI 통합 계약 |
| `README.md` | INTEGRATION 링크 |
| `packages/*/test/*` | schema/diff/json/state/watch/security 테스트 |

## Data Model Changes

```ts
// readApi.schema.ts
JsonEnvelope<T> = { schemaVersion: 1; kind: string; data: T };
RunSummaryJson = { runId, status, dryRun, workflowId, createdAt, updatedAt?, stepCount, outcome? };
RunDetailJson = { run: <Run>, artifacts: string[] };
StateJson = { total: number, byStatus: Record<RunStatus, number>, recent: RunSummaryJson[] };
WatchEvent = { type: 'run.created'|'run.updated'|'run.status-changed'|'run.removed',
               runId, status, ... };  // 봉투 kind:"event"로 감싸 NDJSON 한 줄
```

`Run` 스키마/run.json 불변. 출력 표현만 추가.

## API / CLI Changes

```bash
baton run list --json        # {schemaVersion,kind:"run-list",data}
baton run show <id> --json   # kind:"run-detail"
baton run status <id> --json # kind:"run-detail"
baton state [--json]         # 개요
baton watch [--interval <s>] [--once]   # NDJSON 변경 스트림
```

신규 core: `detectRunChanges`, read API 스키마. 신규 CLI: `state`, `watch`.

## Workflow Changes

실행/엔진 불변. read 표면을 버전드 계약으로 표준화 + 라이브 경계 추가(읽기 전용).

## Error Handling

- 없는 runId(show/status) → 명확한 에러 + 비정상 종료(기존).
- watch: interval 잘못된 값 → 검증 에러. 폴링 중 일시적 읽기 실패 → 다음 tick 재시도/경고
  (크래시 금지). --once는 1회 후 종료.
- 인덱스 비가용 → 파일 폴백(무중단).

## Security Considerations

- read 전용(쓰기/삭제 없음). HTTP/소켓 서버 미도입(네트워크 노출 0).
- watch는 로컬 파일/인덱스 polling만. credential/세션 토큰 무접근.
- `danger-full-access` 무관. 보안 회귀 테스트(서버 API 부재 포함).

## Test Plan

`test-plan.md` 참조. 요지: 봉투/이벤트 스키마, detectRunChanges 4케이스, --json 파싱·
kind, state, watch --once 결정적 NDJSON, read-only/폴백, 보안(서버 부재).

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-R01 → task-R05 의존성 순서를 따른다.
- HTTP/소켓 서버 도입 금지(CLI `--json` + NDJSON stdout만). read 전용.
- watch는 bounded(interval/--once), tight 루프 금지, 클린 종료.
- 봉투 표준화로 갱신되는 기존 테스트는 의도적 갱신, 그 외 회귀 0.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- HTTP/소켓 서버, 데몬, 인증, 웹소켓, 쓰기 API, 실제 GUI.

## Review Checklist

- [ ] 봉투 `{schemaVersion,kind,data}` 일관, list/show/status/state --json 파싱 가능.
- [ ] detectRunChanges 4케이스 정확·결정적, watch --once 결정적 NDJSON, 연속 모드 bounded/클린 종료.
- [ ] read 전용(쓰기/삭제 없음), 스냅샷은 v0.12 폴백 재사용, 인덱스 비가용 회귀 0.
- [ ] HTTP/소켓 서버 부재, docs/INTEGRATION 정확·README 링크.
- [ ] credential/토큰/danger 회귀 없음, v0.1~v0.12 회귀 없음(봉투 갱신 제외).

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.12 누적). 예:
  `git worktree add ../baton-read-api-v0.13 -b baton/read-api-v0.13 origin/main`
- 분기 직후 확인: `packages/core/src/runs/RunIndex.ts`(v0.12),
  `packages/cli/src/commands/run.ts`(toRunListJson/--json), `packages/core/src/runs/
  listRuns.ts`, 그리고 `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(181)보다 줄면 base를 의심하라.

### Goal

향후 Swift macOS GUI가 바인딩할 통합 계약을 HTTP 데몬 없이 CLI 표면으로 확정한다.
read `--json`을 버전드 봉투 `{schemaVersion,kind,data}`로 표준화하고, `baton state`
(개요)와 `baton watch`(NDJSON 변경 스트림, 순수 diff + `--once`)를 추가한다. 스냅샷은
v0.12 인덱스/파일 폴백을 재사용(read 전용). `docs/INTEGRATION.md`로 계약을 명문화한다.

성공 기준은 "JSON/watch 추가"뿐 아니라 **버전드 봉투 일관성 + 순수 결정적 diff +
bounded watch(서버 없음) + read 전용 + 회귀 0**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/read-api-v0.13/design.md`
3. `.baton/runs/read-api-v0.13/tasks.json`
4. `.baton/runs/read-api-v0.13/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.12 코드(`listRuns`/`summarizeRuns`/`RunStore.load`, `run list --json`/
   `toRunListJson`, `run show/status` 텍스트)
6. `AGENTS.md`(Local API server는 비목표 — HTTP 서버 금지)

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/schemas/src/readApi.schema.ts`
- `packages/core/src/runs/detectRunChanges.ts`
- `packages/cli/src/commands/state.ts`
- `packages/cli/src/commands/watch.ts`
- `docs/INTEGRATION.md`
- `packages/core/test/detectRunChanges.test.ts`,
  `packages/schemas/test/readApi.test.ts`

### Files to Modify

- `packages/schemas/src/index.ts` / `packages/core/src/index.ts` — re-export
- `packages/cli/src/commands/run.ts` — list/show/status `--json` 봉투화(show/status에
  `--json` 추가)
- `packages/cli/src/main.ts` — state/watch 라우팅 + help
- `packages/cli/test/cli.test.ts` — json 봉투/state/watch 테스트(+ 기존 list --json 갱신)
- `README.md` — INTEGRATION 링크

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- HTTP/소켓 서버(`http.createServer`/`net`/`listen`) 도입 금지.
- 쓰기/상태 변경 API 금지(read 전용). 엔진/런타임 동작 변경 금지.
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/read-api-v0.13/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `readApi.schema.ts`(봉투 `{schemaVersion:1,kind,data}` + WatchEvent) + 테스트. (task-R01)
3. read `--json` 봉투화: `run list`(kind run-list, data {runs,skipped}), `run show`/
   `run status`(--json 추가, kind run-detail, data {run, artifacts}). 기존 list --json
   테스트 의도적 갱신 + 테스트. (task-R02)
4. `baton state [--json]`(summarizeRuns + recent; 텍스트/봉투) + 라우팅 + 테스트. (task-R03)
5. `detectRunChanges`(순수: created/removed/status-changed/updated, 결정적 정렬) +
   `baton watch [--interval <s>] [--once]`(초기 스냅샷 NDJSON, 연속은 interval polling +
   diff, SIGINT/SIGTERM 클린 종료, tight 루프 금지) + 테스트(diff 4케이스 + --once 결정적). (task-R04)
6. `docs/INTEGRATION.md`(봉투/명령별 data/이벤트/버전 정책) + README 링크, 보안 회귀
   (서버/토큰/danger 0), 전체 게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-R05)

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

`.baton/runs/read-api-v0.13/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: 봉투 일관(AC-01~05), detectRunChanges 정확(AC-07), watch --once 결정적/연속
bounded(AC-08/09), read 전용·폴백(AC-11/12), 서버 부재(AC-14), 봉투 갱신 외 회귀 0(AC-15).

### Constraints

- strict TS, ESM(.js), 런타임 의존성 zod/yaml만. HTTP/소켓 서버 금지(CLI JSON + NDJSON만).
- read 전용(쓰기/삭제 없음). watch bounded(interval/--once), 클린 종료, tight 루프 금지.
- 스냅샷은 v0.12 인덱스/파일 폴백 재사용. credential/세션 토큰 무접근.
- base = `origin/main`. 새 worktree. **commit/push 하지 말 것**.

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
- HTTP serve/소켓, 양방향 API, 실제 GUI 등 남은 항목

## Notes for Reviewer
- 봉투 일관·버전, detectRunChanges 결정적, watch --once/연속 bounded·클린 종료,
  read 전용·폴백, 서버 부재, docs 정확을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
