# Acceptance Criteria

v0.4 ClaudeCode 어댑터 연결이 완료되려면 아래가 모두 충족되어야 한다.

## RunExecutor metadata

- [ ] AC-01 worker 호출 metadata에 `stepType`과 `role`이 추가된다(기존 키 유지).
- [ ] AC-02 기존 CodexExecAdapter/엔진 테스트가 회귀 없이 통과한다.

## ClaudeCodeAdapter

- [ ] AC-03 어댑터가 `claude` CLI를 ProcessRunner **stdin** 프롬프트로 호출한다
  (프롬프트를 argv 평문으로 전달하지 않는다).
- [ ] AC-04 command/args/timeout이 구성 가능하며, **기본 args는 비변경(읽기 전용)**
  이고 write/edit/`danger`/full-access 류 플래그를 포함하지 않는다.
- [ ] AC-05 stepType별 출력 아티팩트를 기록한다: analyze→`analysis.md`,
  design→`design.md`, review→`review.md`. 해당 stepType이 아니면 출력 아티팩트를
  강제하지 않는다.
- [ ] AC-06 프롬프트를 아티팩트(`steps/<stepId>.prompt.md`)로 기록하거나
  `WorkerRunResult.artifacts`에 경로를 포함한다.
- [ ] AC-07 exitCode!==0/timeout/예외 → `success:false`로 매핑된다.
- [ ] AC-08 어댑터/테스트에 Codex credential 또는 Claude 세션 토큰 경로 접근이 없다.

## claude doctor

- [ ] AC-09 `checkClaude(runner)`가 미설치(throw/ENOENT)와 실행 오류(비정상 exit)를
  구분한다.
- [ ] AC-10 `baton claude doctor`가 가용 시 버전+exit 0, 비가용 시 안내+비정상 종료.
- [ ] AC-11 doctor가 어떤 credential/세션 토큰 파일도 읽지 않는다.

## Registry & CLI opt-in

- [ ] AC-12 통합 `createWorkerRegistry({codex,claude,runner})`가 implementer/fixer→
  Codex(codex 시), analyst/architect/reviewer→Claude(claude 시), 그 외 Stub을 등록한다.
- [ ] AC-13 기존 `createDefaultWorkerRegistry`(전부 Stub)/`createCodexWorkerRegistry`
  동작이 유지된다(회귀 없음).
- [ ] AC-14 `baton run "<req>"`(플래그 없음)는 실제 claude/codex를 호출하지 않는다.
- [ ] AC-15 `baton run "<req>" --claude`는 analyst/architect/reviewer만 실제
  ClaudeCodeAdapter로 등록하고, 그 외 역할은 Stub을 유지한다.
- [ ] AC-16 `--claude` 시 run 시작 전 프리플라이트 `claude --version`을 수행하고,
  실패하면 안내+비정상 종료하며 **worktree/run을 생성하지 않는다**.
- [ ] AC-17 `--codex --claude` 조합 시 구현=Codex, 분석/설계/리뷰=Claude로 역할이
  충돌 없이 등록된다.
- [ ] AC-18 `run resume <runId> --claude`(및 `--codex`)도 동일하게 실제 어댑터를
  등록한다.

## Safety & Compat

- [ ] AC-19 코드/테스트에 Codex credential, Claude 세션 토큰, `danger-full-access`,
  main 직접 수정 경로가 없다(보안 회귀 테스트).
- [ ] AC-20 어댑터 호출 cwd === worktreePath(격리), base/main 경로 미전달.
- [ ] AC-21 자동화 테스트는 실제 claude/codex/git을 실행하지 않는다(전부 mock).
- [ ] AC-22 `.gitignore` allow-list에 `claude-adapter-v0.4` 설계 run이 포함되어
  추적 가능하다.
- [ ] AC-23 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.3 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
