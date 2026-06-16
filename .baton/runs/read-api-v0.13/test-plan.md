# Test Plan

러너: Vitest. 모든 FS/clock 주입·임시 디렉터리. watch는 순수 diff + `--once`로 결정적.
**HTTP/네트워크/실제 외부 CLI 금지.**

## Unit Tests

### readApi.schema (envelope/events)
- 봉투 `{schemaVersion:1, kind, data}` 유효/무효 parse.
- watch 이벤트(run.created/updated/status-changed/removed) 형태 검증.

### detectRunChanges (순수)
- prev=[] , curr=[A] → created A.
- prev=[A(running)], curr=[A(completed)] → status-changed A.
- prev=[A(updatedAt t1)], curr=[A(updatedAt t2, 같은 status)] → updated A.
- prev=[A], curr=[] → removed A.
- 변화 없음 → 빈 이벤트.
- 다건 혼합 + 결정적 순서(runId).

## CLI Tests

### JSON envelope
- `run list --json` → `{schemaVersion:1, kind:"run-list", data:[...]}` 파싱·필드.
- `run show --json`/`run status --json` → kind `run-detail`, run + 아티팩트 목록.
- `baton state --json` → kind `state`, { total, byStatus, recent }.
- 모든 --json이 단일 JSON으로 파싱됨.

### state (텍스트)
- 총계/상태별/최근 run 출력.

### watch
- `watch --once` → 현재 run들에 대한 NDJSON 스냅샷(한 줄당 1 이벤트) 후 종료(exit 0).
- 각 줄이 JSON.parse 가능, schemaVersion 포함.
- (연속 모드는 단위 테스트 대상 아님 — 순수 diff + --once로 커버. 필요한 경우 1-tick
  주입으로 가볍게.)

### read-only / fallback
- list/show/status/state/watch가 쓰기/삭제 호출 없음(단언).
- 인덱스 비가용 → 파일 폴백으로 동일 동작.

## Docs Test (선택)

- docs/INTEGRATION.md 존재 + README 링크. 핵심 kind/이벤트 명이 문서·코드 일치.

## Security Regression

- grep: credential/세션 토큰/`danger-full-access`/HTTP 서버(createServer/listen) 매치 0.

## Out of Scope (테스트 비대상)

- HTTP/소켓 서버, 데몬, 인증, 웹소켓, 실제 GUI, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.12 + v0.13, 회귀 없음(봉투 갱신 제외)
corepack pnpm build
node packages/cli/dist/main.js run --help
```
