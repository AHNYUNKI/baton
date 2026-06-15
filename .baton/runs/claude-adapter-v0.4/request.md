# Request

## Run

- runId: `claude-adapter-v0.4`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `codex-exec-v0.3` (PR #3)

## User Request

Baton v0.4: **ClaudeCode 어댑터를 연결**해 analysis/design/review 역할을 실제
Claude로 실행한다. v0.3에서 implement/fix는 실제 Codex로 연결됐다. v0.4는
`analyze`/`design`/`review` step을 실제 `ClaudeCodeAdapter`로 디스패치해
`analyze → design → implement → review` 파이프라인을 실제 워커로 완성한다.
v0.3의 안전 패턴(configurable args + 프리플라이트 + opt-in + mock)을 재사용한다.

## Scope (v0.4)

- `ClaudeCodeAdapter`(WorkerAdapter): `claude` CLI를 **읽기 전용/비변경(print)**
  모드로 ProcessRunner stdin 프롬프트 호출, stdout 캡처
- step 타입별 **출력 아티팩트** 기록: analyze→`analysis.md`, design→`design.md`,
  review→`review.md` (+ 프롬프트 아티팩트)
- `RunExecutor` worker metadata에 `stepType`/`role` 추가(어댑터가 출력명 결정)
- `checkClaude(runner)` + `baton claude doctor`(미설치/오류 구분)
- 레지스트리 통합: `--codex`/`--claude` opt-in 조합 → 역할별 실제/Stub 선택
- CLI `--claude` opt-in + 프리플라이트(미가용 시 run/worktree 미생성)
- 모든 경로 단위/통합/보안 테스트(실제 claude/codex/git은 mock)

## Out of Scope

- 실제 Claude 대화형/멀티턴/MCP 실행, SQLite, 동시 실행, worktree diff 캡처/자동
  정리, 자동화 테스트에서 실제 claude/codex/git 실행

## Constraints

- 실제 실행 **opt-in**(`--claude`), 기본 Stub.
- analysis/design/review는 **읽기 전용**(파일 변경/위험 플래그 금지).
- worktree 격리 + 기존 승인 게이트 의미 유지.
- `~/.codex/auth.json`/Codex credential 및 **Claude Code 세션 토큰** 접근 금지.
- `danger-full-access` 금지. worker 실패는 throw 아닌 상태로.
- 런타임 의존성 추가 없음(zod/yaml). 과도한 추상화 금지.
