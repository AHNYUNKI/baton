# Acceptance Criteria

v0.13 read API / watch 경계가 완료되려면 아래가 모두 충족되어야 한다.

## JSON envelope (contract)

- [ ] AC-01 read `--json` 출력이 봉투 `{ schemaVersion: 1, kind: string, data: ... }`를
  사용한다. `readApi.schema.ts`(Zod)로 봉투/이벤트가 검증·문서화된다.
- [ ] AC-02 `run list --json` → kind `run-list`, data = run 요약 배열(+ skipped 정보).
- [ ] AC-03 `run show --json` / `run status --json` → kind `run-detail`, data = run
  상태 + 아티팩트 파일 목록.
- [ ] AC-04 `baton state --json` → kind `state`, data = { total, byStatus, recent: [...] }.
- [ ] AC-05 모든 `--json` 출력은 단일 JSON(파싱 가능)이며 결정적(주입 clock/정렬).

## state command

- [ ] AC-06 `baton state`(텍스트)가 총계·상태별 카운트·최근 run을 사람용으로 출력한다.

## watch (NDJSON, bounded)

- [ ] AC-07 `detectRunChanges(prev, curr)`(순수)가 created/removed/status-changed/
  updated 이벤트를 정확히 산출한다(결정적).
- [ ] AC-08 `baton watch --once`가 현재 스냅샷을 NDJSON(한 줄당 1 이벤트)으로 1회
  emit하고 종료한다(결정적, 테스트 가능).
- [ ] AC-09 `baton watch [--interval <s>]`(연속)은 interval 기반 polling으로 diff
  이벤트를 NDJSON 스트림하며, SIGINT/SIGTERM로 클린 종료한다. tight(무가드) 루프가
  아니다(반드시 interval 대기).
- [ ] AC-10 watch/이벤트가 NDJSON 규약(개행 종료 1줄 JSON)을 따른다.

## Read-only & source

- [ ] AC-11 list/show/status/state/watch는 읽기 전용(쓰기/삭제 호출 없음)이며 스냅샷은
  `listRuns`(v0.12 인덱스/파일 폴백)·`RunStore.load`·`summarizeRuns`를 재사용한다.
- [ ] AC-12 인덱스 없음/비가용에서도 read API/watch가 파일 폴백으로 동작한다(회귀 없음).

## Docs

- [ ] AC-13 `docs/INTEGRATION.md`가 봉투·명령별 data 형태·watch 이벤트 타입·schemaVersion
  정책을 GUI 통합 관점에서 기술하고, README가 링크한다.

## Safety & Compat

- [ ] AC-14 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`, HTTP/네트워크
  서버가 없다(보안 회귀 테스트).
- [ ] AC-15 봉투 표준화로 갱신되는 기존 테스트(예: v0.6 run list --json)는 의도적으로
  갱신되고, 그 외 v0.1~v0.12 동작은 회귀가 없다.
- [ ] AC-16 `pnpm typecheck && pnpm test && pnpm build` 통과, `node packages/cli/dist/
  main.js run --help` 스모크 정상.
