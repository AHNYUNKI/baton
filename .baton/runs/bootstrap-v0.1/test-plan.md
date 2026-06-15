# Test Plan

테스트 러너: **Vitest**. 네트워크/실제 프로세스/실제 Codex 로그인 의존 금지.
모든 부수효과는 주입 포트(`ProcessRunner`, `Clock`, `DbClient`)를 mock 하여 검증한다.
파일시스템 테스트는 OS 임시 디렉터리(`$BATON_HOME` 오버라이드)로 격리한다.

## Unit Tests

### `@baton/schemas`
- 각 스키마(project, agentProfile, workflow, run, artifact, approval):
  - 유효 입력 → parse 성공, 추론 타입 일치.
  - 무효 입력(필수 누락, 잘못된 enum) → `safeParse` 실패 + 이슈 경로 확인.

### `@baton/core` — config/paths
- `$BATON_HOME` 설정 시 해당 경로, 미설정 시 기본 홈 경로 해석.
- 프로젝트 워크스페이스 `.baton/` 경로 및 run 디렉터리 경로 조합.

### `@baton/core` — ArtifactStore
- run 디렉터리 생성(중첩 logs/ 포함).
- artifact write 후 read 라운드트립.
- 동일 경로 재쓰기 시 덮어쓰기 동작.

### `@baton/core` — db (skeleton)
- `openDatabase(path)`가 인터페이스를 만족하는 객체 반환.
- DDL 상수에 `projects, agent_profiles, workflows, runs, run_steps, artifacts,
  events, approvals` 테이블 정의가 포함.
- 실제 드라이버 없이도 import/초기화가 throw 하지 않음(skeleton 계약).

### `@baton/core` — EventLogger
- 주입 `Clock`으로 결정적 타임스탬프 → JSONL 한 줄 append.
- 다중 이벤트 순서 보존.

### `@baton/core` — ProjectService
- add: 존재하는 경로 등록 → 레지스트리 JSON에 반영.
- add: 존재하지 않는 경로 → 명확한 에러.
- add: 중복 경로 → 멱등 또는 명확한 처리(중복 미생성).
- list: 등록 항목 반환, 빈 상태 처리.

### `@baton/core` — agent/workflow YAML loader
- 유효 YAML → parse + Zod 검증 통과, 타입드 객체.
- 스키마 위반 YAML → 명확한 검증 에러(silent 실패 없음).
- 잘못된 YAML 문법 → 파싱 에러 표면화.
- 번들 `examples/`와 로컬 `.baton/agents|workflows` 병합 로딩.

### `@baton/core` — GitWorktreeManager (skeleton)
- `createWorktree`가 mock ProcessRunner에 `git worktree add <path> -b
  baton/<runId> <base>` 형태의 인자를 전달(문자열 결합이 아닌 인자 배열).
- main/base 브랜치를 직접 수정하는 호출이 없음.
- 실제 git 실행 없음(ProcessRunner mock).

### `@baton/core` — CodexExecAdapter (skeleton)
- `run(input)`가 mock ProcessRunner를 통해 stdout/stderr/exitCode/durationMs를
  `WorkerRunResult`로 캡처.
- timeout 옵션 전달 검증.
- 코드/테스트 어디에도 auth 파일 접근 없음(경로 문자열 부재 단언).

### `@baton/core` — RunService
- `createRun(req, { dryRun: true })`:
  - runId 생성, `request.md` + `run.json`(status `planned`) 기록.
  - WorkerAdapter mock 호출 0회, WorktreeManager mock 호출 0회 단언.
  - 계획된 step 목록 반환.

## CLI Tests (`@baton/cli`)

명령 핸들러는 core 서비스를 주입/mock 하여 I/O 경계만 검증(얇은 CLI 원칙).
- `init`: `.baton/` 생성, 재실행 멱등.
- `project add/list`: 서비스 호출 + 출력 포맷.
- `agent list` / `workflow list`: 로더 결과 출력.
- `run --dry-run`: 계획 step 출력 + 부수효과 없음.
- `codex doctor`: 가용/비가용 두 경우 출력(mock ProcessRunner).
- 알 수 없는 명령/누락 인자 → 사용법 + 비정상 종료 코드.

## Integration / Smoke

- 빌드 산출물(`tsc -b`) 후 `node packages/cli/dist/main.js --help`가
  모듈 해상도 오류 없이 실행(ESM `.js` 확장자 회귀 방지).
- `init → run --dry-run` 시퀀스를 임시 디렉터리에서 수행해 `.baton/runs/<id>/`에
  기대 아티팩트가 생성됨을 확인.

## Out of Scope (v0.1 테스트 비대상)

- 실제 Codex 프로세스 실행 / 로그인.
- 실제 git worktree 생성/삭제.
- 실제 SQLite 드라이버 쿼리.
- 네트워크 호출.

## Gates

```bash
pnpm typecheck   # tsc -b --noEmit (strict)
pnpm test        # vitest run
pnpm build       # tsc -b
```

(ESLint는 v0.1 게이트에서 제외 — 후속 작업. 누락 명령은 성공으로 위장하지 말고
"미실행"으로 보고.)
