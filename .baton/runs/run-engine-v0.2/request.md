# Request

## Run

- runId: `run-engine-v0.2`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `bootstrap-v0.1` (merged via PR #1)

## User Request

Baton v0.2: **Run 실행 엔진**을 설계한다. v0.1은 `run --dry-run` 계획까지만
지원한다(`RunService.createRun`은 non-dry-run에서 throw). v0.2는 실제로 run을
실행한다:

1. `GitWorktreeManager`로 worktree 격리를 만든다.
2. 워크플로우 step을 순서대로 실행한다.
3. 각 step을 역할(role)에 맞는 `WorkerAdapter`로 디스패치한다.
4. `implement`/`fix` 같은 위험 step 전에 **사람 승인 게이트**를 둔다.
5. step별 아티팩트/로그/이벤트를 기록한다.
6. 실행 상태를 영속화해 **재개(resume) 가능**하게 한다.

## Scope (v0.2)

- `RunExecutor`: start / resume / decide(승인 기록), 순차 step 실행
- worktree 격리(실제 git worktree 생성, mutating step은 worktree 안에서만)
- `WorkerRegistry`(role → adapter), `ApprovalPolicy`(승인 필요 step 타입)
- `RunStore`: run 상태 파일 영속화(run.json), 재개 지원
- step별 stdout/stderr 로그, 결과 아티팩트, 라이프사이클 이벤트 기록
- 스키마 확장(상태/타임스탬프/worktreePath/승인 결정)
- CLI: `run <request>`(실행), `run status <runId>`, `run resume <runId>`,
  `run approve <runId> [--reject]` (기존 `--dry-run` 유지)
- 모든 경로 단위/통합 테스트

## Out of Scope

- **실제 Codex CLI 실행 연결**(별도 후속). v0.2 엔진은 provider-agnostic하며,
  CLI 기본 레지스트리는 worker 미연결 역할에 `StubWorker`를 사용해 엔진을
  end-to-end로 검증한다. 자동화 테스트는 worker를 mock 한다.
- SQLite 영속화(파일 기반 유지, 별도 후속).
- 동시 실행(순차만), 워크트리 자동 정리.

## Constraints

- worktree 격리 필수, main 직접 수정 금지, base 브랜치는 읽기 전용.
- `~/.codex/auth.json`/credential 접근 금지, `danger-full-access` 기본값 금지.
- 모든 외부 I/O(프로세스/시계/FS)는 주입 포트 뒤, 테스트에서 mock.
- worker 실패는 엔진 경계를 넘어 throw 하지 않고 run/step 상태로 표현.
- 과도한 추상화 금지, 작은 증분.
