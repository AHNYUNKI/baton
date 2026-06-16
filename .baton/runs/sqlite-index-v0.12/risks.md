# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | node:sqlite 실험적/버전 차이로 import 실패 | Med | Med | 동적 import + try/catch 가용성 가드. 불가 시 openDatabase가 undefined 반환 → 파일 스캔 폴백. 코어 로직은 DbClient 뒤라 무관. |
| R2 | 인덱스-파일 불일치(구식/누락) | Med | Med | 파일 source-of-truth. listRuns는 항상 파일 폴백 가능. `db reindex`로 재구축. 인덱스를 권위로 삼지 않음. |
| R3 | best-effort upsert 누락으로 인덱스 불완전 | Med | Low | save의 인덱스 쓰기는 try/catch(실패가 run 저장을 깨지 않음, 경고). listRuns 인덱스 결과가 파일과 다르면 reindex 안내. 정합성은 reindex로 회복. |
| R4 | listRuns 폴백/인덱스 결과 불일치(정렬/필터) | Med | High | 인덱스 쿼리가 파일 스캔과 **동일 의미**(createdAt desc, runId asc, status, limit, skipped). 파일↔인덱스 parity 테스트로 고정. |
| R5 | 테스트가 Node 버전(node:sqlite)에 의존 | Med | Med | 코어 인덱스 로직은 in-memory fake DbClient로 결정적 테스트. 실제 NodeSqliteClient는 가용성 가드(`it.skipIf`)로 테스트(없으면 skip). CI 무관하게 green. |
| R6 | DB 파일 손상/락 | Low | Med | 손상 시 인덱스 쿼리 실패 → 파일 폴백 + 경고. `db reindex`로 재생성. DB는 `.baton/baton.db`(로컬). |
| R7 | 동시성(멀티 프로세스 쓰기) | Low | Med | 단일 사용자 가정. best-effort + 파일 권위로 손실 위험 낮춤. 멀티 프로세스 락은 후속 TODO. |
| R8 | SQL 인젝션(파라미터 미바인딩) | Low | High | 모든 쿼리 파라미터 바인딩(`?` placeholder), 문자열 결합 금지. 테스트로 단언. |
| R9 | DB 파일이 git/journal에 유입 | Low | Low | `.baton/baton.db`는 `.gitignore`(`.baton/runs/` 외)로 제외 확인. 저널 export 대상 아님. |
| R10 | 스키마 진화(향후 컬럼 추가) 시 깨짐 | Low | Low | v0.12는 runs 인덱스만. CREATE TABLE IF NOT EXISTS + reindex로 재생성. 마이그레이션은 후속. |
| R11 | credential/세션 토큰/danger 회귀 | Low | High | DB 코드는 로컬 파일 SQL만. 외부/토큰 미접근. 보안 회귀 테스트. |
