# Implementation Design

## Summary

터미널에서 Baton run 이력을 조회하는 읽기 전용 CLI를 추가한다. 현재 `cli/journal.ts`
에 묻힌 run 스캔 로직을 core `listRuns`/`summarizeRuns`로 승격해 journal과 history가
공유하고, 그 위에 `baton run list`(필터/요약/--json)와 `baton run show <runId>`(상세)를
얇게 얹는다. 손상 run은 skip하되 개수를 표시하고 정렬은 결정적이게 한다.

## Scope

### In Scope

- core `listRuns({cwd,status?,limit?})` + `summarizeRuns` + `LoadedRun`(승격/신규)
- `cli/journal.ts`를 core `listRuns`로 리팩터(중복 제거, 회귀 없음)
- CLI `run list`(표/필터/`--status`/`--limit`/`--json`/skip 표기)
- CLI `run show <runId>`(상세: 요청/step/승인/worktree/아티팩트 목록)
- 단위/통합/안전 테스트

### Out of Scope

- SQLite, 실시간 watch, 커서 페이지네이션, 다중 프로젝트, run 삭제/편집

## Proposed Architecture

```text
core/runs/listRuns.ts
  listRuns({cwd, status?, limit?}) → { runs: LoadedRun[], skipped: number }
    ├─ readdir(<cwd>/.baton/runs)
    ├─ 각 <id>/run.json 읽고 RunSchema.safeParse
    │     실패/부재 → skipped++
    ├─ sort: createdAt desc, then runId asc
    ├─ status 필터 → limit 절단
  summarizeRuns(runs) → { total, byStatus: Record<RunStatus, number> }

cli/commands/run.ts
  case "list":  runListCommand   # listRuns + 표/--json + skipped 표기 + summarize
  case "show":  runShowCommand   # RunStore.load + 아티팩트 목록(ArtifactStore.getRunDir)
  case "status": (기존, 하위호환)

cli/commands/journal.ts
  loadRuns* 제거 → core listRuns 재사용 (정렬/필터 의미 동일)
```

