# Test Plan

러너: Vitest. 모든 FS는 임시 `.baton` 디렉터리로 격리. 결정적(고정 데이터/정렬).
**네트워크/실제 워커 불필요.**

## Unit Tests

### core listRuns / summarizeRuns
- 여러 run.json 생성 → createdAt 내림차순 + runId 2차 키 정렬 단언.
- `status` 필터, `limit`(정렬·필터 후 상위 N) 적용.
- 손상 run.json(잘못된 JSON/Zod 실패) + run.json 없는 디렉터리 → skip, skipped 개수
  반환(조용한 누락 없음).
- journal 노트(.md)/worktrees 디렉터리는 run으로 집계 안 됨.
- 빈 상태 → 빈 배열 + skipped 0.
- summarizeRuns → 총계/상태별 카운트 정확.

### journal refactor 회귀
- journal sync/auto-export가 core listRuns 사용으로 동일 결과(기존 v0.5 테스트 통과).

## CLI Tests

### run list
- 표 출력: 모든 run, createdAt 내림차순, 컬럼(runId/status/workflow/생성일/step수/outcome).
- `--status completed` → 해당 상태만.
- `--limit 2` → 상위 2개.
- `--json` → 안정적 필드 JSON 배열(필드 단언/파싱).
- 손상 run 존재 → "N skipped" 표기.
- run 없음 → 빈 상태 안내 + exit 0.

### run show
- 상세: 요청/step 표(타이밍·reason)/승인/worktreePath·cleanedAt/아티팩트 목록.
- 없는 runId → 에러 + 비정상 종료.
- 기존 `run status <runId>` 회귀 없음.

## Safety Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- list/show 경로에 쓰기/삭제 호출 없음(읽기 전용) 단언.

## Out of Scope (테스트 비대상)

- SQLite, 실시간 watch, 다중 프로젝트, 네트워크, 실제 워커 실행.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.5 + v0.6, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
