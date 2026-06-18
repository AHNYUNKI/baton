# Acceptance Criteria — write-mode-v0.19.4

쓰기 모드(이중 게이트)가 완료되려면 아래 모두 충족. 단위는 mock runner/worktreeManager, 종단
실제 쓰기는 수동 QA.

## opt-in (pnpm test)
- [ ] AC-01 쓰기는 **`--write` + provider(`--codex`/`--claude`)** 이중 opt-in일 때만. 둘 중 하나라도
  없으면 읽기전용/stub(쓰기 안 함).
- [ ] AC-02 `plan run start --write`가 dispatchConfig에 write를 영속하고 approve에서 적용한다.
- [ ] AC-10 기본/읽기전용/stub 경로 동작 불변(회귀 0).

## write 프로파일 (pnpm test)
- [ ] AC-03 write 시 CodexExecAdapter가 `--sandbox workspace-write`로 실행된다.
- [ ] AC-04 write 시 ClaudeCodeAdapter가 편집 모드(`--permission-mode acceptEdits` 등, `claude
  --help` 확인)로 실행된다. `--dangerously-skip-permissions`는 쓰지 않는다.

## diff 캡처 & 검토 게이트 (pnpm test)
- [ ] AC-05 write 모드 실행이 **전부 성공해도 자동 completed 되지 않고**, 누적 diff를 캡처한다.
- [ ] AC-06 캡처 후 status가 **`awaiting-review`** + pending review approval(stepId
  "post-run-review")로 저장된다.
- [ ] AC-07 `WorktreeManager.diff(worktreePath)`가 worktree의 미커밋 변경을 캡처한다(아티팩트
  `diff.patch` + `diffSummary`). 단위 테스트(mock runner: git 인자/cwd).
- [ ] AC-08 `plan run review <id> --accept` → `completed`; `--reject` → `cancelled`.
- [ ] AC-09 accept/reject **어느 쪽도 worktree를 자동 제거/되돌리지 않는다**(보존, removeWorktree
  미호출). 읽기전용 모드는 review 게이트 없이 직행 완료.

## 안전 & 회귀
- [ ] AC-11 모든 쓰기는 **worktree cwd 한정**, base≠main. main 직접 수정 없음.
- [ ] AC-12 **자동 머지/푸시/revert 없음**(사람이 통제). credential/auth 무접근, Baton 직접 HTTP 없음.
- [ ] AC-13 pre-dispatch 승인 게이트 유지(이중 게이트: 시작 전 + 끝 뒤).
- [ ] AC-14 루트 `pnpm typecheck/test/build` 통과(신규 포함, 기존 Run/teamRuns/CLI 회귀 0). Swift 미변경.

## 수동 QA (문서)
- [ ] (QA) 실 codex/claude로 `--write` 실행: ① worktree 파일이 실제 수정됨, ② show에 diffSummary +
  검토 안내, ③ `review --accept`→completed / `--reject`→cancelled, ④ main 무영향(자동 머지/푸시
  없음) — 절차를 요약에 명시.
