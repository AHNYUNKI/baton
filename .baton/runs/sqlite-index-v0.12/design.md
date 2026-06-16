# Implementation Design

## Summary

`node:sqlite`(Node 내장)를 v0.1의 `DbClient` 인터페이스 뒤에 연결해 run 메타데이터를
**쿼리 가능한 인덱스**로 만든다. **파일(run.json)은 source-of-truth로 유지**하고
SQLite는 파생 인덱스로 둔다. 드라이버 가용성 가드로 구버전 Node에서도 폴백(회귀 0),
`RunStore.save`는 best-effort upsert, `listRuns`는 인덱스 우선 + 파일 폴백(동일 결과).
`baton db status|reindex`로 운영성을 더한다. GUI가 바인딩할 안정적 데이터 계약의
첫 디딤돌.

## Scope

### In Scope

- `NodeSqliteClient`(node:sqlite) + `openDatabase` 가용성 가드
- `runs` 인덱스 테이블 + `RunIndex`(upsert/list/reindex)
- `RunStore.save` best-effort 인덱스 upsert(실패-안전)
- `listRuns` 인덱스 우선 + 파일 폴백(parity)
- `baton db status|reindex`
- 단위/통합/안전 테스트(인덱스 로직 fake로 결정적, 드라이버 가드)

### Out of Scope

- SQLite를 source-of-truth로 전환, 전 도메인 영속화, 마이그레이션 프레임워크,
  원격 DB, 실시간 구독/watch, 멀티 프로세스 락, GUI

## Proposed Architecture

```text
openDatabase({ path })
  └─ try { const { DatabaseSync } = await import("node:sqlite"); return NodeSqliteClient }
     catch { return undefined }                       # 가용성 가드 → 폴백 신호

NodeSqliteClient implements DbClient
  execute(sql, params)  → db.prepare(sql).run(...params)   # 파라미터 바인딩
  query<T>(sql, params) → db.prepare(sql).all(...params) as T[]
  close()               → db.close()

RunIndex(dbClient)
  ensureSchema()  → execute(CREATE TABLE IF NOT EXISTS runs ...)
  upsert(run)     → INSERT ... ON CONFLICT(id) DO UPDATE      # 멱등
  list({status,limit}) → SELECT ... ORDER BY created_at DESC, id ASC [WHERE status] [LIMIT]
  reindex(cwd)    → listRuns(file-scan) → DELETE FROM runs → upsert 전부

RunStore.save(run)
  ├─ 기존: temp→rename run.json (권위, 원자적)
  └─ if (index) try { index.upsert(run) } catch { warn }     # best-effort

listRuns({ cwd, status, limit, index? })
  ├─ if (index 가용) return index.list(...)                  # 빠른 경로
  └─ else 파일 스캔(기존)                                     # 폴백, 동일 결과
```

핵심 불변식: **인덱스는 파생물.** 없거나 구식이어도 파일로 정확히 동작.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/db/NodeSqliteClient.ts`(신규) | node:sqlite 기반 DbClient |
| `packages/core/src/db/openDatabase.ts` | 동적 import 가용성 가드(실제/undefined) |
| `packages/core/src/db/ddl.ts` 또는 `runsIndex.ddl.ts` | runs 인덱스 테이블 DDL |
| `packages/core/src/runs/RunIndex.ts`(신규) | ensureSchema/upsert/list/reindex |
| `packages/core/src/runs/RunStore.ts` | optional index 주입 + best-effort upsert |
| `packages/core/src/runs/listRuns.ts` | optional index 우선 + 파일 폴백 |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/commands/db.ts`(신규) | status/reindex |
| `packages/cli/src/main.ts` | `db` 라우팅 |
| `.gitignore` | `.baton/baton.db` 제외 확인 |
| `README.md`/`docs` | DB 인덱스/db 명령/안전 문서화 |
| `packages/*/test/*` | client/index/store/listRuns/CLI/security 테스트 |

## Data Model Changes

```sql
CREATE TABLE IF NOT EXISTS runs (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL,
  dry_run      INTEGER NOT NULL,       -- 0/1
  workflow_id  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT,
  step_count   INTEGER NOT NULL,
  outcome      TEXT
);
```

