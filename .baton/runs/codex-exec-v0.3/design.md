# Implementation Design

## Summary

v0.2 실행 엔진에 **실제 Codex 실행을 opt-in으로 연결**한다. `ProcessRunner`에
stdin을 추가해 프롬프트를 안전하게 전달하고, `CodexExecAdapter`를 견고화한다.
CLI `--codex` 플래그가 `implementer`/`fixer`에 실제 어댑터를 등록하며(기본은
StubWorker 유지), 실행 전 `codex` 가용성을 프리플라이트로 검증한다. `run clean`
으로 worktree 수명주기를 완성하고, `.gitignore` 네거티브 패턴 버그를 고친다.
코어 엔진은 provider-agnostic으로 유지한다.

## Scope

### In Scope

- `ProcessRunner.input`(stdin) + mock
- `CodexExecAdapter`: 프롬프트 stdin 전달, 프롬프트 아티팩트, 구성 가능, 견고화
- CLI `--codex` opt-in 레지스트리(implementer/fixer만 실제), 프리플라이트 doctor
- `codex doctor` 미설치/오류 구분
- `baton run clean <runId>`(worktree 제거, 종료된 run만, 기록 보존)
- `.gitignore` run 아티팩트 포함 패턴 수정
- 단위/통합/보안 회귀 테스트(실제 codex/git은 mock)

### Out of Scope

- analysis/design용 ClaudeCode 어댑터, SQLite, 동시 실행, worktree 자동 정리,
  worktree diff 캡처, 풍부한 프롬프트 컨텍스트

## Proposed Architecture

```text
CLI run "<req>" --codex
  ├─ preflight: codexDoctor(runner)           # 실패 시 exit 1, run 미생성
  ├─ registry = createCodexWorkerRegistry()   # implementer/fixer→CodexExecAdapter, 그 외 Stub
  └─ RunExecutor.start(req)                    # (변경 없음) 게이트→approve→worktree 안 실행
        └─ worker.run({cwd: worktreePath, prompt})
              └─ CodexExecAdapter
                    ├─ write steps/<stepId>.prompt.md (아티팩트)
                    └─ runner.run("codex", ["exec","--sandbox","workspace-write"], { cwd, input: prompt, timeoutMs })

CLI run clean <runId>
  └─ load run → (종료 상태 검증) → worktreeManager.removeWorktree(run.worktreePath) → mark cleaned
```

