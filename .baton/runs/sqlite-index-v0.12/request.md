# Request

## Run

- runId: `sqlite-index-v0.12`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `e2e-docs-v0.11` (PR #11, merged → main `c685607`)

## User Request

SQLite 영속화를 도입한다. v0.1부터 둔 `DbClient` 인터페이스 + DDL skeleton에 실제
드라이버를 연결해, run 메타데이터를 **쿼리 가능한 인덱스**로 만든다. 이는 향후 GUI가
바인딩할 안정적 데이터 백엔드의 첫 디딤돌이다.

## Scope (v0.12)

- `node:sqlite`(Node 내장, ≥22.5; 현재 env Node 24) 기반 `DbClient` 실제 구현 +
  **가용성 가드**(불가 시 파일 스캔으로 폴백, 무중단)
- `runs` 인덱스 테이블 + `RunIndex`(upsert/list/reindex)
- `RunStore.save`가 인덱스에 **best-effort upsert**(인덱스 실패가 run을 깨지 않음)
- `listRuns`가 인덱스 우선 + 파일 스캔 폴백(동일 결과 보장)
- `baton db status|reindex` 명령(가용성/인덱스 수, 파일로부터 재구축)
- 단위/통합 테스트(인덱스 로직은 in-memory fake로 결정적, 실제 드라이버는 가드)

## Out of Scope

- SQLite를 source-of-truth로 전환(파일 유지), 전 도메인(projects/workflows 등) 영속화,
  마이그레이션 프레임워크, 원격 DB, 실시간 구독/watch, GUI

## Constraints

- **파일이 source-of-truth**: run.json + 아티팩트는 권위. SQLite는 파생 인덱스.
  인덱스 부재/구식이어도 파일 스캔으로 항상 동작.
- 드라이버 가용성 가드: `node:sqlite` 불가 환경(구버전 Node)에서 **기존 동작 회귀 0**.
- 인덱스 쓰기는 best-effort(실패가 run/저장을 깨지 않음).
- credential/세션 토큰 무접근, danger 무관. 런타임 의존성 추가 없음(네이티브 금지).
- base = `origin/main`(v0.1~v0.11). DB 파일은 `.baton/` 하위.
