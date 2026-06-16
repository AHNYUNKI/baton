# Test Plan

러너: Vitest. 인덱스 로직은 **in-memory fake DbClient**로 결정적 테스트(드라이버/Node
버전 무관). 실제 `node:sqlite`는 가용성 가드로 테스트(없으면 skip). 모든 FS는 임시
디렉터리. **네트워크/실제 외부 CLI 금지.**

## Unit Tests

### NodeSqliteClient (guarded)
- node:sqlite 가용 시(`it.skipIf(!available)`): 임시/`:memory:` DB에 CREATE/INSERT/
  SELECT 라운드트립, 파라미터 바인딩.
- 파라미터가 `?` 바인딩으로 전달(문자열 결합 없음) 단언.

### openDatabase
- 가용 시 실제 클라이언트 반환.
- 가용성 가드 모의(import 실패) → undefined/사용 불가 신호, throw 없음.

### RunIndex (in-memory fake DbClient)
- upsert: 신규 삽입, 동일 id 재upsert → 갱신(멱등, 행 1개).
- list: createdAt desc + runId asc, status 필터, limit. 파일 스캔과 동일 의미.
- reindex: run.json 파일 다수 → 테이블 재구축(기존 정리 후 채움), 손상 run skip.

### RunStore best-effort
- 인덱스 주입 + save → upsert 호출됨, run.json 저장 정상.
- 인덱스 upsert가 throw해도 save는 성공(경고만) 단언.
- 인덱스 미주입 → 기존 동작(파일만).

### listRuns parity
- 동일 run 집합에 대해 인덱스 경로 결과 == 파일 스캔 경로 결과(정렬/필터/skipped).
- 인덱스 없음/비가용 → 파일 스캔 폴백(기존 동작).

## CLI Tests

- `db status`: 가용 시 경로/행 수, 불가 시 명확한 안내.
- `db reindex`: 파일로부터 재구축 + 행 수 보고. 불가 시 안내+비파괴.
- 알 수 없는 서브커맨드/인자 → 사용법 + 비정상 종료.

## Security / Path Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0. SQL 문자열 결합 없음(파라미터
  바인딩).
- `.gitignore`가 `.baton/baton.db`(DB)를 제외하는지 확인.

## Out of Scope (테스트 비대상)

- source-of-truth 전환, 전 도메인 영속화, 마이그레이션, 원격 DB, 실시간 구독, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.11 + v0.12, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
