# Review — codex-exec-v0.3

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-codex-exec-v0.3`(branch `baton/codex-exec-v0.3`)를
직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| 게이트(typecheck/test/build) | ✅ 독립 재실행 — typecheck 통과, **67/67 tests 통과 (18 files)** |
| opt-in 안전(기본 Stub) | ✅ 테스트로 고정 |
| 프리플라이트 무생성 | ✅ 실패 시 `.baton/runs` 미생성까지 단언 |
| 프롬프트 stdin / cwd 격리 | ✅ |
| 보안(credential/danger/.js) | ✅ 위반 없음 |

## Independent Verification

- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **67 passed**.
- 보안 grep: `auth.json|\.codex/|credential` 0, `danger-full-access` 0, `.js` 누락 0.
- `CodexExecAdapter`: 프롬프트를 `runnerOptions`의 `input`(stdin)으로 전달, args
  기본 `["exec","--sandbox","workspace-write"]`에 **프롬프트 평문 없음**(AC-04).
  `steps/<stepId>.prompt.md` 아티팩트(AC-05). exit!==0/예외 → `success:false`(AC-07).
- `registry.ts`: `createCodexWorkerRegistry`가 implementer/fixer만
  `CodexExecAdapter`, 나머지 Stub(AC-13). 기본 `createDefaultWorkerRegistry` 전부 Stub.
- `run.ts`: `if (parsed.useCodex) preflightCodex()` — **--codex일 때만**, 그리고
  `executor.start`(worktree 생성) **이전**. 실패 시 early return.
  - 테스트 "does not create a run or worktree when codex preflight fails":
    exit 1, codex 호출 1회(version)뿐, `readdir(.baton/runs)` reject(무생성) — AC-14.
  - 테스트 "runs codex after approval inside the run worktree when opted in" — AC-15.
- `checkCodex`: `not-installed` vs 오류 reason 구분, doctor가 메시지 분기(AC-09/10).
- `run clean`: 종료 상태(completed/failed/cancelled)만 허용, 비종료 거부("Cannot
  clean"), `cleanedAt` 멱등, **repo root 정리 거부**, `removeWorktree(worktreePath)`
  — 테스트 3종(terminal/refuse-active/refuse-root)으로 단언(AC-17/18/19).
- `.gitignore`: `.baton/runs/*` + `!.baton/runs/bootstrap-v0.1/` +
  `!.baton/runs/codex-exec-v0.3/` → 설계 run 추적 가능, 런타임 run 무시(AC-21).

## Acceptance Criteria

AC-01 ~ AC-23 충족 확인. v0.1/v0.2 테스트 회귀 없음(67 = 51 + 16 신규).

## Deviations / Notes (수용 가능)

1. **`run clean`에 repo-root 정리 거부 가드 추가**(설계 외 보강). worktreePath가
   cwd와 같으면 거부 → R4 강화. **승인(개선).**
2. **`.gitignore` allowlist가 마일스톤별 명시**(`bootstrap-v0.1`, `codex-exec-v0.3`).
   `run-engine-v0.2`는 미포함이나 이미 추적된 파일이라 영향 없음. 다만 신규 설계
   run마다 allowlist 추가가 필요 — 후속에서 제네릭 패턴 고려 권장(비차단).
3. CLI가 `--codex` 시 stderr로 "Warning: using CodexExecAdapter for ..." 경고 출력 —
   실제 실행 가시성 확보. 적절.

## Follow-ups (비차단)

- analysis/design용 ClaudeCode 어댑터(현재 해당 역할 Stub).
- SQLite 영속화, worktree diff 캡처, worktree 자동 정리 정책.
- `.gitignore` 설계-run allowlist 제네릭화.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수. 변경은 `baton/codex-exec-v0.3`에 untracked/수정.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
