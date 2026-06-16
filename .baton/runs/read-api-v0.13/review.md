# Review — read-api-v0.13

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-read-api-v0.13`(branch `baton/read-api-v0.13`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, v0.12 RunIndex PRESENT |
| 게이트 | ✅ typecheck 통과, **193/193 tests (35 files)**, v0.1~v0.12 회귀 없음(+12) |
| HTTP 서버 부재 | ✅ createServer/listen/net/http/WebSocket 0 (비목표 존중) |
| 봉투 일관성 | ✅ `makeEnvelope(kind, data)`, schemaVersion literal + kind literals |
| watch bounded | ✅ `--once` 분기 + interval sleep(tight 루프 아님) + stop 신호 |
| read 전용 | ✅ "keeps read API commands read-only" 테스트 |
| 보안 | ✅ credential/세션 토큰/danger 0 |

## Independent Verification

- base 검증 통과(origin/main 후손, v0.12 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **193 passed**.
- 봉투: `run list`→`makeEnvelope("run-list")`, `run show/status`→`makeEnvelope("run-detail")`,
  `state`→`makeEnvelope("state")`. `readApi.schema.ts`가 `schemaVersion: z.literal(...)` +
  kind literal로 검증. 모든 --json 단일 JSON.
- `detectRunChanges`(순수): runId set 합집합을 `compareString` 정렬 후 created/removed/
  status-changed/updated 산출 → 결정적. 테스트 "detects created runs" 등.
- `watch.ts`: `--once`는 스냅샷 emit 후 return. 연속은 `while (!stopState.stopped) {
  await sleepUntilStopped(intervalMs, stopState) }` — **interval 대기(tight 루프 아님)** +
  신호 stop. NDJSON(한 줄당 1 이벤트).
- HTTP/소켓 서버 없음(grep 0) → AGENTS.md "Local API server" 비목표 준수.
- 테스트: "validates versioned JSON envelopes"/"run-list envelopes"/"watch events and
  event envelopes"(schema), "state as text and as a state json envelope",
  "watch --once as deterministic event NDJSON", "run show and status as run-detail json
  envelopes", "keeps read API commands read-only", docs "links docs from README".

## Acceptance Criteria

AC-01 ~ AC-16 충족 확인.

## Deviations / Notes (수용 가능)

1. `run list --json`이 봉투로 표준화되며 기존 출력 형태 변경 — 의도된 계약 기준선
   (schemaVersion 1), 외부 소비자 없는 시점에 확정. 관련 테스트 갱신됨.
2. 연속 watch 모드는 단위 테스트 대상 아님(설계대로) — 순수 diff + `--once`로 결정적 커버.

## Follow-ups (비차단)

- (원할 경우) HTTP/소켓 serve, 양방향 쓰기 API, 실제 Swift GUL. 현재 계약(--json 스냅샷 +
  watch NDJSON + db 인덱스) 위에 GUI를 바로 올릴 수 있음.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
