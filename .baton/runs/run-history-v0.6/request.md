# Request

## Run

- runId: `run-history-v0.6`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `obsidian-journal-v0.5` (PR #5, merged → main `5fe9923`)

## User Request

사용자는 **터미널에서 Baton run 이력을 빠르게 조회**하고 싶다. Obsidian 자동
기록(v0.5)이 기록 레이어를 제공했다면, v0.6은 CLI에서 "무엇을 작업했는지"를
즉시 훑어보는 조회 레이어를 추가한다. run 목록/상세를 상태·날짜로 필터·요약한다.

## Scope (v0.6)

- run 스캔/로딩 로직을 core로 승격(현재 `cli/journal.ts`에 있음) → 재사용
- `listRuns({cwd, status?, limit?})`(core): `.baton/runs/*/run.json` 스캔, Zod 검증,
  손상/비-run 디렉터리는 건너뜀, createdAt 내림차순 정렬
- `summarizeRuns(runs)`(core): 상태별 카운트/총계
- CLI `baton run list [--status <s>] [--limit <n>] [--json]` — 표 출력
- CLI `baton run show <runId>` — 상세(요청, step 표+타이밍/reason, 승인, worktree/
  cleaned, 아티팩트 파일 목록)
- `journal.ts`를 core `listRuns`로 리팩터(중복 제거, 회귀 없음)
- 단위/통합 테스트

## Out of Scope

- SQLite 영속화(별도 후속), 실시간 watch, 커서 페이지네이션, 다중 프로젝트 조회,
  run 삭제/편집

## Constraints

- 읽기 전용 조회(상태 변경 없음). 손상 run.json은 조용히 건너뛰되 개수 보고 가능.
- 결정적 정렬(createdAt 내림차순, 동률 시 runId). `--json`은 안정적 스키마.
- 기존 안전(credential/세션 토큰 무접근, danger 금지) 유지.
- 런타임 의존성 추가 없음(zod/yaml). 과도한 추상화 금지.
- base = `origin/main`(최신, v0.1~v0.5 포함)에서 분기.
