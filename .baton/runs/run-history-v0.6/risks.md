# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | core 승격 리팩터가 journal(v0.5) 동작/테스트 회귀 | Med | Med | `loadRuns`/`loadRunsWithDirectories`를 core `listRuns`로 옮기고 journal.ts가 이를 import. 정렬·필터 의미 동일 유지. 기존 journal 테스트 회귀 없음 확인. |
| R2 | 손상/구버전 run.json이 조용히 누락 | Med | Med | Zod 실패 run은 목록 제외하되 skip 개수를 집계해 `list`에 "N skipped" 표기(no silent cap). 손상 run skip 테스트. |
| R3 | 비결정적 정렬(createdAt 동률) | Low | Low | createdAt 내림차순 + runId 오름차순 2차 키. fixed 데이터 정렬 테스트. |
| R4 | `--json` 스키마 불안정으로 스크립트 깨짐 | Low | Med | JSON 출력 형태를 명시(필드 고정), 사람용 표와 분리. 스냅샷/필드 단언 테스트. |
| R5 | 대량 run 디렉터리에서 성능 | Low | Low | v0.6 규모 무시. `--limit`로 출력 제한, 스캔은 단순 readdir. 후속에 인덱스/SQLite. |
| R6 | `run show`가 존재하지 않는 runId에 불명확 에러 | Low | Low | RunStore.load 미존재 → 명확한 에러 + 비정상 종료. 테스트. |
| R7 | journal 노트/worktrees 디렉터리를 run으로 오인 | Low | Med | run 판정은 `<id>/run.json` 존재로 한정. .md/worktrees 제외. 테스트. |
| R8 | status 확장 vs show 중복 | Low | Low | show 신규, status는 하위호환(또는 show로 위임). printRun/printSteps 재사용. |
| R9 | 읽기 명령이 실수로 상태 변경 | Low | High | list/show는 순수 읽기(쓰기/삭제 호출 없음). 코드/테스트 단언. |
| R10 | credential/세션 토큰/danger 회귀 | Low | High | 보안 회귀 테스트 유지. 신규 코드는 FS 읽기만. |
