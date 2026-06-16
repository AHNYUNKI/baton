# Analysis

## User Request

`DbClient` skeleton에 실제 `node:sqlite` 드라이버를 연결해 run 메타데이터를 쿼리 가능한
**인덱스**로 만든다. 파일을 source-of-truth로 유지하면서 SQLite를 추가 인덱스로 두어,
빠른 조회와 향후 GUI가 바인딩할 안정적 데이터 계약을 확보한다.

## Intent

GUI의 첫 디딤돌은 "쿼리 가능한 백엔드 + 안정적 read API"다(직전 순서 논의 결론).
가치의 핵심은 SQLite로 *교체*가 아니라 **무위험 추가**다: 파일은 그대로 권위,
SQLite는 파생 인덱스, 드라이버 불가 시 폴백. 이렇게 하면 데이터 손실/회귀 위험 없이
인덱스 쿼리와 DbClient 계약을 얻는다.

## Current Repository Understanding (v0.11 / main c685607 기준)

- `packages/core/src/db/DbClient.ts` — `{ execute(sql,params), query<T>(sql,params),
  close() }` async 인터페이스(이미 적절).
- `packages/core/src/db/ddl.ts` — `TABLE_NAMES`(projects, agent_profiles, workflows,
  runs, run_steps, artifacts, events, approvals) + `DDL_STATEMENTS` 맵. v0.1 skeleton.
- `packages/core/src/db/openDatabase.ts` — no-op skeleton(빈 결과 반환). 실제 드라이버
  연결 지점.
- `packages/core/src/runs/RunStore.ts` — `save(run)`는 **이미 원자적**(temp→rename),
  `updatedAt` 갱신 후 반환. load/markCleaned.
- `packages/core/src/runs/listRuns.ts`(v0.6) — `.baton/runs/*/run.json` 스캔, Zod 검증,
  createdAt desc + runId asc 정렬, status/limit, skipped 집계. **인덱스의 폴백·재구축
  소스**.
- 환경: **Node v24**(node:sqlite 사용 가능). RunStore.save 원자성은 이미 확보.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/db/NodeSqliteClient.ts`(신규) | node:sqlite 기반 DbClient |
| `packages/core/src/db/openDatabase.ts` | 가용성 가드 + 실제/폴백 반환 |
| `packages/core/src/db/runsIndex.ddl.ts` 또는 ddl.ts | runs 인덱스 테이블 DDL |
| `packages/core/src/runs/RunIndex.ts`(신규) | upsert/list/reindex(DbClient 사용) |
| `packages/core/src/runs/RunStore.ts` | save 시 best-effort 인덱스 upsert |
| `packages/core/src/runs/listRuns.ts` | 인덱스 우선 + 파일 폴백 |
| `packages/cli/src/commands/db.ts`(신규) | status/reindex |

## Existing Behavior

DB는 skeleton(no-op). 조회는 listRuns 파일 스캔. RunStore는 run.json만 기록(원자적).

## Target Behavior

- `openDatabase({path})`가 `node:sqlite` 가용 시 실제 `DbClient`(NodeSqliteClient)를,
  불가 시 `undefined`(또는 사용 불가 신호)를 반환 → 호출부는 폴백.
- `RunStore.save`가 인덱스가 있으면 `runs` 행을 best-effort upsert(실패 무시·경고).
- `listRuns({cwd})`가 인덱스 가용 시 SQL 쿼리, 아니면 파일 스캔. **결과 동일**(동일 정렬/
  필터/스킵 의미).
- `baton db status` → 가용성/인덱스 행 수/DB 경로. `baton db reindex` → 파일로부터 runs
  테이블 재구축(복구/최초 1회).

## Constraints

- 파일 source-of-truth. SQLite는 파생 인덱스(없거나 구식이어도 폴백으로 정상).
- node:sqlite 가용성 가드 → 구버전 Node 회귀 0. 인덱스 쓰기 best-effort.
- DB 파일은 `.baton/baton.db`(또는 유사). credential/세션 토큰 무접근.
- 모든 I/O 포트/임시 디렉터리 테스트. 네이티브/런타임 의존성 추가 금지.

## Assumptions

### Safe

- DbClient 인터페이스(execute/query/close)는 그대로. NodeSqliteClient는 node:sqlite
  `DatabaseSync`를 async 래핑.
- `runs` 인덱스 테이블은 run.json 메타 부분집합(id PK, status, dry_run, workflow_id,
  created_at, updated_at, step_count, outcome).
- RunIndex 로직은 in-memory fake DbClient로 결정적 테스트, 실제 드라이버는 가드 테스트.

### Risky

- **node:sqlite 실험적 API**: import 경고/버전 차이. → 동적 import + try/catch 가드로
  가용성 판정, 불가 시 폴백. 코어 로직은 DbClient 뒤라 드라이버 무관하게 테스트 가능.
- **인덱스-파일 정합성**: 인덱스가 구식/누락될 수 있음 → listRuns는 항상 파일 폴백
  가능해야 하고, `reindex`로 재구축. (인덱스를 신뢰의 단일 출처로 삼지 않음.)
- **동시성**: 단일 사용자 가정. node:sqlite 단일 연결 + best-effort 쓰기. 멀티 프로세스
  락은 후속.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. SQLite를 source-of-truth로 안 하고 **인덱스**로 둘지(기본 그렇게 — 무위험).
2. listRuns 기본 경로를 인덱스 우선(폴백 파일)로 할지(기본 그렇게).

## Risks

`risks.md` 참조. 핵심: 드라이버 가용성/실험적 API, 인덱스-파일 불일치, best-effort
쓰기 누락, listRuns 폴백 회귀, 테스트의 Node 버전 의존, 보안.

## Recommendation

파일을 source-of-truth로 유지하고, `node:sqlite`를 가용성 가드 뒤에서 `DbClient`로
연결해 `runs` 인덱스를 만든다. `RunStore.save`가 best-effort upsert, `listRuns`가
인덱스 우선 + 파일 폴백(동일 결과)으로 동작한다. 인덱스 로직은 in-memory fake로
결정적으로 테스트하고, 실제 드라이버는 가드 테스트한다. `baton db status|reindex`로
운영성을 더한다. 구버전 Node에서도 폴백으로 회귀 0. 상세는 `design.md`.
