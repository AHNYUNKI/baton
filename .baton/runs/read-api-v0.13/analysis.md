# Analysis

## User Request

향후 Swift macOS GUI가 붙을 통합 계약을 확정한다: 버전드 JSON 스냅샷 read API +
NDJSON watch 스트림. HTTP 데몬 없이 CLI 표면으로 제공(로컬 우선).

## Intent

직전 순서 논의 결론: SQLite 인덱스(v0.12) 다음, GUI의 마지막 전제조건은 **안정적
read API + 라이브 경계**다. 가치의 핵심은 "GUI가 신뢰하고 바인딩할 기계가독 계약"을
지금 못박는 것 — 나중에 GUI를 짠 뒤 출력 형태를 바꾸면 재작업이 발생한다. HTTP 서버는
비목표라, CLI `--json`(스냅샷) + `watch` NDJSON(라이브)로 최소·로컬 우선 계약을 만든다.

## Current Repository Understanding (v0.12 / main 05708ab 기준)

- `packages/cli/src/commands/run.ts` — `run list --json`은 `toRunListJson(run)` 배열을
  **봉투 없이** 출력. `run show`/`run status`는 `printRun`/`printSteps`(텍스트 전용).
- `listRuns({cwd, index?})`(v0.6/v0.12) — 인덱스 우선 + 파일 폴백. **스냅샷 소스**.
- `summarizeRuns(runs)`(v0.6) — total + 상태별 카운트. **state 개요 소스**.
- `RunStore.load(runId)` — 단건 상세(run.json). `ArtifactStore.getRunDir` — 아티팩트 목록.
- 봉투/버전/이벤트 스키마 없음. watch/serve 없음.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/readApi.schema.ts`(신규) | 봉투 + watch 이벤트 Zod(버전/검증) |
| `packages/core/src/runs/detectRunChanges.ts`(신규) | 순수 스냅샷 diff |
| `packages/cli/src/commands/run.ts` | 봉투화 list/show/status `--json` |
| `packages/cli/src/commands/state.ts`(신규) | 개요 [--json] |
| `packages/cli/src/commands/watch.ts`(신규) | NDJSON 스트림(--interval/--once) |
| `packages/cli/src/main.ts` | state/watch 라우팅 |
| `docs/INTEGRATION.md`(신규) | GUI 통합 계약 |

## Existing Behavior

read 출력은 사람용 텍스트 + `run list --json`(봉투 없는 배열)뿐. 라이브 갱신 경계 없음.
GUI가 바인딩할 안정적·버전드 계약과 변경 스트림이 없다.

## Target Behavior

- read `--json` 출력이 봉투 `{ schemaVersion:1, kind, data }`로 표준화.
  - `run list --json` → kind `run-list`, data = run 요약 배열(+ skipped).
  - `run show --json` / `run status --json` → kind `run-detail`, data = run + 아티팩트 목록.
  - `baton state --json` → kind `state`, data = { total, byStatus, recent[] }.
- `baton state`(텍스트) → 사람용 개요.
- `baton watch [--interval <s>] [--once]` → NDJSON: 첫 스냅샷 이벤트들 후, poll마다
  `detectRunChanges` diff 이벤트(run.created/run.updated/run.status-changed/run.removed).
  `--once`는 현재 스냅샷을 1회 emit하고 종료(결정적).
- `docs/INTEGRATION.md`가 봉투/명령별 data/이벤트/버전 정책을 GUI 관점에서 기술.

## Constraints

- read 전용(상태 변경 없음). 결정적·버전드 출력. watch는 bounded poll, HTTP 없음.
- 봉투 표준화는 계약 기준선(schemaVersion 1) — 기존 `run list --json` 형태 변경은
  의도적·문서화·테스트 갱신.
- credential/세션 토큰 무접근. 모든 FS/clock 주입·임시 디렉터리 테스트.

## Assumptions

### Safe

- 스냅샷 소스는 listRuns(인덱스/파일 폴백) + RunStore.load + summarizeRuns 재사용.
- 봉투는 `{schemaVersion:number, kind:string, data:unknown}`(Zod로 검증·문서화).
- watch는 polling(파일/인덱스 mtime 또는 listRuns 재스캔) + 순수 diff.

### Risky

- **봉투 표준화의 호환성**: `run list --json` 배열 → 봉투로 변경. 외부 소비자 없음(프리
  릴리스)이라 지금 표준화가 옳음. v0.6 테스트는 의도적으로 갱신. 문서에 schemaVersion
  정책 명시.
- **watch 테스트성**: 연속 루프는 비결정적 → 순수 `detectRunChanges`를 단위 테스트하고,
  `watch --once`(1회 스냅샷)로 결정적 경로 제공. 연속 모드는 얇은 래퍼(interval로
  bounded, SIGINT 종료), 가볍게만 검증.
- **이벤트 의미**: created(신규 runId)/removed(사라진 runId)/status-changed(status 변경)/
  updated(updatedAt 변경). 명확히 정의·테스트.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. HTTP 데몬 대신 CLI `--json` + `watch` NDJSON로 갈지(기본 — 비목표 존중).
2. 봉투 형태 `{schemaVersion,kind,data}`로 표준화(기본).

## Risks

`risks.md` 참조. 핵심: 봉투 호환성, watch 비결정/누수, 이벤트 의미 모호, 폴백 회귀,
스키마 버전 정책, 보안.

## Recommendation

HTTP 서버 없이 CLI 표면으로 GUI 계약을 제공한다: read `--json`을 버전드 봉투로
표준화하고, `baton state`(개요)와 `baton watch`(NDJSON, 순수 diff + --once)를 추가한다.
스냅샷은 v0.12 인덱스/파일 폴백을 재사용한다. 순수 `detectRunChanges`로 watch를
결정적으로 테스트하고, `docs/INTEGRATION.md`로 계약을 명문화한다. 상세는 `design.md`.
