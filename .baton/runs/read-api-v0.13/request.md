# Request

## Run

- runId: `read-api-v0.13`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `sqlite-index-v0.12` (PR #12, merged → main `05708ab`)

## User Request

GUI(향후 Swift macOS 앱)가 붙을 **통합 계약**을 확정한다. 직전 순서 논의 결론대로,
GUI의 마지막 전제조건은 "안정적·기계가독 read API + 라이브 갱신 경계"다. HTTP 데몬
없이(로컬 우선, AGENTS.md의 'Local API server' 비목표 존중) **버전드 JSON 스냅샷 +
NDJSON watch 스트림**으로 계약을 제공한다.

## Scope (v0.13)

- 버전드 JSON **봉투**(`{ schemaVersion, kind, data }`)를 read 명령의 `--json`에 표준화
- `run list --json`(봉투화), `run show --json`, `run status --json`(현재 텍스트 전용)
- `baton state [--json]`: 개요(상태별 카운트 + 최근 run) — GUI 대시보드 스냅샷
- `detectRunChanges(prev, curr)`(core, 순수) + `baton watch [--interval <s>] [--once]`:
  스냅샷 diff를 **NDJSON 변경 이벤트**로 stdout 스트림(HTTP 없음)
- `docs/INTEGRATION.md`: GUI 통합 계약 문서(봉투/명령별 data 형태/watch 이벤트/버전 정책)
- 단위/통합 테스트(순수 diff 결정적, watch --once 결정적, hermetic)

## Out of Scope

- HTTP/소켓 서버, 데몬, 인증, 웹소켓, 실제 GUI, 양방향 쓰기 API(read 전용)

## Constraints

- **read 전용**(상태 변경 없음). 출력은 결정적·버전드(schemaVersion).
- watch는 **bounded poll**(interval, --once로 1회). HTTP 서버 미도입.
- 기존 read 동작과 호환(봉투 표준화는 계약 기준선으로 명시·테스트 갱신).
- credential/세션 토큰 무접근, danger 무관. 런타임 의존성 추가 없음.
- base = `origin/main`(v0.1~v0.12). 인덱스/파일 폴백(v0.12) 위에서 동작.
