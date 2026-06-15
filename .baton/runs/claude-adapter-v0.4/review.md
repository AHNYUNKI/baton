# Review — claude-adapter-v0.4

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-claude-adapter-v0.4`(branch `baton/claude-adapter-v0.4`)
직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| 게이트(typecheck/test/build) | ✅ 독립 재실행 — typecheck 통과, **81/81 tests 통과 (19 files)** |
| 읽기 전용 어댑터 | ✅ 기본 args `["--print"]`, write/danger 플래그 없음 |
| opt-in 안전(기본 Stub) | ✅ 플래그 없으면 claude 호출 0회 |
| 프리플라이트 무생성 / 조합 / 산출물 | ✅ 실제 테스트로 고정 |
| 보안(codex cred + **Claude 세션 토큰** + danger) | ✅ 소스 스캔 회귀 테스트로 차단 |

## Independent Verification

- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **81 passed** (v0.3 67 → +14, 회귀 없음).
- 보안 grep + `security.test.ts` 소스 스캔: `auth.json`/`.codex`/`credential`/
  `danger-full-access`/`.claude…token`(세션 토큰) 패턴 매치 0(self-match 회피로 구현).
- `ClaudeCodeAdapter`:
  - 기본 args `["--print"]` — **읽기 전용**, write/edit/danger/full-access 부재(AC-04).
  - 프롬프트 stdin(`input`) 전달, argv 평문 없음(AC-03).
  - stepType별 산출물: analyze→`analysis.md`, design→`design.md`, review→`review.md`
    (AC-05). 프롬프트 아티팩트 `steps/<stepId>.prompt.md`(AC-06).
  - exit!==0/예외 → success:false(AC-07). 토큰/credential 미접근(AC-08).
- `registry.ts`: `createWorkerRegistry({codex,claude,runner})` — codexRoles=
  implementer/fixer, claudeRoles=analyst/architect/reviewer. 기존 함수 위임 유지.
  테스트가 조합별 role→adapter 매핑 단언(AC-12/13/17).
- `RunExecutor`: worker metadata에 `stepType`/`role` 추가(AC-01).
- CLI 테스트:
  - "executes a run with the default StubWorker registry" + `claude` 호출 false(AC-14).
  - "does not create a run or worktree when claude preflight fails"(AC-16).
  - `--claude` 실행 → `analysis.md`/`design.md` 생성, claude cwd==worktreePath ×2(AC-05/20).
  - `--codex --claude` → codex/claude 모두 cwd==worktreePath, 역할 분리(AC-17).
  - `claude doctor` 미설치 vs 오류 구분(AC-09/10).

## Acceptance Criteria

AC-01 ~ AC-23 충족 확인. 이로써 `analyze → design → implement → review` 파이프라인이
모두 실제 워커(Claude/Codex)로 동작 가능 — Baton 역할 기반 오케스트레이션 비전 완성.

## Deviations / Notes (수용 가능)

1. **보안 테스트의 self-match 회피**(패턴 문자열 분할 결합). 테스트 파일 자체가
   금지 패턴에 매치되지 않도록 한 정당한 기법. **승인.**
2. 기본 claude args가 `--print` 단일 — 실제 CLI 플래그 변화는 adapter `args` 옵션으로
   조정(v0.3 Codex와 동일한 가정/완화). 비차단.

## Follow-ups (비차단)

- 실제 Claude 멀티턴/MCP, SQLite 영속화, worktree diff 캡처/자동 정리.
- `.gitignore` 설계-run allow-list 제네릭화(현재 마일스톤별 명시 누적).
- 산출물 stdout을 그대로 기록 — 향후 형식 검증/후처리 고려.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수. 변경은 `baton/claude-adapter-v0.4`에 untracked/수정.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
