# Request

## Run

- runId: `codex-exec-v0.3`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `run-engine-v0.2` (PR #2)

## User Request

Baton v0.3: **실제 Codex 실행을 안전하게 연결**한다. v0.2 Run 실행 엔진은
worktree 격리·승인 게이트·재개를 갖췄으나, CLI 기본 레지스트리가 모든 역할에
`StubWorker`를 등록해 실제 작업은 하지 않는다. v0.3은 `implement`/`fix` 역할을
**실제 `CodexExecAdapter`로 연결**하되, opt-in + 승인 게이트 + worktree 격리 +
프리플라이트 점검으로 안전하게 만든다.

## Scope (v0.3)

- `ProcessRunner`에 stdin(`input`) 지원 추가 → 프롬프트를 argv가 아닌 stdin으로
  전달(인자 길이/인용 문제 회피)
- `CodexExecAdapter`: 프롬프트 stdin 전달, 프롬프트 아티팩트 기록, command/args
  구성 가능, exit/timeout → success 매핑 견고화
- CLI `--codex` opt-in 플래그: `run`/`resume` 시 `implementer`/`fixer`에 실제
  어댑터 등록(미지정 시 기본 StubWorker 유지)
- 실제 Codex 선택 시 **프리플라이트 `codex doctor`**: 미가용이면 worktree/run
  생성 전에 명확히 실패
- `codex doctor` 견고화: 미설치 vs 오류 구분, 안내 메시지(여전히 auth 무접근)
- `baton run clean <runId>`: run의 worktree 제거(기본 보존, 명시적 정리)
- `.gitignore`의 `!.baton/runs/<id>/` 네거티브 패턴 버그 수정
- 모든 경로 단위/통합 테스트(실제 codex는 mock)

## Out of Scope

- analysis/design 역할용 ClaudeCode 어댑터(여전히 Stub/external)
- SQLite 영속화, 동시 실행, worktree 자동 정리, 풍부한 프롬프트 컨텍스트
- 자동화 테스트에서 실제 codex/git 실행

## Constraints

- 실제 Codex 실행은 **opt-in**(`--codex`)이며 기본값은 Stub(안전).
- 실행은 항상 승인 게이트(implement/fix) 이후 + worktree 격리 안에서.
- sandbox 기본 `workspace-write`, `danger-full-access` 금지.
- `~/.codex/auth.json`/credential 접근 금지.
- worker 실패는 throw 아닌 상태로(엔진 계약 유지).
- 런타임 의존성 추가 없음(zod/yaml). 과도한 추상화 금지.
