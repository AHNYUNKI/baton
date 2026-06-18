# Test Plan — write-mode-v0.19.4

게이트: 루트 **pnpm typecheck/test/build**(회귀 0). 단위는 **주입 mock runner/worktreeManager**.
종단 실제 쓰기는 **수동 QA**.

## Unit — schema
- TeamRunStatus 'awaiting-review' 수용. diffSummary 부재/존재. team-run 봉투 round-trip.

## Unit — GitWorktreeManager.diff (mock runner)
- diff(worktreePath) → 올바른 git 인자/cwd(예: add -A, --no-pager diff --cached/--stat) 호출.
- 결과 ProcessRunResult 전달.

## Unit — write 프로파일
- dispatchConfig write round-trip(read/write/validate).
- ClaudeCodeAdapter write 옵션 → acceptEdits 인자(읽기전용 plan/기본 --print 보존 별도 확인).
- AgentWorkerRegistry readOnly=false → codex workspace-write / claude write+json. readOnly=true →
  기존 읽기전용. 미지정 → stub.

## Unit — TeamRunExecutor (mock runner/worktreeManager)
- write 모드 전부 성공 → diff 캡처(아티팩트 diff.patch + diffSummary) → status awaiting-review +
  pending post-run-review approval. (completed 아님.)
- review accepted → completed. review rejected → cancelled. 둘 다 removeWorktree **미호출**(보존).
- 읽기전용/stub 모드 → review 없이 completed(회귀).
- resume: awaiting-review면 게이트 유지(디스패치 재개 안 함).
- 잘못된 review(awaiting-review 아님) → 오류.

## Integration — CLI (mock runner)
- `plan run start --codex --write` → workspace-write 경로, 실행 후 awaiting-review.
- `plan run review <id> --accept` → completed; `--reject` → cancelled.
- `plan run show` → diffSummary + 검토 안내(awaiting-review).
- `--write` 없이/ provider 없이 → 읽기전용/stub(쓰기 안 함).

## Regression / Safety
- 기존 Run(`createWorkerRegistry`)/claude 기본 --print/읽기전용 디스패치/teamRuns/CLI 회귀 0.
- 자동 머지/push/revert/worktree 제거 미발생. credential/HTTP 없음. Swift 미변경.

## Manual QA (실 CLI·인증)
- `baton project plan run start <pid> --claude --write` → approve → (실행) → show:
  - worktree 파일 **실제 수정**됨(git status에 변경), diff.patch 생성, diffSummary 표시.
  - `review --accept`→completed / `--reject`→cancelled. main 무영향(자동 머지/푸시 없음).

## Out of Scope (테스트 비대상)
- 자동 머지/푸시/revert, 중간 게이트, 병렬/fix/재위임, Swift, worktree 자동 정리.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
