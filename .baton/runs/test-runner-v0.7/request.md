# Request

## Run

- runId: `test-runner-v0.7`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `run-history-v0.6` (PR #6, merged → main `43c586a`)

## User Request

Baton 파이프라인(`analyze → design → implement → test → review`)에서 아직 비어
있는 **Test 단계**를 채운다. 기본 워크플로우에 `test` step(역할 `tester`)이 있으나
현재 `tester`는 StubWorker라 실제 테스트를 돌리지 않는다. v0.7은 implement 이후
**프로젝트 테스트를 worktree에서 실제로 실행**하고 결과를 `test_result.md`로 남기는
`TestRunnerAdapter`를 연결한다. v0.3(Codex)/v0.4(Claude)와 동일한 어댑터 패턴.

## Scope (v0.7)

- `TestRunnerAdapter`(core, WorkerAdapter): 구성된 테스트 명령을 worktree(cwd)에서
  ProcessRunner로 실행, stdout/stderr/exit 캡처 → success 매핑, timeout 지원
- stepType `test` → `test_result.md` 산출물 기록(명령/exit/요약 + 로그)
- 테스트 명령 해석: `.baton` config(`test.command`) 또는 `--test-command` 플래그
- 레지스트리 확장: `--test` opt-in 시 `tester` 역할만 TestRunnerAdapter, 명령 미설정
  시 경고 + tester는 Stub 유지
- CLI `--test`/`--test-command` 플래그(run/resume/approve), `--codex`/`--claude`와 조합
- 단위/통합/안전 테스트(실제 테스트 명령은 mock)

## Out of Scope

- 테스트 프레임워크 자동 감지, 테스트 출력의 구조화 파싱(pass/fail 카운트), 재시도,
  병렬 실행, fix 루프 자동화, SQLite

## Constraints

- 실제 실행 **opt-in**(`--test`), 기본 Stub. 테스트는 worktree 격리 안에서만.
- 테스트 실패(exit≠0)는 step `failed`로(throw 금지) — 의도된 동작.
- 셸 문자열 결합 금지(명령+인자 배열). `danger-full-access` 무관.
- credential/세션 토큰 무접근(기존 안전 유지).
- 런타임 의존성 추가 없음(zod/yaml). base = `origin/main`(v0.1~v0.6).
