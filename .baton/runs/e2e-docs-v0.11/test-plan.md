# Test Plan

러너: Vitest. E2E는 hermetic: 주입 mock ProcessRunner + 임시 cwd/`$BATON_HOME` +
fixed clock. **실제 codex/claude/git/네트워크 금지.**

## E2E Test (canonical)

`packages/cli/test/e2e.test.ts` — 기본 워크플로우 완주:
1. (선택) `runCli(["init"], {cwd})` 또는 config set으로 워커 구성.
2. `runCli(["run", "<request>", "--test", "--test-command", "<cmd>"], {cwd, runner})`
   → analyze/design(stub) 후 **approve 게이트**에서 awaiting-approval 단언.
3. `runCli(["run","approve",runId], {cwd,runner})` → resume → **implement 게이트**
   awaiting-approval(기본 정책) 단언.
4. `runCli(["run","approve",runId], {cwd,runner})` → resume → implement(stub) →
   test(mock runner exit 0) → review(stub) → finalize(FinalizeWriter) → completed 단언.
5. run 디렉터리: request.md/run.json(completed)/test_result.md/final_summary.md/
   pr_description.md 존재 단언.
6. `runCli(["run","list"], …)`/`["run","show",runId]` → 반영 단언.
7. 저널: `env.BATON_OBSIDIAN_VAULT`=임시 볼트 → `<vault>/Baton/Runs/<runId>.md` +
   인덱스 + 복사된 final_summary.md 단언.

### E2E — fix 변형(선택)
- mock runner가 test를 1회 실패 후 성공하도록 구성 + `--fix --codex` → bounded 재시도
  후 통과, run completed, attempts 기록 단언.

## Docs Tests (가벼운 검증)

- 문서의 핵심 명령/플래그(예: `baton run`, `--codex`, `run approve`, `config set`)가
  실제 usage 문자열/CLI에 존재함을 단언(드리프트 방지).
- docs/USAGE.md, docs/ARCHITECTURE.md 파일 존재 + README 링크 존재(선택).

## Security / Hermetic Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- E2E가 mock runner만 사용(실제 프로세스/네트워크 호출 0) 단언.

## Out of Scope (테스트 비대상)

- 실제 codex/claude 실행, 실제 git worktree, 호스팅 문서, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.10 + v0.11 E2E, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
