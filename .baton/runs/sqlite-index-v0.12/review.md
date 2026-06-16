# Review — sqlite-index-v0.12

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-sqlite-index-v0.12`(branch `baton/sqlite-index-v0.12`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, v0.11 e2e PRESENT |
| 게이트 | ✅ typecheck 통과, **181/181 tests (33 files)**, v0.1~v0.11 회귀 없음(+20) |
| 파일 source-of-truth | ✅ RunStore.save temp→rename(원자적) 후 best-effort 인덱스 upsert |
| 가드된 폴백 | ✅ openDatabase 동적 import + try/catch → undefined, 주입형 loader |
| 인덱스↔파일 parity | ✅ stale/partial/실패 인덱스까지 파일 폴백(5종 테스트) |
| 보안 | ✅ credential/세션 토큰/danger 0, 네이티브 드라이버 0, SQL 파라미터 바인딩 |

## Independent Verification

- base 검증 통과(origin/main 후손, v0.11 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **181 passed**.
- `NodeSqliteClient`: `database.prepare(sql).run(...params)` / `.all(...params)` —
  파라미터 바인딩, SQL 문자열 결합 없음. `openDatabase`는 `Promise<DbClient|undefined>`,
  동적 import 실패 시 undefined(throw 없음), 주입형 `loadSqliteModule`로 가드 테스트.
- `RunStore.save`: run.json을 temp→rename으로 **원자적 기록(권위)** 후, index 주입 시
  `try { index.upsert } catch { warn }`(best-effort). 테스트: "upserts injected index
  after saving", "keeps save best-effort when index upsert fails", "does not require
  an index".
- `listRuns` 폴백/parity 테스트:
  - "same result as the file scan when the index is current"(parity),
  - 인덱스 empty/missing dirs/query 실패/**indexed row no longer matches run.json
    (stale)** → 전부 파일 폴백. 설계 최소를 넘는 정합성 방어.
- `RunIndex`: "upserts idempotently", "rebuilds from valid run.json files and skips
  invalid". "keeps run index SQL parameterized".
- 네이티브 드라이버(better-sqlite3) 없음, node:sqlite 내장만. `db status` 스모크 정상.

## Acceptance Criteria

AC-01 ~ AC-16 충족 확인.

## Deviations / Notes (수용 가능, 일부는 개선)

1. **listRuns가 stale 인덱스(인덱스 행 ≠ run.json)까지 감지해 파일 폴백** — 설계는 빈/
   실패 폴백만 요구했으나 정합성 방어를 강화. **개선, 승인.**
2. `.baton/baton.db`(+ -wal/-shm) gitignore 제외 확인.

## Follow-ups (비차단)

- source-of-truth 전환(원할 경우), 스키마 마이그레이션 러너, 멀티 프로세스 락,
  전 도메인(projects/workflows) 영속화. (다음 GUI 디딤돌: 안정적 read API/serve 경계.)

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