읽기 전용. 상태 변경/쓰기/삭제 없음.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/runs/listRuns.ts`(신규) | `listRuns`/`summarizeRuns`/`LoadedRun`, 스캔·정렬·필터·skip 집계 |
| `packages/core/src/index.ts` | 재export |
| `packages/cli/src/commands/journal.ts` | core `listRuns`로 리팩터(자체 스캔 제거) |
| `packages/cli/src/commands/run.ts` | `case "list"`/`case "show"` + `runListCommand`/`runShowCommand` + usage |
| `packages/cli/src/main.ts` | help 갱신(필요 시) |
| `README.md` | `run list`/`run show` 사용법, `--json` |
| `packages/*/test/*` | listRuns/summarize/journal 회귀/CLI list·show/안전 테스트 |

## Data Model Changes

스키마 변경 없음(기존 `Run` 재사용). 신규 타입:

```ts
type LoadedRun = { run: Run; directory: string };
type ListRunsResult = { runs: LoadedRun[]; skipped: number };
type RunSummary = { total: number; byStatus: Record<RunStatus, number> };
```

`--json` 출력 스키마(고정):
```jsonc
[{ "runId","status","dryRun","workflowId","createdAt","updatedAt?",
   "stepCount","outcome?" }]
```

## API / CLI Changes

```bash
baton run list                          # createdAt desc 표
baton run list --status completed       # 상태 필터
baton run list --limit 10               # 상위 N
baton run list --json                   # 안정적 JSON 배열
baton run show <runId>                  # 상세
baton run status <runId>                # (기존, 하위호환)
```

신규 core API: `listRuns`, `summarizeRuns`, `LoadedRun`.

## Workflow Changes

실행/엔진 의미 불변. 추가는 읽기 전용 조회 + 스캔 로직의 core 통합뿐. journal은
core API로 위임해 동작 동일.

## Error Handling

- 손상/부재 run.json → 목록에서 skip + skipped 개수 표시(조용한 누락 금지).
- `run show` 없는 runId → 명확한 에러 + 비정상 종료.
- 빈 이력 → 빈 상태 안내 + 종료 코드 0.
- `--status`/`--limit` 잘못된 값 → 사용법 + 비정상 종료.

## Security Considerations

- list/show/listRuns는 읽기 전용(쓰기/삭제 호출 없음).
- run 디렉터리 내부만 읽음. credential/세션 토큰 무접근(기존 안전 유지).
- `danger-full-access` 무관. 보안 회귀 테스트 유지.

## Test Plan

`test-plan.md` 참조. 요지: 정렬 결정성, 필터/limit, 손상 run skip+개수, journal 회귀,
표/`--json`, show 상세/없는 runId, 읽기 전용 단언.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-501 → task-505 의존성 순서를 따른다.
- v0.1~v0.5 공개 동작/테스트를 깨지 말 것(특히 journal v0.5 회귀).
- 조회는 읽기 전용 — 어떤 상태 변경/쓰기/삭제도 추가하지 말 것.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- SQLite, 실시간 watch, 다중 프로젝트, run 편집/삭제.

## Review Checklist

- [ ] listRuns 정렬 결정적(createdAt desc, runId asc), 손상 run skip+개수.
- [ ] journal이 core listRuns 사용, v0.5 회귀 없음.
- [ ] run list 표/필터/limit/--json/빈 상태/skip 표기.
- [ ] run show 상세 + 없는 runId 에러, status 하위호환.
- [ ] 읽기 전용(쓰기/삭제 없음), credential/세션 토큰/danger 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.5 누적). 예:
  `git worktree add ../baton-run-history-v0.6 -b baton/run-history-v0.6 origin/main`
- 분기 직후 v0.5 파일 존재 확인:
  `packages/core/src/journal/ObsidianJournalExporter.ts`,
  `packages/cli/src/commands/journal.ts`(`loadRunsWithDirectories`), 그리고
  `git merge-base --is-ancestor origin/main HEAD`로 base 검증.
- 리뷰 시 테스트 총개수가 직전(98)보다 줄면 base를 의심하라.

### Goal

터미널에서 Baton run 이력을 조회하는 읽기 전용 CLI를 추가한다. `cli/journal.ts`의
run 스캔 로직을 core `listRuns`/`summarizeRuns`로 승격해 재사용하고, `baton run list`
(상태/limit 필터 + `--json` + 손상 run skip 표기)와 `baton run show <runId>`(상세)를
얇게 얹는다. 엔진/상태는 건드리지 않는 순수 읽기 레이어다.

성공 기준은 "조회 동작"뿐 아니라 **읽기 전용 + 결정적 정렬 + 손상 run 명시 skip +
journal 회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/run-history-v0.6/design.md`
3. `.baton/runs/run-history-v0.6/tasks.json`
4. `.baton/runs/run-history-v0.6/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.5 코드 컨벤션(`RunStore`, `cli/journal.ts`의 loadRuns, `run.ts`의
   status/printRun/printSteps)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/runs/listRuns.ts`
- `packages/core/test/listRuns.test.ts`

### Files to Modify

- `packages/core/src/index.ts` — `listRuns`/`summarizeRuns`/`LoadedRun` re-export
- `packages/cli/src/commands/journal.ts` — 자체 run 스캔 제거 → core `listRuns` 사용
- `packages/cli/src/commands/run.ts` — `case "list"`/`case "show"` + `runListCommand`/
  `runShowCommand` + usage 갱신
- `packages/cli/src/main.ts` — help 갱신(필요 시)
- `packages/cli/test/cli.test.ts` — list/show/skip/--json/status 회귀 테스트
- `README.md` — `run list`/`run show` 문서화

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 상태 변경/쓰기/삭제 경로 추가 금지(조회는 순수 읽기).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/run-history-v0.6/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. core `listRuns({cwd,status?,limit?}) → {runs:LoadedRun[], skipped}` + `summarizeRuns`
   (createdAt desc, runId asc, Zod 검증, 손상/부재 skip+개수) + 테스트. (task-501)
3. `cli/journal.ts`를 core `listRuns`로 리팩터(자체 스캔 제거), v0.5 회귀 확인. (task-502)
4. `run list`: 표(runId/status/workflow/생성일/step수/outcome) + `--status`/`--limit`/
   `--json`(고정 스키마) + skip 표기 + 빈 상태 + 테스트. (task-503)
5. `run show <runId>`: 요청/step 표(타이밍·reason)/승인/worktree·cleaned/아티팩트
   파일 목록 + 없는 runId 에러 + status 하위호환 + 테스트. (task-504)
6. README/help 갱신, 보안·읽기전용 회귀 테스트, 전체 게이트 + 스모크, 자체 diff
   리뷰, 최종 요약. (task-505)

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

`.baton/runs/run-history-v0.6/acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.
특히: 정렬 결정성(AC-02), 손상 run skip+개수(AC-03/10), journal 회귀 없음(AC-07),
`--json` 안정 스키마(AC-09), show 상세/없는 runId(AC-12/13), 읽기 전용(AC-15).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 조회는 읽기 전용(상태 변경/쓰기/삭제 없음).
- 결정적 정렬(createdAt desc, runId asc), 손상 run은 조용한 누락 금지(개수 표시).
- credential/세션 토큰 무접근, danger 금지(기존 안전 유지).
- base = `origin/main`. 작업은 새 worktree에서. **commit/push 하지 말 것**.

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
- SQLite, watch, 다중 프로젝트 등 남은 항목

## Notes for Reviewer
- 읽기 전용, 정렬 결정성, 손상 run skip+개수, journal 회귀 없음, --json 스키마,
  show 상세/없는 runId를 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
