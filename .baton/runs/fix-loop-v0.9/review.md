# Review — fix-loop-v0.9

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-fix-loop-v0.9`(branch `baton/fix-loop-v0.9`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, v0.8 PRESENT |
| 게이트 | ✅ typecheck 통과, **145/145 tests (26 files)**, v0.1~v0.8 회귀 없음(+14) |
| **Bounded 종료** | ✅ `while (attempts < maxAttempts)` + 매 반복 `attempts += 1`, 통과 시 break. 무한 불가 |
| 회귀 0(fix 비활성) | ✅ `--fix` 미지정 → attemptFix 미진입, fixer 0회 |
| cwd 격리 | ✅ fixer/retry 모두 `requiredWorktreePath(run)` |
| 보안 | ✅ credential/세션 토큰/danger 0 |

## Independent Verification (핵심: 경계)

- base 검증 통과(origin/main 후손, v0.8 Finalize 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **145 passed**.
- `attemptFix`(RunExecutor): `isFixable && resolve('fixer')!==undefined`일 때만 진입,
  `while (attempts < maxAttempts) { attempts += 1; fixer 실행; step 재실행;
  if (retry.success) return fixed }` → 종료 보장(정수 상한 + 매 반복 증가, 중첩 없음).
- 테스트가 **정확한 호출 횟수**로 경계를 고정:
  - fix 비활성: tester 1, **fixer 0**, attempts undefined (AC-02).
  - 1회 fix 통과: attempts=1, tester 2(초기1+재시도1), fixer 1, reviewer 1, 모든
    cwd=worktreePath (AC-03/04/08).
  - **maxAttempts=3 소진: tester 4, fixer 3, reviewer 0 → run failed**(정확히 N, AC-04/05/15).
  - 처음 통과: tester 1, fixer 0, 루프 미진입 (AC-06).
  - fixer 미등록: 안전 실패(재시도 없음) (AC-07).
  - FixPolicy: 기본 1, 0/1.5/한도초과 거부, 한도 클램프 (AC-11).
- CLI: `--fix`+codex 재시도(281), 상한+fixer stub 경고(317), 잘못된 `--max-fix-attempts`
  run 생성 전 거부(348), resume/approve+`--fix`(1067/1139).
- `RunStep.attempts` optional(하위호환), fix.attempt/step.retried 이벤트 + 매 attempt
  영속화(resume 멱등 유지).

## Acceptance Criteria

AC-01 ~ AC-16 충족 확인. 가장 위험한 코어 엔진 루프 변경이 정수 하드 상한 + 정확한
호출 횟수 단언으로 안전하게 bounded됨.

## Deviations / Notes (수용 가능)

1. retry 산출물은 `retryStepArtifactId(stepId, attempts)`로 attempt별 기록, 최종
   상태는 step에 반영. 관측성 양호.
2. resume 경로(`isResumableFixStep`)가 attempts>0 step을 일관 처리 — 멱등 유지.

## Follow-ups (비차단)

- review 실패 자동 수정, LLM fix 전략 고도화, 실패 경로 finalize, SQLite.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