run.json/스키마(Zod)는 불변. 인덱스 행은 `Run`에서 파생(매핑). DB 파일 `.baton/baton.db`.

## API / CLI Changes

```bash
baton db status      # 가용성/경로/인덱스 행 수
baton db reindex     # 파일 → runs 테이블 재구축
```

신규 core API: `NodeSqliteClient`, `openDatabase`(가드), `RunIndex`. `listRuns`/
`RunStore`는 optional `index`/`db` 인자 추가(미지정 시 기존 동작).

## Workflow Changes

실행/엔진 의미 불변. 변화는 (1) save 시 best-effort 인덱스 미러, (2) listRuns 인덱스
우선 폴백, (3) db 운영 명령. 사용자 관점 동작은 동일(빠른 조회만 추가).

## Error Handling

- node:sqlite 불가 → openDatabase undefined → 전부 파일 폴백(무중단).
- 인덱스 upsert 실패 → 경고, run 저장 정상.
- DB 손상/쿼리 실패 → 파일 폴백 + 경고, `db reindex` 안내.
- `db reindex` 불가(드라이버 없음) → 명확한 안내 + 비파괴 + 비정상 종료 코드.

## Security Considerations

- 모든 SQL은 **파라미터 바인딩**(`?`), 문자열 결합 금지(인젝션 차단).
- DB는 로컬 파일(`.baton/baton.db`)만. 외부/네트워크/토큰 미접근.
- `.gitignore`로 DB 파일 제외(git/journal 유입 방지).
- credential/세션 토큰 무접근, danger 무관.

## Test Plan

`test-plan.md` 참조. 요지: RunIndex 로직 in-memory fake로 결정적, NodeSqliteClient는
가용성 가드 테스트, listRuns 인덱스↔파일 parity, save best-effort 실패-안전, 폴백 회귀,
SQL 바인딩, .gitignore.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-D01 → task-D06 의존성 순서를 따른다.
- **파일이 source-of-truth** — SQLite는 파생 인덱스. 인덱스 없이도 모든 기능 동작.
- 드라이버 가용성 가드(node:sqlite 불가 시 폴백, 회귀 0). 인덱스 쓰기 best-effort.
- SQL 파라미터 바인딩 필수. 네이티브/런타임 의존성 추가 금지(node:sqlite는 내장).
- strict TS/ESM(.js). v0.1~v0.11 회귀 0.

## Non-Goals

- source-of-truth 전환, 전 도메인 영속화, 마이그레이션, 원격 DB, 실시간 구독, GUI.

## Review Checklist

- [ ] 파일 source-of-truth 유지, 인덱스 없이도/불가 환경에서도 회귀 0(폴백).
- [ ] NodeSqliteClient 파라미터 바인딩, openDatabase 가드(throw 없음).
- [ ] RunIndex upsert 멱등 / list 파일과 동일 의미 / reindex 재구축.
- [ ] save best-effort(인덱스 실패가 run 안 깸), listRuns parity.
- [ ] db status/reindex, .gitignore DB 제외. credential/토큰/danger/SQL결합 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.11 누적). 예:
  `git worktree add ../baton-sqlite-index-v0.12 -b baton/sqlite-index-v0.12 origin/main`
- 분기 직후 확인: `packages/cli/test/e2e.test.ts`(v0.11),
  `packages/core/src/db/{DbClient,ddl,openDatabase}.ts`, `packages/core/src/runs/
  listRuns.ts`, 그리고 `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(161)보다 줄면 base를 의심하라.

### Goal

`node:sqlite`(Node 내장; env는 Node 24)를 v0.1의 `DbClient` 인터페이스 뒤에 연결해 run
메타데이터를 쿼리 가능한 **인덱스**로 만든다. **파일(run.json)은 source-of-truth로
유지**하고 SQLite는 파생 인덱스. 드라이버 가용성 가드로 구버전 Node에서도 폴백(회귀 0),
`RunStore.save`는 best-effort upsert, `listRuns`는 인덱스 우선 + 파일 폴백(동일 결과).
`baton db status|reindex`. **무위험 추가**가 핵심이다.

성공 기준은 "SQLite 연결"뿐 아니라 **파일 source-of-truth 보존 + 가드된 폴백(회귀 0) +
인덱스↔파일 parity + 파라미터 바인딩**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/sqlite-index-v0.12/design.md`
3. `.baton/runs/sqlite-index-v0.12/tasks.json`
4. `.baton/runs/sqlite-index-v0.12/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.11 코드(`DbClient`/`ddl`/`openDatabase` skeleton, `RunStore.save`,
   `listRuns` 파일 스캔)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/db/NodeSqliteClient.ts`
