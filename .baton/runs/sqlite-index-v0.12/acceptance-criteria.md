# Acceptance Criteria

v0.12 SQLite 인덱스가 완료되려면 아래가 모두 충족되어야 한다.

## Driver (node:sqlite, guarded)

- [ ] AC-01 `NodeSqliteClient`가 `DbClient`(execute/query/close)를 `node:sqlite`로
  구현하며, 모든 쿼리는 파라미터 바인딩(`?`)을 사용한다(문자열 결합 금지).
- [ ] AC-02 `openDatabase({path})`가 node:sqlite 가용 시 실제 클라이언트를, 불가
  (import 실패/구버전 Node) 시 사용 불가 신호(undefined 등)를 반환한다 — throw로 앱을
  깨지 않는다.
- [ ] AC-03 node:sqlite 가용 환경에서 NodeSqliteClient가 임시/메모리 DB에 대해
  execute/query 라운드트립을 만족한다(가용성 가드 테스트, 불가 시 skip).

## RunIndex

- [ ] AC-04 `runs` 인덱스 테이블 DDL(id PK, status, dry_run, workflow_id, created_at,
  updated_at, step_count, outcome) + `CREATE TABLE IF NOT EXISTS`.
- [ ] AC-05 `RunIndex.upsert(run)`가 run 메타를 삽입/갱신(멱등)한다.
- [ ] AC-06 `RunIndex.list({status?, limit?})`가 createdAt 내림차순 + runId 오름차순
  정렬과 status/limit를 **파일 스캔과 동일 의미**로 반환한다.
- [ ] AC-07 `RunIndex.reindex(cwd)`가 `.baton/runs/*/run.json`(listRuns 파일 스캔)으로
  runs 테이블을 재구축한다(기존 행 정리 후 채움).
- [ ] AC-08 RunIndex 로직이 in-memory fake DbClient로 결정적으로 테스트된다.

## Integration — file source of truth preserved

- [ ] AC-09 `RunStore.save`가 인덱스가 주입된 경우 best-effort upsert 한다. 인덱스
  쓰기 실패가 run.json 저장/반환을 깨지 않는다(경고만).
- [ ] AC-10 `listRuns({cwd})`가 인덱스 가용 시 인덱스를, 아니면 파일 스캔을 사용하며
  **두 경로 결과가 동일**하다(parity 테스트). run.json은 권위로 유지된다.
- [ ] AC-11 인덱스가 없거나 비어도(또는 node:sqlite 불가) 기존 동작(파일 스캔)으로
  회귀 없이 작동한다.

## CLI

- [ ] AC-12 `baton db status`가 DB 가용성/경로/인덱스 행 수를 출력한다(불가 시 명확히).
- [ ] AC-13 `baton db reindex`가 파일로부터 인덱스를 재구축하고 결과(행 수)를 보고한다.
  node:sqlite 불가 시 명확한 안내 + 비파괴.

## Safety & Compat

- [ ] AC-14 DB 파일은 `.baton/` 하위(`.gitignore`로 제외). 저널/git에 유입되지 않는다.
- [ ] AC-15 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`, SQL 문자열
  결합이 없다(보안 회귀 테스트).
- [ ] AC-16 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.11 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
