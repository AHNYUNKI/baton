# Test Plan

러너: Vitest. 모든 부수효과(프로세스/시계/FS)는 주입 포트로 mock,
`$BATON_HOME`는 임시 디렉터리로 격리. **실제 codex/git/네트워크 실행 금지.**

## Unit Tests

### ProcessRunner (stdin)
- `input` 전달 시 mock이 기록, node 구현은 stdin write(통합은 스모크 수준).
- `input` 미지정 시 기존 동작 동일(회귀).

### CodexExecAdapter
- 프롬프트가 stdin(`options.input`)으로 전달됨(mock runner가 input 캡처).
- argv에 프롬프트 평문이 없음(인용/길이 회피) 단언.
- 프롬프트 아티팩트 작성 또는 result.artifacts에 경로 포함.
- command/args/sandbox 구성 가능, 기본 sandbox `workspace-write`, danger 미설정.
- exitCode!==0 → success:false. timeout(모의) → success:false.
- auth 경로 문자열 부재 단언.

### codex doctor
- 미설치(runner가 throw/ENOENT 모의) → "not installed" 류 메시지 + exit 1.
- 실행 후 비정상 exit → "error" 류 메시지 + exit 1(미설치와 구분).
- 정상 → 버전 출력 + exit 0.
- credential 파일 read 없음.

### registry (CLI)
- 기본 `createDefaultWorkerRegistry()` → 모든 역할 Stub(회귀).
- `--codex` 빌더 → implementer/fixer만 CodexExecAdapter, 나머지 Stub.

## CLI / Integration Tests

- `run "<req>"`(플래그 없음): 실제 어댑터 미사용(mock으로 codex runner 호출 0회).
- `run "<req>" --codex` + 프리플라이트 성공(mock doctor ok): implement 게이트
  대기 → approve → resume 시 실제 어댑터 호출, cwd === worktreePath.
- `run "<req>" --codex` + 프리플라이트 실패(mock version 실패): 안내 출력 + exit 1,
  worktree/run 미생성(worktreeManager.createWorktree 호출 0회, RunStore 미기록).
- `run resume <runId> --codex`: 실제 어댑터 등록 동일.
- `run clean <runId>`:
  - 종료된 run → removeWorktree(worktreePath) 1회, base/main 미접근, run.json 보존.
  - 진행/대기 중 run → 거부 + 에러 + 비정상 종료.
- 알 수 없는 서브커맨드/누락 인자 → 사용법 + 비정상 종료.
- StubWorker 경고(기존) 유지.

## .gitignore

- 패턴 수정 후 `.baton/runs/<id>/` 파일이 `git check-ignore`에서 무시되지 않음을
  확인(스크립트/문서 수준). 강제 `-f` 없이 추적 가능.

## Security Regression

- grep: `auth.json|\.codex/|credential` 0, `danger-full-access` 0.
- 어댑터 cwd가 항상 worktreePath, base/main 경로가 codex runner cwd로 전달되지 않음.

## Out of Scope (테스트 비대상)

- 실제 codex 프로세스 실행, 실제 git worktree 생성/삭제, SQLite, 동시 실행,
  worktree diff 캡처, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1 + v0.2 + v0.3, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
