# Analysis

## User Request

터미널에서 Baton run 이력을 빠르게 조회하는 CLI를 추가한다. run 목록(`run list`)과
상세(`run show`)를 상태·날짜로 필터·요약해, Obsidian 기록(v0.5)을 보완하는 즉시
조회 레이어를 만든다.

## Intent

v0.5가 사람 친화 *기록*(Obsidian)을 줬다면, v0.6은 *조회*(터미널)다. 사용자가
"지금까지 무슨 run이 있었고 각각 어떤 상태인지"를 앱 전환 없이 즉시 확인하게 한다.
가치의 핵심은 새 저장소가 아니라 **기존 파일 기반 run 산출물을 읽기 전용으로
집계·표시**하는 얇은 레이어다(중복 로직은 core로 통합).

## Current Repository Understanding (v0.5 / main 5fe9923 기준)

- `packages/cli/src/commands/journal.ts` — `loadRunsWithDirectories(cwd)` /
  `loadRuns(cwd)`가 `.baton/runs/*/run.json`을 스캔해 `Run[]`/`LoadedRun[]` 반환.
  **이 로직이 CLI에 묻혀 있음** → core로 승격해 history/journal이 공유.
- `packages/core/src/runs/RunStore.ts` — `load(runId)`/`save`/`markCleaned`. 단건
  로드만, 목록 API 없음.
- `packages/cli/src/commands/run.ts` — `status`/`resume`/`approve`/`clean` +
  `printRun`/`printSteps` 헬퍼. `list`/`show` 추가 지점.
- `packages/core/src/artifacts/ArtifactStore.ts` — `getRunDir(runId)`(아티팩트 목록
  표시에 활용).
- `packages/schemas/src/run.schema.ts` — `Run`(status/steps/createdAt/updatedAt/
  worktreePath/approvals/cleanedAt 등). 조회 표시 데이터의 출처.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/runs/listRuns.ts`(신규) | run 스캔/정렬/필터/요약(core 승격) |
| `packages/core/src/index.ts` | `listRuns`/`summarizeRuns`/`LoadedRun` export |
| `packages/cli/src/commands/journal.ts` | core `listRuns`로 리팩터(중복 제거) |
| `packages/cli/src/commands/run.ts` | `run list`/`run show` 서브커맨드 |
| `packages/core/src/artifacts/ArtifactStore.ts` | show의 아티팩트 파일 목록 |

## Existing Behavior

run 조회는 단건 `baton run status <runId>`만 가능. 전체 목록/필터/요약 없음.
run 스캔 로직은 journal 명령 안에만 있어 재사용 불가.

## Target Behavior

- `baton run list` → 모든 run을 createdAt 내림차순 표로(runId, status, workflow,
  생성일, step 수, outcome). `--status <s>`/`--limit <n>`/`--json` 지원. 손상 run은
  건너뛰고 필요 시 "N skipped" 표기.
- `baton run show <runId>` → 상세: 요청, step 표(타이밍/reason), 승인, worktreePath/
  cleanedAt, run 디렉터리 아티팩트 파일 목록.
- `journal.ts`는 core `listRuns`를 사용(동작 동일, 회귀 없음).

## Constraints

- 읽기 전용(상태 변경 없음). 손상/비-run 디렉터리는 조용히 skip(개수 집계 가능).
- 결정적 정렬: createdAt 내림차순, 동률 시 runId 오름차순.
- `--json` 출력은 안정적 스키마(스크립팅 친화).
- credential/세션 토큰 무접근, danger 금지(기존 안전 유지).
- 모든 FS 테스트는 임시 `.baton` 디렉터리. base = `origin/main`.

## Assumptions

### Safe

- run 식별은 `.baton/runs/<id>/run.json` 존재 여부. journal 노트(.md)나 worktrees는
  대상 아님.
- `summarizeRuns`는 상태별 카운트 + 총계만(단순).
- show는 RunStore.load 재사용 + 아티팩트 목록(디렉터리 나열).

### Risky

- **core 승격 리팩터**: `loadRuns`/`loadRunsWithDirectories`를 core로 옮기면
  journal.ts가 이를 import하도록 변경해야 한다. journal 동작/테스트 회귀가 없어야
  한다(같은 정렬·필터 의미 유지).
- **정렬 안정성**: createdAt 동일 run이 있을 수 있어 runId 2차 키로 결정성 확보.
- **손상 run 처리**: Zod 실패 run은 목록에서 제외하되, `list`가 조용한 누락으로
  오해되지 않게 skip 개수를 표시(no silent cap 원칙).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. `run show`를 신규로 둘지 vs 기존 `status` 확장. 기본: **show 신규**, status는
   하위호환 유지(또는 show로 위임).
2. `list` 기본 컬럼 세트(runId/status/workflow/생성일/step수/outcome). 기본 그대로.

## Risks

`risks.md` 참조. 핵심: core 승격 시 journal 회귀, 손상 run의 조용한 누락, 비결정적
정렬, 대량 run 성능, --json 스키마 불안정.

## Recommendation

run 스캔 로직을 core `listRuns`/`summarizeRuns`로 승격해 journal과 history가 공유한다.
CLI에 읽기 전용 `run list`(필터/요약/--json)와 `run show`(상세)를 얇게 추가한다.
손상 run은 skip하되 개수를 표시하고, 정렬은 createdAt 내림차순+runId로 결정적이게
한다. journal.ts는 core API로 리팩터해 회귀 없이 중복을 제거한다. 상세는 `design.md`.
