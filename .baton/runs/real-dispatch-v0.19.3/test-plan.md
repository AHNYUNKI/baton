# Test Plan — real-dispatch-v0.19.3

게이트: 루트 **pnpm typecheck/test/build**(회귀 0). 단위 테스트는 **주입 mock runner**(실
codex/claude 불요). 종단 실제 실행은 **수동 QA**.

## Unit — ClaudeCodeAdapter (mock runner)
- readOnly:true → 실행 인자에 비편집 권한 플래그 포함.
- outputFormat:'json' → `--output-format json` 인자 + stdout JSON 파싱: result→stdout,
  usage→metadata.usage{inputTokens,outputTokens}.
- JSON 파싱 실패(비-JSON stdout) → 원문 유지 + usage 생략(폴백), 크래시 없음.
- **옵션 미지정 → 현행 `--print` 평문 동작 보존**(인자/결과 동일).

## Unit — AgentWorkerRegistry
- codex:true → CodexExecAdapter가 sandbox 'read-only'로 생성(주입 인자/스파이 검증).
- claude:true → ClaudeCodeAdapter가 readOnly+json으로 생성.
- 미지정 → StubWorker.

## Unit — CodexExecAdapter (있으면)
- usage 있는 mock 출력 → metadata.usage 설정. 없음 → 미설정(추정 폴백).
- sandbox 'read-only' 인자 전달.

## Integration — CLI (mock runner)
- `plan run start` (플래그 없음) → stub 경로(실제 호출 없음).
- `--codex`/`--claude` → 해당 실제 어댑터 선택(읽기전용). `--timeout-ms` 반영.
- preflight: checkCodex/checkClaude 실패(mock) → 친절한 비영 오류, 디스패치 미진입.
- 승인 흐름(start→awaiting→approve) 불변.

## Regression / Safety
- 기존 Run 경로(`createWorkerRegistry`, claude `--print`) + 기존 teamRuns/CLI 테스트 회귀 0.
- 쓰기 모드 미노출. credential/HTTP 없음. Swift 미변경.

## Manual QA (실 CLI·인증 필요)
- codex/claude 설치·인증 상태에서 `baton project plan run start <pid> --claude`(또는 --codex)
  → approve → show:
  - repo 파일 **미수정**(worktree에서 `git status` 깨끗 — 읽기 전용 확인).
  - run 디렉터리에 프롬프트/산출물/로그 기록.
  - claude 토큰이 **실측**으로 표시(`plan run show` 토큰 표 estimated 주석 사라짐 또는 혼합).
  - 미설치 시 preflight 오류 확인.

## Out of Scope (테스트 비대상)
- 쓰기 모드, 병렬/역할별 게이트/fix 루프, Swift, codex usage 정밀 파싱.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
```
