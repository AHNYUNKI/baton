# Test Plan

러너: Vitest. 모든 부수효과(프로세스/시계/FS)는 주입 포트로 mock,
`$BATON_HOME`는 임시 디렉터리로 격리. **실제 claude/codex/git/네트워크 실행 금지.**

## Unit Tests

### RunExecutor metadata
- worker 호출 metadata에 `stepType`/`role` 포함(기존 runId/stepId/runDirectory 유지).
- 기존 실행/게이트/resume 테스트 회귀 없음.

### ClaudeCodeAdapter
- 프롬프트가 stdin(`options.input`)으로 전달, argv에 프롬프트 평문 부재 단언.
- 기본 args에 write/edit/`danger`/full-access 플래그 부재 단언(읽기 전용).
- stepType=analyze → `analysis.md`, design → `design.md`, review → `review.md`
  아티팩트 작성(mock으로 stdout 주입 후 파일 확인).
- 비대상 stepType → 출력 아티팩트 강제 안 함(로그/프롬프트만).
- 프롬프트 아티팩트(`steps/<stepId>.prompt.md`) 작성 또는 artifacts 포함.
- exit!==0 → success:false. 예외/timeout → success:false.
- Codex credential/Claude 세션 토큰 경로 문자열 부재 단언.

### checkClaude / claude doctor
- 미설치(runner throw/ENOENT) → reason 'not-installed' + 안내 + exit 1.
- 실행 후 비정상 exit → reason 'error'(미설치와 구분) + exit 1.
- 정상 → 버전 + exit 0.
- credential/세션 토큰 read 없음.

### registry
- `createWorkerRegistry({})` → 전부 Stub.
- `{codex:true}` → implementer/fixer Codex, 그 외 Stub.
- `{claude:true}` → analyst/architect/reviewer Claude, 그 외 Stub.
- `{codex:true,claude:true}` → 역할 분리 등록(충돌 없음).
- 기존 `createDefaultWorkerRegistry`/`createCodexWorkerRegistry` 회귀.

## CLI / Integration Tests

- `run "<req>"`(플래그 없음): 실제 claude/codex 호출 0회(mock runner 호출 검증).
- `run "<req>" --claude` + 프리플라이트 성공(mock version ok): analyze/design step이
  ClaudeCodeAdapter로 실행, cwd === worktreePath, `analysis.md`/`design.md` 생성.
- `run "<req>" --claude` + 프리플라이트 실패: 안내 + exit 1, worktree/run 미생성
  (createWorktree 0회, `.baton/runs` 미생성).
- `run "<req>" --codex --claude`: 분석/설계=Claude, 구현=Codex 등록(implement는
  승인 게이트 후).
- `run resume <runId> --claude` / `--codex`: 실제 어댑터 등록 동일.
- `claude doctor`: 미설치/오류/가용 3경로.
- 알 수 없는 서브커맨드/누락 인자 → 사용법 + 비정상 종료.

## Security Regression

- grep: `auth\.json|\.codex/|credential` 0, `danger-full-access` 0, Claude 세션
  토큰/`\.claude.*token`류 0.
- 어댑터 기본 args에 write/danger 플래그 부재, cwd가 base/main 아님.

## Out of Scope (테스트 비대상)

- 실제 claude/codex 프로세스 실행, 실제 git worktree, SQLite, 동시 실행, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.3 + v0.4, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
