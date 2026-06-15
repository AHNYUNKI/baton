# Acceptance Criteria

v0.3 실제 Codex 실행 연결이 완료되려면 아래가 모두 충족되어야 한다.

## ProcessRunner (stdin)

- [ ] AC-01 `ProcessRunOptions`에 optional `input: string`이 추가되고, node 구현이
  자식 프로세스 stdin에 기록한다.
- [ ] AC-02 `input` 미지정 시 기존 동작과 동일하며 기존 ProcessRunner 테스트가
  회귀 없이 통과한다.
- [ ] AC-03 mock ProcessRunner가 전달된 `input`을 기록/검증 가능하다.

## CodexExecAdapter

- [ ] AC-04 어댑터가 프롬프트를 **stdin**으로 전달한다(argv 프롬프트 제거).
- [ ] AC-05 어댑터가 프롬프트를 run 아티팩트(예: `steps/<stepId>.prompt.md`)로
  기록하거나 `WorkerRunResult.artifacts`에 경로를 포함한다.
- [ ] AC-06 command/args/sandbox가 구성 가능하며, 기본 sandbox는 `workspace-write`,
  `danger-full-access`를 설정하지 않는다.
- [ ] AC-07 exitCode!==0 또는 timeout이면 `success:false`로 매핑된다.
- [ ] AC-08 어댑터/테스트에 auth 파일/credential 경로 접근이 없다.

## codex doctor

- [ ] AC-09 `codex` 미설치(실행 불가)와 실행 후 오류(비정상 exit)를 구분해 서로
  다른 메시지로 보고한다.
- [ ] AC-10 가용 시 버전을 보고하고 종료 코드 0, 비가용 시 안내 + 비정상 종료.
- [ ] AC-11 doctor가 어떤 credential 파일도 읽지 않는다.

## CLI run --codex (opt-in)

- [ ] AC-12 `baton run "<req>"`(플래그 없음)는 StubWorker만 사용한다(회귀 없음,
  실제 어댑터 미등록).
- [ ] AC-13 `baton run "<req>" --codex`는 `implementer`/`fixer` 역할에만 실제
  `CodexExecAdapter`를 등록하고, 그 외 역할은 Stub을 유지한다.
- [ ] AC-14 `--codex` 시 run 시작 전 프리플라이트 `codex --version`을 수행하고,
  실패하면 명확한 안내 + 비정상 종료하며 **worktree/run을 생성하지 않는다**.
- [ ] AC-15 `--codex` + 프리플라이트 성공 시 implement step은 승인 게이트 이후
  worktree 안에서 실제 어댑터로 실행된다(어댑터 호출 cwd === worktreePath).
- [ ] AC-16 `run resume <runId> --codex`도 동일하게 실제 어댑터를 등록한다.

## run clean

- [ ] AC-17 `baton run clean <runId>`가 run의 `worktreePath`를 `removeWorktree`로
  제거하고, base/main 경로/브랜치는 건드리지 않는다.
- [ ] AC-18 clean은 종료된 run(completed/failed/cancelled)에만 허용되고, 진행
  중/대기 중 run은 거부하며 명확한 에러를 낸다.
- [ ] AC-19 clean 후 run 기록(run.json)은 보존되고 cleaned 상태가 표시된다.

## Safety & Compat

- [ ] AC-20 코드/테스트에 credential 경로 접근, `danger-full-access` 설정,
  main 직접 수정 경로가 없다(보안 회귀 테스트).
- [ ] AC-21 `.gitignore`의 run 아티팩트 포함 패턴이 실제로 동작한다
  (`.baton/runs/<id>/`가 `git add`로 추적 가능, 강제 `-f` 불필요).
- [ ] AC-22 자동화 테스트는 실제 codex/git을 실행하지 않는다(전부 mock).
- [ ] AC-23 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1/v0.2 테스트
  회귀 없음, `node packages/cli/dist/main.js run --help` 스모크 정상.
