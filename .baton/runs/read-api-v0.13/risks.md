# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 봉투 표준화가 기존 `run list --json` 소비자 깨뜨림 | Med | Low | 외부 소비자 없음(프리 릴리스). 지금 계약 기준선 확정이 최선. v0.6 테스트 의도적 갱신, schemaVersion 1 문서화. |
| R2 | watch 연속 루프 비결정/테스트 곤란 | Med | Med | 순수 `detectRunChanges(prev,curr)` 단위 테스트. `watch --once`(1회 스냅샷)로 결정적 경로. 연속 모드는 얇은 래퍼(interval bounded, SIGINT 종료). |
| R3 | watch 자원 누수(무한 루프/핸들) | Low | Med | interval 기반 polling, --once로 즉시 종료. SIGINT/SIGTERM 클린 종료. 무한 가드 없는 tight loop 금지(반드시 interval sleep). |
| R4 | 이벤트 의미 모호(created/updated/status-changed/removed) | Med | Med | 명확 정의: created=신규 id, removed=사라진 id, status-changed=status 변경, updated=updatedAt 변경(상태 동일). 각 케이스 테스트. |
| R5 | 스냅샷 폴백(인덱스/파일) 회귀 | Low | Med | listRuns(v0.12 인덱스/파일 폴백) 재사용 — 신규 스캔 로직 없음. 동일 결과. parity 유지. |
| R6 | schemaVersion 정책 부재로 향후 진화 곤란 | Low | Med | 봉투에 schemaVersion 고정(1) + 문서에 "additive 우선, 호환 깨짐 시 version 증가" 정책. |
| R7 | read 명령이 실수로 상태 변경 | Low | High | list/show/status/state/watch는 순수 읽기(쓰기/삭제 호출 없음). 단언. |
| R8 | NDJSON 형식 깨짐(개행/부분 출력) | Low | Med | 이벤트마다 1줄 JSON(개행 종료). 부분 쓰기 방지. 파싱 테스트. |
| R9 | watch가 실제 외부/네트워크 의존 | Low | Med | watch는 로컬 파일/인덱스 polling만. HTTP/네트워크 없음. hermetic 테스트. |
| R10 | credential/세션 토큰/danger 회귀 | Low | High | read API/watch는 로컬 읽기만. 외부/토큰 미접근. 보안 회귀 테스트. |
