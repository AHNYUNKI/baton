# Review — e2e-docs-v0.11

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-e2e-docs-v0.11`(branch `baton/e2e-docs-v0.11`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, v0.10 config PRESENT |
| 게이트 | ✅ typecheck 통과, **161/161 tests (30 files)**, v0.1~v0.10 회귀 없음(+3) |
| E2E 완주 | ✅ 두 게이트(approve, implement) 승인 → 7단계 completed |
| hermetic | ✅ `mock.calls`가 정확히 `git worktree add` + `pnpm test`만, codex/claude 0회 |
| 산출물/저널/이력 | ✅ 결정적 단언 |
| 문서 정확성 | ✅ docs.test.ts 드리프트 방지 |

## Independent Verification

- base 검증 통과(origin/main 후손, v0.10 batonConfig 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **161 passed**.
- `e2e.test.ts`(canonical, hermetic): fixed clock + mock runner + 임시 home/cwd/vault.
  - run → **approve 게이트 awaiting-approval**(analyze/design completed) → run approve →
    **implement 게이트 awaiting-approval** → run approve `--test` → resume →
    implement/test/review/finalize → **completed**(7단계 전부 completed). 승인 2건 기록.
  - 산출물: request.md, run.json(completed), test_result.md(`Summary: PASS`),
    final_summary.md, pr_description.md(요청 기반 제목).
  - `run list`(Total: 1, completed) / `run show`(Request, 아티팩트 목록) 반영.
  - 저널: `<vault>/Baton/Runs/<id>.md`(status completed) + `Runs.md`(dataview/wikilink)
    + 복사된 final_summary.md === run 디렉터리 원본(자기완결).
  - **`mock.calls` 정확 단언**: [git worktree add … baton/<id> main @cwd, pnpm test
    @worktreePath], `codex`/`claude` 호출 **false** → 실제 외부 실행 0(hermetic).
- `docs/USAGE.md`/`ARCHITECTURE.md` 존재, `docs.test.ts`가 문서 명령/플래그의 CLI
  일치를 검증(드리프트 방지). 문서가 analysis/design/review.md는 실제 `--claude`에서
  생성됨을 정직히 구분.

## Acceptance Criteria

AC-01 ~ AC-14 충족 확인(선택 fix 변형 E2-AC06은 미추가 — 기존 fix-loop 테스트로 커버,
설계상 optional).

## Deviations / Notes (수용 가능)

1. E2E가 순수 Stub이 아니라 **실제 GitWorktreeManager + TestRunner를 mock ProcessRunner
   위에서** 구동 — stub보다 더 실질적이면서 hermetic. 우수.
2. optional fix E2E 변형은 별도 추가 안 함(기존 fix-loop CLI 테스트 회귀로 유지). 수용.
3. 보안 테스트가 docs.test.ts의 금지 문자열을 잡아 조정됨 — self-match 회피, 정상.

## Follow-ups (비차단)

- 실제 외부 codex/claude E2E(수동/문서), 호스팅 문서, fix E2E 변형.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
