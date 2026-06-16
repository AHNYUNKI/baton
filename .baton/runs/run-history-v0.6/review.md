# Review — run-history-v0.6

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-run-history-v0.6`(branch `baton/run-history-v0.6`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손(`merge-base --is-ancestor` yes), v0.5 journal PRESENT |
| 게이트 | ✅ typecheck 통과, **109/109 tests**, v0.1~v0.5 회귀 없음(+11) |
| 읽기 전용 | ✅ listRuns/list/show에 write/delete/save 호출 없음 |
| 정렬 결정성 | ✅ createdAt desc → runId asc |
| journal 리팩터 | ✅ core listRuns 재사용, v0.5 회귀 없음 |
| 보안 | ✅ credential/세션 토큰/danger 0 |

## Independent Verification

- base 검증 통과(origin/main 후손, v0.5 파일 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **109 passed**.
- `listRuns`: `RunSchema.safeParse`로 검증, 실패/부재 → `skipped++`(조용한 누락
  없음). `compareLoadedRuns` = createdAt 내림차순 → 동률 시 runId 오름차순(결정적).
  status 필터 후 limit. write/delete/save 호출 0(읽기 전용).
- `cli/journal.ts`: 자체 스캔 제거, core `listRuns` 사용(line 38/111).
- 테스트(실제 기능):
  - listRuns: 결정적 정렬, status→limit, missing/malformed/schema-invalid skip(=3),
    빈 결과. summarizeRuns 카운트.
  - CLI: list 정렬+요약(191), `--status`/`--limit`/`--json` 파싱(209), "2 skipped"+
    "No runs found."(233), show 상세(250), 없는 runId exit 1 "Run state not found"(303),
    **"keeps run list and show read-only"(312)**.

## Acceptance Criteria

AC-01 ~ AC-18 충족 확인.

## Deviations / Notes (수용 가능)

1. **`run list`의 `outcome`은 persisted Run에 별도 필드가 없어 terminal status에서
   유도.** 합리적(스키마 변경 회피). 비차단.
2. 설계 아티팩트가 새 worktree에 없어 Codex가 원본 worktree의 입력을 읽기 전용
   참고 — 정상(미수정).

## Follow-ups (비차단)

- SQLite 기반 이력 조회, watch/실시간 갱신, 다중 프로젝트 조회, 커서 페이지네이션.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
