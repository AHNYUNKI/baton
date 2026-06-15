# Review — run-engine-v0.2

Reviewer: Claude Code (Design + Review). 별도 worktree
`/Users/ahnyunki/app/baton-run-engine-v0.2`(branch `baton/run-engine-v0.2`)를
직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| 게이트(typecheck/test/build) | ✅ 독립 재실행 — typecheck 통과, **51/51 tests 통과 (17 files)** |
| 스키마 하위호환 | ✅ 전부 additive(optional + enum 값 추가), `approvals?` 임베드 |
| 안전(credential/danger/.js) | ✅ 위반 없음 |
| 게이트 무실행 / cwd 격리 / resume 멱등 | ✅ 실제 테스트 단언으로 고정됨 |
| dry-run 회귀 | ✅ 유지 |

## Independent Verification

- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **51 passed**.
- 보안 grep: `auth.json|\.codex/|credential` 0, `danger-full-access` 0.
- 상대 임포트 `.js` 누락 0.
- `RunExecutor` 핵심 로직 직접 확인:
  - 게이트: `isGate(step) && approval?.status !== "approved"` → `awaiting-approval`
    저장 후 **return(worker 미호출)**. 테스트 `expect(calls).toHaveLength(0)` (AC-14/25).
  - cwd: `invokeWorker`가 `cwd: requiredWorktreePath(run)`. 테스트가 두 호출 모두
    `cwd === worktreePath` 단언 (AC-09).
  - worker 실패: try/catch → 실패 `WorkerRunResult`. 이후 step `failed`, run `failed`,
    `skipFromIndex`로 잔여 `skipped`, throw 없음. 테스트 `["failed","skipped"]` (AC-11).
  - 미등록 역할 → `skipped`(reason). 테스트 `["skipped","completed"]` (AC-12).
  - resume: 첫 비종료 step부터, 완료 step 재실행 안 함. 테스트가 부분 완료 상태에서
    resume 시 `calls` 1회만 단언 (AC-18).
  - 거부: `decide(rejected)` → run `cancelled` + 잔여 `skipped` (AC-16).
  - worktree 1회 생성, 브랜치 `baton/<runId>` 인자 단언 (AC-08).

## Acceptance Criteria

AC-01 ~ AC-28 충족 확인. (스키마 확장, RunStore 영속, 실행 루프, 승인 게이트,
resume, CLI 서브커맨드, 보안, 회귀 모두 테스트로 뒷받침.)

## Deviations from Design (수용 가능)

1. **`Run.approvals?` 임베드** (설계는 Approval을 별도 취급). → run.json에 승인을
   함께 저장해 재개를 단순화. 모든 필드 optional이라 하위호환 유지. **승인.**
2. **`start()`/`invokeWorker` durationMs에 `Date.now()` 사용.** → 프로덕션 코드의
   정당한 사용(워크플로우 스크립트 제약과 무관). **승인.**

## Notes / Follow-ups (비차단)

- ⚠️ **동작 변화 주의**: 실제 `baton run "<request>"`는 이제 `GitWorktreeManager`로
  **실제 git worktree를 생성**한다(의도된 격리). 기본 worker는 `StubWorker`라 실제
  코드 변경은 하지 않지만, run마다 `<batonHome>/worktrees/<runId>` worktree가
  생성·보존된다. 정리는 후속 `run clean`(TODO).
- base 브랜치 기본값 `main` — 새 run worktree를 main에서 분기(읽기 전용). 프로젝트
  현재 브랜치 기준 분기 옵션은 후속 UX 고려.
- 실제 Codex 실행 연결, SQLite 영속화, worktree 자동 정리는 다음 마일스톤.
- `.gitignore` 네거티브 패턴 버그(bootstrap-v0.1 리뷰에서 식별)는 여전히 미해결 —
  하드닝 패스에서 처리 권장.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수. 변경은 `baton/run-engine-v0.2` worktree에 untracked/수정.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
