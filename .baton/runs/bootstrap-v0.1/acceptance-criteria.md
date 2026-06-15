# Acceptance Criteria

v0.1 부트스트랩이 완료되려면 아래가 모두 충족되어야 한다.

## Build & Tooling

- [ ] AC-01 `pnpm-workspace.yaml`에 `packages/*`가 정의되고, 3개 패키지
  (`@baton/schemas`, `@baton/core`, `@baton/cli`)가 인식된다.
- [ ] AC-02 `pnpm build`(= `tsc -b`)가 schemas→core→cli 순서로 오류 없이 빌드된다.
- [ ] AC-03 `pnpm typecheck`가 strict 모드에서 통과한다(`any` 무근거 사용 없음).
- [ ] AC-04 `pnpm test`(Vitest)가 모든 패키지에서 통과한다.
- [ ] AC-05 모든 상대 임포트는 `.js` 확장자를 사용하며, 빌드 산출물 실행 시
  모듈 해상도 오류가 없다.

## Schemas (`@baton/schemas`)

- [ ] AC-06 `project`, `agentProfile`, `workflow`, `run`, `artifact`, `approval`
  Zod 스키마와 추론 타입이 export 된다.
- [ ] AC-07 각 스키마에 대해 유효/무효 입력 검증 단위 테스트가 존재한다.

## Core (`@baton/core`)

- [ ] AC-08 `.baton` 경로 해석 유틸이 존재하고, `$BATON_HOME` 오버라이드를 지원한다.
- [ ] AC-09 `ArtifactStore`가 run 디렉터리를 생성하고 artifact 파일을 쓰고 읽는다.
- [ ] AC-10 `DbClient` 인터페이스 + DDL 상수 + 스킬레톤 `openDatabase()`가 존재한다
  (실제 네이티브 드라이버 미연결, 테스트는 mock/skeleton).
- [ ] AC-11 `EventLogger` 골격이 주입된 `Clock`으로 JSONL 이벤트를 append 한다.
- [ ] AC-12 `ProjectService`가 레지스트리(JSON)에 프로젝트를 add/list 하며,
  존재하지 않는 경로 추가 시 명확한 에러를 던진다.
- [ ] AC-13 agent/workflow YAML 로더가 `yaml.parse` 후 Zod로 검증하고,
  검증 실패 시 명확한 에러를 던진다.
- [ ] AC-14 `GitWorktreeManager` 인터페이스 + 주입형 `ProcessRunner` 기반
  skeleton이 존재한다. v0.1 dry-run 경로에서는 호출되지 않는다.
- [ ] AC-15 `CodexExecAdapter`가 `WorkerRunInput → WorkerRunResult` 인터페이스를
  구현하고, ProcessRunner를 mock 한 단위 테스트가 stdout/stderr/exitCode/duration
  캡처를 검증한다. 실제 Codex 로그인에 의존하지 않는다.
- [ ] AC-16 `RunService.createRun(..., { dryRun: true })`가 runId를 만들고
  `.baton/runs/<runId>/request.md` + `run.json`(status: `planned`)을 기록하며,
  WorkerAdapter/WorktreeManager를 **호출하지 않는다**(mock 호출 0회로 단언).

## CLI (`@baton/cli`)

- [ ] AC-17 `baton init`이 cwd에 `.baton/`(config.json, runs/)를 생성하고
  idempotent 하다(재실행 시 파괴적이지 않음).
- [ ] AC-18 `baton project add <path>` / `baton project list`가 동작한다.
- [ ] AC-19 `baton agent list` / `baton workflow list`가 번들 예제를 로드해 출력한다.
- [ ] AC-20 `baton run "<request>" --dry-run`이 계획된 workflow step을 출력하고
  run 아티팩트를 남기되 worker/worktree를 실행하지 않는다.
- [ ] AC-21 `baton codex doctor`가 `codex` 가용성/버전을 보고하며, 어떤 credential
  파일도 읽지 않는다.
- [ ] AC-22 알 수 없는 명령/누락 인자에 대해 사용법과 0이 아닌 종료 코드를 반환한다.

## Safety

- [ ] AC-23 코드 어디에도 `~/.codex/auth.json` 또는 credential 경로 접근이 없다.
- [ ] AC-24 `danger-full-access`가 기본값으로 설정되지 않는다.
- [ ] AC-25 worktree 경로/브랜치는 항상 `baton/<runId>` 패턴이며 main 직접 수정
  경로가 없다.
- [ ] AC-26 push/deploy/패키지 설치를 수행하는 코드 경로가 없다.

## Examples & Docs

- [ ] AC-27 `examples/agents/*.yaml`(analyst, architect, implementer 최소)와
  `examples/workflows/default.workflow.yaml`이 존재하고 로더 검증을 통과한다.
- [ ] AC-28 루트 `README.md`(또는 `docs/`)에 명령 사용법과 v0.1 비목표/후속 TODO
  (ESLint, 실제 SQLite 드라이버, 실제 Codex 실행 연결)가 기록된다.
