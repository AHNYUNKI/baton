# Review — obsidian-journal-v0.5

Reviewer: Claude Code (Design + Review). **결론: REJECT (재작업 필요).**
코드 수정 없음. 머지 금지.

## Verdict

| 항목 | 결과 |
|---|---|
| **Base 브랜치** | ❌ **잘못됨** — v0.1(`cee756c`)에서 분기, v0.2~v0.4 누락 |
| CLI 통합 | ❌ 저널 훅이 v0.1 `--dry-run` 경로에만, 실제 run/resume/approve/clean 없음 |
| 저널 코어 | ✅ provider-agnostic, 재사용 가능 |
| 머지 가능성 | ❌ `main`(v0.1~v0.4 포함)에 머지 불가 |

## Root Cause

메인 체크아웃 `/Users/ahnyunki/app/baton`이 이전 PR(#1~#4) 머지 이후에도 `main`으로
갱신되지 않고 **v0.1 bootstrap 커밋(`cee756c`)에 머물러 있었다.** Codex가 여기서
`git switch -c baton/obsidian-journal-v0.5`로 분기 → v0.2(Run 엔진)·v0.3(실제 Codex)·
v0.4(Claude 어댑터)가 전부 빠진 트리 위에 작업했다.

증거:
- working tree에 `RunExecutor.ts`/`RunStore.ts`/`registry.ts`/`ClaudeCodeAdapter.ts`
  **모두 MISSING**.
- `run.ts`가 v0.1 형태(`Usage: baton run <request> --dry-run`), `maybeExportJournal`
  훅이 **dry-run 경로에만** 연결.
- 총 테스트 43개(= v0.1 28 + 저널 15). `main`은 v0.4에서 81개.
- Codex 자체 보고: "resume/approve CLI 흐름이 아직 없어서 …" — v0.1 base라 그렇게 본 것.
- `git rev-list --left-right origin/main...branch` = `7  0`(branch가 origin/main의
  조상, 즉 v0.1).

## Impact

- 자동 기록이 **실제 run 흐름(run/resume/approve/clean)에 미연결** — 핵심 요구
  (run 종료/대기 시 자동 기록)를 충족하지 못함.
- `workers` 메타가 항상 `stub`(실제 codex/claude 메타 미반영).
- `main`에 PR 시 대규모 충돌 또는 v0.2~v0.4 소실 위험.

## Salvageable (재사용 가능)

저널 코어는 provider-agnostic이라 그대로 재사용 가능:
- `packages/schemas/src/journalNote.schema.ts`
- `packages/core/src/journal/{resolveObsidianVault,ObsidianJournalExporter,render}.ts`
- `packages/cli/src/commands/journal.ts`(훅 함수)
- 관련 테스트(임시 볼트/fixedClock)

안전 속성(볼트 `Baton/` 하위 강제, runId sanitize, 삭제 없음, 미설정 no-op,
fixed clock)은 코드 검토상 양호 — 단 **올바른 base 위에서 재검증 필요.**

## Required Rework

1. **올바른 base에서 재작업**: `origin/main`(v0.1~v0.4 포함)에서 새 worktree/브랜치
   분기.
2. **저널 코어 이식**: 위 파일들을 그대로 가져와 재사용(거의 수정 불필요).
3. **실제 흐름에 훅 통합**: `maybeExportJournal`을 `run`(실제 실행)·`resume`·
   `approve`·`clean` 결과 직후에 연결(dry-run만이 아님).
4. **워커 메타 반영**: 사용된 레지스트리(codex/claude/stub)를 `JournalNoteMeta.workers`
   에 실제로 기록.
5. 전체 게이트(v0.1~v0.5 회귀 없음, `main` 기준 81+α 테스트) 통과.

## Process Fix (재발 방지)

향후 모든 Codex 핸드오프에 **명시적 base 브랜치 지정**을 추가한다:
"새 worktree를 `origin/main`(최신, v0.x 누적)에서 분기하라." 직전 마일스톤들은
각자 이전 브랜치에서 분기해 우연히 정상이었으나, 메인 체크아웃이 stale하면
이번처럼 깨진다.

## Reviewer Notes

- (1차) 커밋/푸시/PR 하지 않음(머지 금지).
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.

---

## Rework Verdict (rebased): ✅ APPROVE

worktree `/Users/ahnyunki/app/baton-obsidian-journal-v0.5`
(branch `baton/obsidian-journal-v0.5-rebased`, **base `origin/main`=e6c7e24**) 재검증.

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main의 후손(`merge-base --is-ancestor` yes), v0.2~v0.4 PRESENT |
| 게이트 | ✅ typecheck 통과, **98/98 tests (22 files)**, v0.1~v0.4 회귀 없음(+17) |
| 실제 흐름 훅 | ✅ `maybeExportJournal`이 run/resume/approve/clean 결과 직후 다수 연결(dry-run 전용 아님) |
| 엔진 무결합 | ✅ `RunExecutor`에 obsidian/journal 참조 0 |
| 경로 안전 | ✅ `sanitizeRunId`(`..`/구분자/제어문자 제거) + `assertWithinBaton`(모든 출력이 `<vault>/Baton/` 하위, startsWith 단언). 심볼릭 링크 복사 skip |
| export 실패 불변 | ✅ `maybeExportJournal` try/catch → 경고만, run exit code/결과 불변(AC-14) |
| 미설정 no-op | ✅ vault undefined면 early return |
| 자기완결+Dataview | ✅ 아티팩트 복사 + 임베드, 인덱스 Dataview 블록 + 정적 표, createdAt 내림차순, 멱등 |
| 워커 메타 | ✅ 실제 registry(codex/claude/stub) 반영(`inferJournalWorkers` + 전달 workers) |
| 보안 | ✅ credential/세션 토큰/danger 0, journal에 삭제 호출 0 |

AC-01~18 충족. 1차 REJECT 사유(잘못된 base + dry-run 전용 훅) 모두 해소됨.