코어 `RunExecutor`/`RunStore`는 거의 불변. 변경은 주로 어댑터/포트/CLI 레이어.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/ports/ProcessRunner.ts` | `ProcessRunOptions.input?: string`; node 구현 stdin write; mock이 input 캡처 |
| `packages/core/src/workers/codex/CodexExecAdapter.ts` | 프롬프트를 `input`(stdin)으로; argv 프롬프트 제거; 프롬프트 아티팩트(ArtifactStore 주입 또는 result.artifacts); 구성 가능 args; exit/timeout→success 견고화 |
| `packages/core/src/workers/codex/CodexExecAdapter.ts` (옵션) | `CodexExecAdapterOptions`에 args 빌더/sandbox/command, 선택적 ArtifactStore+runId |
| `packages/cli/src/registry.ts` | `createCodexWorkerRegistry()` 추가: implementer/fixer→CodexExecAdapter, 나머지 Stub. 기본 `createDefaultWorkerRegistry`(전부 Stub) 유지 |
| `packages/cli/src/commands/doctor.ts` | 미설치(ENOENT/throw) vs 비정상 exit 구분, 안내 메시지. 공용 `checkCodex(runner)` 추출해 프리플라이트 재사용 |
| `packages/cli/src/commands/run.ts` | `--codex` 파싱; 프리플라이트 `checkCodex`; 실제/기본 레지스트리 선택; `run clean <runId>` 서브커맨드; resume에도 `--codex` |
| `packages/core/src/runs/RunStore.ts` 또는 RunExecutor | clean 지원: 종료 상태 검증 + cleaned 표시(상태 필드 또는 이벤트) |
| `packages/schemas/src/run.schema.ts` (선택) | optional `cleanedAt?`/`worktreeRemoved?` 추가(필요 시) |
| `.gitignore` | `.baton/runs/` → `.baton/runs/*` + `!.baton/runs/<id>/` 동작하도록 수정 |
| `README.md` | `--codex`, 프리플라이트, `run clean`, 안전 모델 문서화 |
| `packages/*/test/*` | ProcessRunner/adapter/doctor/registry/run/clean/보안 테스트 |

## Data Model Changes

대부분 불변. 선택적으로 `Run`에 optional `cleanedAt?: string`(또는 step/run에
`worktreeRemoved?: boolean`) 추가해 clean 사실을 기록(모두 optional → 하위호환).
`ProcessRunOptions`에 `input?: string` 추가(런타임 데이터 아님, 타입만).

## API / CLI Changes

```bash
baton run "<request>"                 # (회귀) StubWorker
baton run "<request>" --codex         # implementer/fixer 실제 Codex, 프리플라이트 후
baton run "<request>" --dry-run       # (회귀) 계획만
baton run status <runId>
baton run resume <runId> [--codex]
baton run approve <runId> [--reject]
baton run clean <runId>               # 종료된 run의 worktree 제거(기록 보존)
baton codex doctor                    # 미설치/오류/가용 구분
```

신규 core 공개 API: `CodexExecAdapter`(stdin/아티팩트), `ProcessRunner.input`.
신규 CLI 헬퍼: `createCodexWorkerRegistry()`, `checkCodex(runner)`.

## Workflow Changes

엔진 실행 흐름은 불변. 변화는 (1) 어댑터가 실제 codex를 stdin 프롬프트로 호출,
(2) CLI가 실제 실행을 opt-in으로 주입 + 프리플라이트, (3) clean으로 worktree
수명주기 종료. 승인 게이트·격리·재개 의미는 v0.2 그대로.

## Error Handling

- 프리플라이트 실패 → 안내(설치 방법 힌트) + exit 1, run/worktree 미생성.
- codex 실행 실패/timeout → `success:false` → 엔진이 step `failed`/run `failed`로.
- clean: 진행/대기 중 run 거부(명확한 에러); worktreePath 없음/이미 제거 → 멱등
  메시지. removeWorktree 실패 → 에러 보고(run 기록 보존).
- stdin write 실패 → ProcessRunner가 결과/에러로 표면화, throw로 흐름 제어 금지.

## Security Considerations

- 실제 실행 opt-in(`--codex`)만. 기본 Stub(무해).
- sandbox `workspace-write` 고정 기본, `danger-full-access` 금지.
- 어댑터 cwd는 항상 worktreePath. base/main 경로/브랜치 미접근.
- `codex`/`git` 공식 CLI만 호출. `~/.codex/auth.json`/credential 무접근(grep 회귀).
- clean은 run worktree 경로만 제거, base/main 워킹트리 보호.

## Test Plan

`test-plan.md` 참조. 요지: stdin 전달/argv 평문 부재, 미설치 vs 오류 구분,
플래그 없으면 codex 호출 0회, 프리플라이트 실패 시 worktree 0회, `--codex` 시
implementer/fixer만 실제, clean 경로/거부, 보안 grep, 실제 codex/git 미실행.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-23 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-201 → task-208 의존성 순서를 따른다.
- v0.1/v0.2 공개 동작과 테스트를 깨지 말 것(특히 기본 StubWorker, dry-run, 게이트).
- 실제 codex/git을 강제 실행하는 자동화 테스트를 만들지 말 것(mock만).
- codex CLI 인터페이스는 가정이므로 어댑터를 구성 가능하게 두고 doctor로 검증.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- ClaudeCode 어댑터, SQLite, 동시 실행, worktree 자동 정리, diff 캡처.

## Review Checklist

- [ ] 플래그 없으면 실제 codex 호출 0회(기본 Stub 회귀).
- [ ] `--codex`는 implementer/fixer만 실제, 프리플라이트 실패 시 worktree/run 0.
- [ ] 어댑터 프롬프트 stdin 전달, argv 평문 부재, 아티팩트 기록.
- [ ] sandbox workspace-write, danger 금지, cwd==worktreePath, auth 무접근.
- [ ] doctor 미설치/오류 구분. clean은 종료 run만, base/main 보호.
- [ ] `.gitignore` 패턴 동작(강제 -f 불필요). v0.1/v0.2 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### Goal

Baton v0.3: **실제 Codex 실행을 안전하게 연결**한다. `implement`/`fix` 역할을
실제 `CodexExecAdapter`로 디스패치하되 (1) `--codex` opt-in, (2) 실행 전 프리플라이트
`codex` 가용성 점검, (3) 기존 승인 게이트 + worktree 격리 + `workspace-write`
sandbox 안에서만 실행, (4) `run clean`으로 worktree 정리. 코어 엔진은
provider-agnostic으로 유지하고, 자동화 테스트는 실제 codex/git을 실행하지 않는다.

성공 기준은 "실제 실행"이 아니라 **안전하게 실제 실행 + 회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/codex-exec-v0.3/design.md`
3. `.baton/runs/codex-exec-v0.3/tasks.json`
4. `.baton/runs/codex-exec-v0.3/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1/v0.2 코드 컨벤션
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Modify

- `packages/core/src/ports/ProcessRunner.ts` — `ProcessRunOptions.input?: string`,
  node 구현 stdin write, mock이 input 캡처
- `packages/core/src/workers/codex/CodexExecAdapter.ts` — 프롬프트 stdin 전달
  (argv 프롬프트 제거), 프롬프트 아티팩트(`steps/<stepId>.prompt.md` 또는
  result.artifacts), 구성 가능 command/args/sandbox, exit/timeout→success
- `packages/cli/src/registry.ts` — `createCodexWorkerRegistry()`(implementer/fixer→
  CodexExecAdapter, 그 외 Stub). 기존 `createDefaultWorkerRegistry`(전부 Stub) 유지
- `packages/cli/src/commands/doctor.ts` — 미설치 vs 오류 구분 + 공용
  `checkCodex(runner)` 추출
- `packages/cli/src/commands/run.ts` — `--codex` 파싱, 프리플라이트, 레지스트리
  선택, `run clean <runId>`, resume `--codex`
- `packages/core/src/runs/RunStore.ts` 또는 `RunExecutor.ts` — clean 지원(종료 상태
  검증 + cleaned 표시)
- `packages/schemas/src/run.schema.ts` — (필요 시) optional `cleanedAt?`
- `.gitignore` — `.baton/runs/*` + `!.baton/runs/<id>/`로 수정(강제 -f 불필요)
- `README.md` — `--codex`/프리플라이트/`run clean`/안전 모델 문서화
- 테스트: `packages/core/test/{processRunner,codexExecAdapter}.test.ts`,
  `packages/cli/test/cli.test.ts`(doctor/run/clean), 보안 회귀

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- analysis/design용 ClaudeCode 어댑터 생성 금지(이번 범위 아님).
- 실제 codex/git을 실행하는 자동화 테스트 작성 금지(mock만).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/codex-exec-v0.3/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `ProcessRunner.input`(stdin) 추가 + node 구현 + mock 캡처 + 회귀 테스트. (task-201)
3. `CodexExecAdapter`: 프롬프트 stdin 전달, argv 평문 제거, 프롬프트 아티팩트,
   구성 가능 args, exit/timeout→success, auth 무접근 + 테스트. (task-202)
4. `codex doctor` 미설치/오류 구분 + `checkCodex(runner)` 추출 + 테스트. (task-203)
5. `createCodexWorkerRegistry()`(implementer/fixer만 실제) + 기본 Stub 유지 + 테스트. (task-204)
6. CLI `run --codex`: 프리플라이트(checkCodex) → 실패 시 exit 1·worktree/run 미생성,
   성공 시 실제 레지스트리 주입. resume `--codex`. 플래그 없으면 기본 Stub 회귀 +
   테스트. (task-205)
7. `run clean <runId>`: 종료 run만, `removeWorktree(worktreePath)`, base/main 보호,
   기록 보존 + cleaned 표시 + 테스트. (task-206)
8. `.gitignore` 패턴 수정(추적 가능, -f 불필요) + README 갱신 + 보안 회귀 테스트. (task-207)
9. 전체 게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-208)

### Test Commands

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
node packages/cli/dist/main.js run --help
```

명령 미실행/실패는 성공으로 위장하지 말고 그대로 보고.

### Acceptance Criteria

`.baton/runs/codex-exec-v0.3/acceptance-criteria.md`의 AC-01 ~ AC-23 전부 충족.
특히: 플래그 없으면 codex 호출 0회(AC-12), 프리플라이트 실패 시 worktree 0회
(AC-14), 프롬프트 stdin 전달(AC-04), cwd==worktreePath(AC-15), clean 종료 run만
(AC-18), `.gitignore` 동작(AC-21), auth 무접근(AC-08/11/20).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 실제 실행 opt-in(`--codex`), 기본 Stub. sandbox `workspace-write`, danger 금지.
- 어댑터 cwd=worktreePath, base/main 미접근, credential 무접근.
- worker 실패/timeout은 success:false 상태로(throw 금지).
- 코어 엔진 provider-agnostic 유지(실제 어댑터 주입은 CLI 레이어).
- 작업은 새 브랜치/worktree에서. **commit/push 하지 말 것**(명시 요청 전까지).

### Expected Final Summary Format

```md
## Summary
- 무엇이 / 왜 바뀌었는지

## Changed Files
| File | Change |
|---|---|

## Commands Run
| Command | Result |
|---|---|

## Tests
- Passing:
- Failing:
- Not run:

## Risks / TODOs
- ClaudeCode 어댑터, SQLite, worktree diff 캡처/자동 정리 등 남은 항목

## Notes for Reviewer
- 기본 Stub 회귀, 프리플라이트 무생성, stdin 프롬프트, cwd 격리, clean 안전,
  gitignore 동작을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
