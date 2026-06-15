# Review — bootstrap-v0.1

Reviewer: Claude Code (Analysis/Design + Review). Codex 요약을 신뢰하지 않고
워킹 트리를 직접 검증함. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| 구조(3 패키지 + examples + 명령) | ✅ 설계와 일치 |
| 게이트(typecheck/test/build) | ✅ 독립 재실행 — typecheck 통과, **28/28 tests 통과** |
| 안전(credential/danger/main) | ✅ 위반 없음 |
| dry-run 무부수효과 | ✅ 테스트로 고정됨 |
| 런타임 의존성 | ✅ `zod`, `yaml`만 (네이티브 0) |

## Independent Verification

- `corepack pnpm typecheck` → 통과 (tsc -p tsconfig.typecheck.json --noEmit).
- `corepack pnpm test` → **28 passed (11 files)**.
- 보안 grep(직접 실행):
  - `auth.json|\.codex|credential` → **매치 없음** (AC-23).
  - `danger-full-access` → **매치 없음**. CodexExecAdapter 기본 sandbox =
    `workspace-write` (AC-24).
  - `push|deploy` → 매치 없음 (AC-26).
- 상대 임포트 `.js` 확장자 누락 → **없음** (ESM/NodeNext 회귀 위험 R2 차단, AC-05).
- `GitWorktreeManager`: 브랜치 `baton/${runId}`, base 기본 `main`을 **새 worktree의
  base로만** 사용(main 직접 수정 경로 없음), 인자는 배열 전달(셸 결합 없음) — AC-25.
- `RunService.createRun`: non-dryRun은 throw, worker/worktree 주입되나 호출 안 함.
  test가 `worker.run`/`worktreeManager.createWorktree` `not.toHaveBeenCalled()` 단언 — AC-16.

## Acceptance Criteria

AC-01 ~ AC-28 충족 확인. (Build/test/typecheck, 스키마 6종, 포트/서비스/어댑터
골격, 7개 명령, 예제 YAML, README, 안전 단언 모두 확인.)

## Deviations from Design (수용 가능)

1. **`packages/cli/src/commands/context.ts` 추가** (계획 외). → 새 명령이 아니라
   CLI 명령들의 공유 타입 + 주입형 `runner`(DI seam) 모듈. 얇은 CLI의 테스트
   가능성을 높이는 합리적 헬퍼. **승인.**
2. **`tsconfig.typecheck.json` 도입.** `tsc -b --noEmit`가 project references에서
   TS6310을 내므로 strict no-emit 전용 tsconfig로 분리. 설계 의도(strict typecheck
   게이트)와 동등. **승인.**
3. **`baton codex doctor`가 `codex` 서브커맨드로 매핑** (`case "codex"` → doctor).
   요구 명령 표와 일치. 단, 향후 `codex <other>` 확장 시 doctor 외 분기 필요 —
   후속 TODO.

## Follow-ups (비차단, 후속 run)

- 실제 SQLite 드라이버 연결(현재 인터페이스+DDL+skeleton).
- 실제 Codex 실행 + 실제 git worktree 실행 연결(현재 ProcessRunner 골격).
- 워크플로우 실행 엔진(현재 dry-run 계획까지).
- ESLint flat config(v0.1 비목표).
- `codex` 명령 그룹이 doctor만 처리 — 서브커맨드 라우팅 일반화.
- `.gitignore`가 `packages/*/dist`를 포함하는지 확인(빌드 산출물 트래킹 방지).

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수. 변경은 `baton/bootstrap-v0.1` 브랜치에 untracked.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/bootstrap-v0.1/*` 미수정 확인.
