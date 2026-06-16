# Acceptance Criteria

v0.6 Run 이력 조회 CLI가 완료되려면 아래가 모두 충족되어야 한다.

## Core — listRuns / summarizeRuns

- [ ] AC-01 `listRuns({cwd, status?, limit?})`가 `.baton/runs/*/run.json`을 스캔해
  Zod 검증된 `LoadedRun[]`(run + directory)를 반환한다.
- [ ] AC-02 결과는 createdAt 내림차순, 동률 시 runId 오름차순으로 결정적 정렬된다.
- [ ] AC-03 손상/비-run 디렉터리(run.json 없음/Zod 실패)는 건너뛰고, 건너뛴 개수를
  반환값에 포함한다(조용한 누락 금지).
- [ ] AC-04 `status` 필터와 `limit`이 적용된다(limit은 정렬·필터 후 상위 N).
- [ ] AC-05 `summarizeRuns(runs)`가 총계와 상태별 카운트를 반환한다.
- [ ] AC-06 core API(`listRuns`/`summarizeRuns`/`LoadedRun`)가 export 된다.

## Refactor — journal reuse

- [ ] AC-07 `cli/journal.ts`가 자체 run 스캔 로직 대신 core `listRuns`를 사용하며,
  기존 journal(v0.5) 테스트가 회귀 없이 통과한다.

## CLI — run list

- [ ] AC-08 `baton run list`가 모든 run을 표(runId, status, workflow, 생성일,
  step 수, outcome)로 createdAt 내림차순 출력한다.
- [ ] AC-09 `--status <s>` / `--limit <n>` / `--json`을 지원하며, `--json`은 안정적
  필드 스키마의 JSON 배열을 출력한다.
- [ ] AC-10 건너뛴 손상 run이 있으면 "N skipped" 류로 표기한다.
- [ ] AC-11 run이 없으면 빈 상태를 명확히 안내하고 종료 코드 0.

## CLI — run show

- [ ] AC-12 `baton run show <runId>`가 요청, step 표(타이밍/reason), 승인,
  worktreePath/cleanedAt, run 디렉터리 아티팩트 파일 목록을 출력한다.
- [ ] AC-13 존재하지 않는 runId는 명확한 에러 + 비정상 종료.
- [ ] AC-14 기존 `baton run status <runId>`는 하위호환으로 동작한다(회귀 없음).

## Safety & Compat

- [ ] AC-15 list/show/listRuns는 읽기 전용이다(상태 변경/쓰기/삭제 호출 없음, 단언).
- [ ] AC-16 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`가 없다.
- [ ] AC-17 모든 FS 테스트는 임시 `.baton` 디렉터리를 사용한다.
- [ ] AC-18 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.5 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