- `packages/core/src/runs/RunIndex.ts`
- `packages/cli/src/commands/db.ts`
- `packages/core/test/{nodeSqliteClient,runIndex}.test.ts`,
  `packages/core/test/listRuns.index.test.ts`(또는 기존에 추가)

### Files to Modify

- `packages/core/src/db/openDatabase.ts` — 동적 import 가용성 가드(실제/undefined)
- `packages/core/src/db/ddl.ts`(또는 신규) — runs 인덱스 테이블 DDL
- `packages/core/src/runs/RunStore.ts` — optional index 주입 + best-effort upsert
- `packages/core/src/runs/listRuns.ts` — optional index 우선 + 파일 폴백(동일 결과)
- `packages/core/src/index.ts` — export
- `packages/cli/src/main.ts` — `db` 라우팅 + help
- `.gitignore` — `.baton/baton.db` 제외(없으면 추가)
- `README.md`/`docs` — DB 인덱스/db 명령/안전
- `packages/cli/test/cli.test.ts` — db status/reindex 테스트

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- run.json을 SQLite로 대체 금지(파일 source-of-truth 유지).
- 네이티브 SQLite 드라이버(better-sqlite3 등) 추가 금지(node:sqlite 내장만).
- 런타임 의존성 추가 금지. SQL 문자열 결합 금지(파라미터 바인딩).

### Step-by-Step Implementation Plan

1. `.baton/runs/sqlite-index-v0.12/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `NodeSqliteClient`(node:sqlite, 파라미터 바인딩) + `openDatabase` 동적 import 가드
   (불가 시 undefined, throw 없음) + 가드 테스트. (task-D01)
3. `runs` 인덱스 DDL + `RunIndex`(ensureSchema/upsert 멱등/list 파일과 동일 의미/
   reindex(listRuns 파일 스캔으로 재구축)) + in-memory fake DbClient 결정적 테스트. (task-D02)
4. `RunStore.save`에 optional index best-effort upsert(try/catch, run 저장 불변) +
   테스트. (task-D03)
5. `listRuns`에 optional index 우선 + 파일 폴백, **인덱스↔파일 parity** 테스트. (task-D04)
6. `baton db status|reindex` + main 라우팅 + 테스트(불가 시 안내). (task-D05)
7. `.gitignore`(.baton/baton.db), README/docs, 보안 회귀(토큰/danger/SQL결합 0), 전체
   게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-D06)

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

`.baton/runs/sqlite-index-v0.12/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: openDatabase 가드(AC-02), RunIndex 멱등/parity(AC-05/06/10), save best-effort
실패-안전(AC-09), 폴백 회귀 0(AC-11), 파라미터 바인딩(AC-01/15), .gitignore DB(AC-14).

### Constraints

- strict TS, ESM(.js), 런타임 의존성 zod/yaml만(node:sqlite는 내장).
- 파일 source-of-truth 유지, SQLite는 파생 인덱스. 인덱스 없이도/불가 환경에서도 동작.
- 드라이버 가용성 가드(폴백, 회귀 0), best-effort upsert. SQL 파라미터 바인딩.
- DB 파일 `.baton/baton.db`, `.gitignore` 제외. credential/세션 토큰 무접근.
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
- source-of-truth 전환, 마이그레이션, 멀티 프로세스 락 등 남은 항목

## Notes for Reviewer
- 파일 source-of-truth 보존, 가드된 폴백(회귀 0), 인덱스↔파일 parity, save best-effort,
  파라미터 바인딩, .gitignore DB를 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
