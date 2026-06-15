# Test Plan

러너: Vitest. 모든 부수효과(프로세스/시계/FS/worker)는 주입 포트로 mock,
`$BATON_HOME`는 임시 디렉터리로 격리. 실제 git/codex/네트워크 의존 금지.

## Unit Tests

### schemas (run/approval)
- `RunStatus`에 `awaiting-approval` 포함, 기존 값 유지.
- `RunStepStatus` enum 유효/무효 입력.
- 신규 optional 필드 있는/없는 run.json 모두 parse(하위호환).
- Approval `approved`/`rejected` + `decidedAt` parse.

### RunStore
- save → 동일 runId load 라운드트립, 깊은 동등.
- save 원자성: 쓰기 중 실패 시 기존 파일 보존(임시→rename 경로 검증).
- load: 없는 runId → 명확한 에러. 손상 JSON → Zod 에러.

### WorkerRegistry / ApprovalPolicy / StubWorker
- registry.resolve(role): 등록 시 adapter, 미등록 시 undefined.
- policy.requiresApproval(stepType): 기본 `['implement','fix']` true, 그 외 false.
- StubWorker.run: success=true, 결과/메타에 `stub:true`와 명시 메시지.

### RunExecutor — happy path
- mock worker(success) 등록된 워크플로우 실행 → 모든 step `completed`,
  run `completed`. step별 로그/아티팩트 작성, `step.started`/`completed` 이벤트.
- mutating step worker 호출 시 `input.cwd === run.worktreePath` 단언.
- worktreeManager.createWorktree가 정확히 1회, 브랜치 `baton/<runId>` 인자.

### RunExecutor — failure
- worker success=false → step `failed`, run `failed`, 잔여 step `skipped`,
  throw 없음. 상태 영속화됨.
- 미등록 역할 step → `skipped`(reason), 다음 step 진행.

### RunExecutor — approval gate
- `approve` 타입 step 도달 → run `awaiting-approval`, 다운스트림 worker 호출 0회,
  pending Approval 기록.
- `implement` step(정책 게이트) 미승인 도달 → 동일하게 멈춤, worker 호출 0회 (AC-25).
- decide(approved) 후 resume → 게이트 통과, 이후 step 실행, run 진행.
- decide(rejected) → run `cancelled`, 잔여 `skipped`.

### RunExecutor — resume
- 중간까지 진행된 영속 상태에서 resume → 첫 비종료 step부터. 이미 `completed`
  step의 worker **재호출 0회** 단언 (AC-18, R9).
- 게이트 대기 상태 load 후 decide+resume 시퀀스 종료 상태 확인.

## CLI Tests

- `run "<req>"`(실행): mock registry 주입 → 상태/아티팩트 출력, 종료 코드 0.
- `run --dry-run`: 기존 계획 출력 회귀 없음.
- `run status <runId>`: RunStore load 후 step 표 출력.
- `run resume <runId>`: executor.resume 호출 + 출력.
- `run approve <runId>` / `--reject`: decide(+resume) 경로, 출력.
- StubWorker 사용 시 스텁 경고 출력 (AC-27).
- 알 수 없는 서브커맨드/누락 인자 → 사용법 + 비정상 종료.

## Integration / Smoke

- 임시 $BATON_HOME에서 `start → (gate) → approve → resume → completed`
  시퀀스를 mock worker/worktree로 수행, `.baton/runs/<runId>/`에 run.json,
  request.md, logs/, step 아티팩트, events.jsonl 생성 확인.
- 빌드 산출물 `node packages/cli/dist/main.js run --help` 스모크.

## Security Regression

- grep: `auth.json|\.codex|credential` 매치 0, `danger-full-access` 매치 0.
- 엔진이 base/main 경로를 worker cwd로 전달하는 경로 부재 단언.

## Out of Scope (테스트 비대상)

- 실제 git worktree 생성/삭제, 실제 Codex 실행, SQLite, 동시 실행, 네트워크.

## Gates

```bash
pnpm typecheck
pnpm test          # 기존 v0.1 + 신규 v0.2, 회귀 없음
pnpm build
node packages/cli/dist/main.js run --help
```
