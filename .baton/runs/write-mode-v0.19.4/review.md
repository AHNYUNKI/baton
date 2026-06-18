# Review — write-mode-v0.19.4

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-write-mode`
(branch `baton/write-mode-v0.19.4`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 격리 | ✅ Swift / 기존 Run `cli/registry.ts` / `WorkerRegistry` **무변경** |
| 게이트 | ✅ `pnpm typecheck` / `test` **289 passed**(+11) / `build` 직접 재실행 통과 |
| 이중 opt-in | ✅ `--write` + provider 둘 다일 때만 쓰기, 기본 읽기전용/stub |
| 이중 게이트 | ✅ pre-dispatch 승인 + post-run diff 검토(awaiting-review) |
| worktree 보존 | ✅ accept/reject 모두 removeWorktree 미호출, 자동 머지/푸시/revert 없음 |

## Independent Verification (직접 재실행/정독)
- **ProcessRunner**: `ProcessRunResult.metadata?` **선택 필드 추가**(benign). 기존 테스트 변경은
  WorktreeManager mock에 `diff` 추가 + 정확 인자 테스트뿐(어서션 약화 없음).
- **GitWorktreeManager.diff**: `git -C <wt> add -A` → `--no-pager diff --cached --stat`(→
  metadata.diffStat) → `--no-pager diff --cached`(전체). 정확 인자 테스트 통과.
- **AgentWorkerRegistry**: readOnly=false(write) → codex `sandbox:"workspace-write"`, claude
  `{readOnly:false, outputFormat:"json", write:true}`. 읽기전용/stub 경로 보존. (v0.19.3 throw 완화.)
- **ClaudeCodeAdapter**: write 옵션 → 편집 모드(acceptEdits, `claude --help` 확인). 읽기전용 plan/
  기본 `--print` 보존.
- **dispatchConfig**: `write` 영속(team-run-dispatch.json)→approve 적용. round-trip 테스트.
- **TeamRunExecutor**: write 완료 → `captureDiffArtifact`(diff.patch + diffSummary) → `awaiting-
  review` + pending post-run-review approval + `teamRun.awaitingReview` 이벤트(자동 completed 아님).
  `review()` accepted→completed/rejected→cancelled(파일 변경/머지/revert 없음, worktree 보존),
  이벤트 review.accepted/rejected. resume는 awaiting-review 게이트 유지. diff 캡처 실패도 graceful
  (요약 기록 후 게이트). 읽기전용/stub은 종전대로 completed.
- **CLI**: `plan run start --write`(provider와 함께만), `plan run review <id> --accept|--reject`,
  show diffSummary+안내. preflight/dispatchConfig 확장.
- 테스트: write diff→review 대기, accept(worktree 미제거)/reject(보존+cancelled), resume 게이트,
  잘못된 review 오류, base=main 거부, CLI write 모드 게이트, 읽기전용 직행(회귀).

## Acceptance Criteria
AC-01~14 충족. 종단 실제 쓰기(실 CLI·인증)는 **수동 QA** — 설계대로.

## Deviations / Notes
- 계획 외 `ProcessRunner.metadata?` 추가 — diff --stat 요약 전달용, 선택 필드라 benign. 승인.
- diff 캡처 = `git add -A` 후 cached diff(설계 의도대로, 미커밋 변경 전부).
- diff 캡처 실패 시 failed 대신 요약 기록 후 게이트(검토 가능) — 합리적 보수 처리.

## Manual QA (사용자, 실 CLI·인증)
`plan run start <pid> --claude --write` → approve →(실행)→ show: ① worktree `git status` 변경,
② diff.patch + diffSummary, ③ `review --accept`→completed / `--reject`→cancelled, ④ main 무영향.

## Follow-ups
- **순서 1**: Swift 실행 모니터 + 조직도 라이브 점등(상태/토큰/diff 요약).
- **순서 3**: 예산 게이트, 스킬(v0.20). 쓰기 run worktree 정리 정책, 병렬/역할별 게이트.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/Swift 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 → 머지 후 main dist 재빌드.
