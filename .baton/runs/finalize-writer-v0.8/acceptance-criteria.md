# Acceptance Criteria

v0.8 Finalize 단계가 완료되려면 아래가 모두 충족되어야 한다.

## FinalizeWriter

- [ ] AC-01 `FinalizeWriter`(WorkerAdapter)가 `metadata.runDirectory`에서 run.json을
  읽어 run 상태(요청/워크플로우/steps/outcome)를 파악한다.
- [ ] AC-02 `final_summary.md`를 생성한다: 요청, 워크플로우, step 상태 표, 테스트 결과
  요약(test_result.md 있으면), 아티팩트 목록, 최종 outcome.
- [ ] AC-03 `pr_description.md`를 생성한다: 제목(요청 기반 1줄, 정규화), 요약,
  step 개요, 테스트 상태, 아티팩트 포인터.
- [ ] AC-04 두 파일은 `WorkerRunResult.artifacts`에 경로가 포함되고, run 디렉터리에
  쓰여진다(저장소/worktree 미수정).
- [ ] AC-05 누락 아티팩트(analysis/design/test_result/review 부재)는 있는 것만 반영하고
  부재는 우아하게 표기한다(렌더 실패 없음).
- [ ] AC-06 결정적·멱등: 동일 run 디렉터리 입력 → 동일 출력(Clock/random 미사용).
- [ ] AC-07 IO 오류는 `success:false` + 메시지로 반환(throw 없음). 정상 시 success:true.
- [ ] AC-08 모든 출력 경로가 run 디렉터리 하위로 강제되고 삭제 연산이 없다.

## Registry — default on

- [ ] AC-09 `release_writer` 역할이 모든 레지스트리 변형(default/codex/claude/test/
  조합)에서 `FinalizeWriter`로 등록된다(더 이상 Stub 아님, opt-in 플래그 불필요).
- [ ] AC-10 다른 역할(implementer/analyst/tester 등)의 기존 매핑(codex/claude/test/
  stub)은 변경되지 않는다.

## Pipeline behavior

- [ ] AC-11 finalize step 실행 시 FinalizeWriter 호출 cwd는 worktreePath이며
  (격리), 산출물은 run 디렉터리에 생성된다.
- [ ] AC-12 `baton run`(플래그 무관)으로 성공 경로 완주 시 `final_summary.md`/
  `pr_description.md`가 생성된다.

## Safety & Compat

- [ ] AC-13 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`,
  run 디렉터리 밖 쓰기가 없다(보안/경로 회귀 테스트).
- [ ] AC-14 자동화 테스트는 임시 run 디렉터리만 사용(실제 워커/git/네트워크 없음).
- [ ] AC-15 release_writer를 Stub로 단언하던 기존 테스트가 있으면 의도적으로
  갱신되며, 그 외 v0.1~v0.7 동작은 회귀가 없다.
- [ ] AC-16 `pnpm typecheck && pnpm test && pnpm build` 통과,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
