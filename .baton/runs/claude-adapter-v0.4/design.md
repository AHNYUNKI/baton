# Implementation Design

## Summary

v0.3(실제 Codex) 위에 **ClaudeCodeAdapter**를 연결해 analysis/design/review 역할을
실제 Claude로 실행한다. CodexExecAdapter 패턴(configurable + stdin + 아티팩트)을
그대로 적용하되 **읽기 전용(비변경)** 으로 동작하고, stepType별 산출물
(analysis.md/design.md/review.md)을 기록한다. CLI `--claude` opt-in(+ `--codex`와
조합)과 `claude --version` 프리플라이트로 안전을 보장하고, 레지스트리를
`createWorkerRegistry({codex,claude})`로 통합한다. 코어 엔진은 provider-agnostic.

## Scope

### In Scope

- `RunExecutor` worker metadata에 `stepType`/`role` 추가
- `ClaudeCodeAdapter`: 읽기 전용 claude 호출, stdin 프롬프트, stepType별 출력
  아티팩트, 프롬프트 아티팩트, exit→success
- `checkClaude` + `baton claude doctor`(미설치/오류 구분)
- 통합 `createWorkerRegistry({codex,claude,runner})` + 기존 함수 위임 유지
- CLI `--claude` opt-in + 프리플라이트 + `--codex`와 조합 + resume
- 단위/통합/보안 회귀 테스트(mock)

### Out of Scope

- 실제 Claude 대화형/멀티턴/MCP, SQLite, 동시 실행, worktree diff 캡처/자동 정리

## Proposed Architecture

```text
CLI run "<req>" --claude [--codex]
  ├─ preflight: checkClaude (and checkCodex if --codex)   # 실패 시 exit 1, 미생성
  ├─ registry = createWorkerRegistry({ codex, claude, runner })
  │     analyst/architect/reviewer → ClaudeCodeAdapter (claude)
  │     implementer/fixer          → CodexExecAdapter   (codex)
  │     그 외                       → StubWorker
  └─ RunExecutor.start(req)                               # (변경 최소) 격리·게이트·재개
        └─ worker.run({ cwd: worktreePath, prompt, metadata:{stepType,role,...} })
              └─ ClaudeCodeAdapter (읽기 전용)
                    ├─ runner.run("claude", <read-only args>, { cwd, input: prompt })
                    ├─ write steps/<stepId>.prompt.md
                    └─ write {analysis|design|review}.md  (stepType별)
```

코어 변경은 metadata 1곳 + 신규 어댑터. 나머지는 CLI/registry 레이어.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/runs/RunExecutor.ts` | worker metadata에 `stepType: step.type`, `role: step.role` 추가 |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts`(신규) | 읽기 전용 claude 호출, stdin 프롬프트, stepType별 출력 아티팩트, 프롬프트 아티팩트, 실패 매핑, configurable |
| `packages/core/src/index.ts` | `ClaudeCodeAdapter` export |
| `packages/cli/src/registry.ts` | `createWorkerRegistry({codex,claude,runner})` 통합; `createDefaultWorkerRegistry`/`createCodexWorkerRegistry`는 위임 |
| `packages/cli/src/commands/doctor.ts` | `checkClaude(runner)` 추가; `doctorCommand`가 `codex`/`claude` 분기 |
| `packages/cli/src/commands/run.ts` | `--claude` 파싱, `preflightClaude`, 레지스트리 조합, resume/approve 조합, warn 갱신 |
| `packages/cli/src/main.ts` | `claude doctor` 라우팅, help 갱신 |
| `.gitignore` | `!.baton/runs/claude-adapter-v0.4/` allow-list 추가 |
| `README.md` | `--claude`/`claude doctor`/읽기 전용/안전 모델 문서화 |
| `packages/*/test/*` | adapter/doctor/registry/run/보안 테스트 |

## Data Model Changes

스키마 변경 없음. `WorkerRunInput.metadata`에 런타임 키(`stepType`,`role`) 추가
(타입은 이미 `Record<string, unknown>`이라 변경 불필요). 출력 아티팩트는 파일 규약.

## API / CLI Changes

```bash
baton run "<request>"                       # (회귀) 전부 Stub
baton run "<request>" --claude              # analyst/architect/reviewer 실제 Claude
baton run "<request>" --codex --claude      # 구현=Codex, 분석/설계/리뷰=Claude
baton run resume <runId> [--codex] [--claude]
baton run approve <runId> [--codex] [--claude] [--reject]
baton claude doctor                         # 미설치/오류/가용 구분
baton codex doctor                          # (기존)
```

신규 core API: `ClaudeCodeAdapter`. 신규 CLI: `createWorkerRegistry`,
`checkClaude`, `preflightClaude`.

## Workflow Changes

엔진 실행 의미(격리·게이트·재개)는 v0.2/v0.3 그대로. 변화: (1) metadata에 stepType,
(2) analyst/architect/reviewer가 실제 Claude로 산출물 생성, (3) `--codex --claude`
조합으로 역할별 실제 워커 동시 구성. analysis/design/review는 읽기 전용.

## Error Handling

- 프리플라이트 실패(claude/codex 미설치) → 안내 + exit 1, run/worktree 미생성.
- claude 실행 실패/timeout → success:false → step/run failed.
- 출력 stdout 비어도 아티팩트는 남기되 success는 exit 기준.
- stdin/파일 write 실패 → 결과/에러로 표면화, throw로 흐름 제어 금지.

## Security Considerations

- 실제 실행 opt-in. 기본 Stub. analysis/design/review 읽기 전용(write/danger 플래그
  금지, 기본 args 단언).
- 어댑터 cwd=worktreePath. base/main 미접근.
- `claude`/`codex` 공식 CLI만 호출. Codex credential 및 **Claude Code 세션 토큰**
  무접근(보안 grep 회귀).
- `danger-full-access` 금지.

## Test Plan

`test-plan.md` 참조. 요지: 플래그 없으면 호출 0회, 읽기 전용 args 단언, stepType별
산출물, 프리플라이트 무생성, 조합 등록, 세션 토큰/credential 무접근, 실제 미실행.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-23 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-301 → task-306 의존성 순서를 따른다.
- v0.1~v0.3 공개 동작/테스트를 깨지 말 것(기본 Stub, --codex, 게이트, dry-run).
- ClaudeCodeAdapter는 **읽기 전용 기본 args**(write/danger 플래그 금지).
- claude CLI 인터페이스는 가정 → 구성 가능 + doctor 검증. 실제 claude/codex/git을
  실행하는 자동화 테스트 금지(mock만).
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- 실제 Claude 대화형/MCP, SQLite, 동시 실행, worktree diff 캡처/자동 정리.

## Review Checklist

- [ ] 플래그 없으면 실제 claude/codex 호출 0회(기본 Stub 회귀).
- [ ] `--claude`는 analyst/architect/reviewer만 실제, 프리플라이트 실패 시 미생성.
- [ ] 어댑터 기본 args 읽기 전용(write/danger 부재), 프롬프트 stdin, stepType별 산출물.
- [ ] cwd==worktreePath, base/main 보호.
- [ ] Codex credential/Claude 세션 토큰 무접근, danger 금지.
- [ ] `--codex --claude` 조합 역할 분리. v0.1~v0.3 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### Goal

Baton v0.4: **ClaudeCode 어댑터를 연결**해 analysis/design/review 역할을 실제
Claude로 실행한다. CodexExecAdapter 패턴을 재사용하되 (1) `--claude` opt-in,
(2) `claude --version` 프리플라이트, (3) analysis/design/review는 **읽기 전용**
(write/danger 플래그 금지), (4) stepType별 산출물(analysis.md/design.md/review.md)
기록, (5) `--codex`와 조합 가능. 코어 엔진은 provider-agnostic 유지, 자동화 테스트는
실제 claude/codex/git을 실행하지 않는다.

성공 기준은 "실제 Claude 실행"이 아니라 **읽기 전용·opt-in·격리된 안전한 연결 +
회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/claude-adapter-v0.4/design.md`
3. `.baton/runs/claude-adapter-v0.4/tasks.json`
4. `.baton/runs/claude-adapter-v0.4/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.3 코드 컨벤션(특히 `CodexExecAdapter`, `checkCodex`, `--codex` 경로)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/workers/claude/ClaudeCodeAdapter.ts`
- `packages/core/test/claudeCodeAdapter.test.ts`

### Files to Modify

- `packages/core/src/runs/RunExecutor.ts` — worker metadata에 `stepType: step.type`,
  `role: step.role` 추가(기존 키 유지)
- `packages/core/src/index.ts` — `ClaudeCodeAdapter` export
- `packages/cli/src/registry.ts` — `createWorkerRegistry({codex,claude,runner})` 통합;
  기존 `createDefaultWorkerRegistry`/`createCodexWorkerRegistry`는 위임으로 유지
- `packages/cli/src/commands/doctor.ts` — `checkClaude(runner)`(checkCodex 동형) +
  `doctorCommand`의 `codex`/`claude` 분기
- `packages/cli/src/commands/run.ts` — `--claude` 파싱, `preflightClaude`, 레지스트리
  조합(codex/claude), resume/approve 조합, 경고 갱신
- `packages/cli/src/main.ts` — `claude doctor` 라우팅 + help
- `.gitignore` — `!.baton/runs/claude-adapter-v0.4/` 추가
- `README.md` — `--claude`/`claude doctor`/읽기 전용/안전 모델
- 테스트: `packages/cli/test/cli.test.ts`(doctor/run/registry/조합), 보안 회귀

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 실제 claude/codex/git을 실행하는 자동화 테스트 금지(mock만).
- 런타임 의존성 추가 금지(`zod`, `yaml`).
- analysis/design/review에 write/edit/danger/full-access 플래그 사용 금지.

### Step-by-Step Implementation Plan

1. `.baton/runs/claude-adapter-v0.4/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `RunExecutor` worker metadata에 `stepType`/`role` 추가 + 회귀 테스트. (task-301)
3. `ClaudeCodeAdapter`: configurable command/args(기본 읽기 전용), stdin 프롬프트,
   `steps/<stepId>.prompt.md` + stepType별 산출물(analyze→analysis.md, design→
   design.md, review→review.md), exit/timeout/예외→success:false, 세션 토큰 무접근
   + 테스트. (task-302)
4. `checkClaude(runner)` + `claude doctor` 라우팅(미설치/오류 구분) + 테스트. (task-303)
5. `createWorkerRegistry({codex,claude,runner})` 통합 + 기존 함수 위임 + 테스트. (task-304)
6. CLI `--claude` opt-in: `preflightClaude`(실패 시 exit 1·미생성), `--codex`와 조합,
   resume/approve 조합, 플래그 없으면 호출 0회 + 테스트. (task-305)
7. `.gitignore` allow-list 추가, README 갱신, 보안 회귀(credential/세션 토큰/danger 0),
   전체 게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-306)

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

`.baton/runs/claude-adapter-v0.4/acceptance-criteria.md`의 AC-01 ~ AC-23 전부 충족.
특히: 플래그 없으면 호출 0회(AC-14), `--claude` 역할 한정(AC-15), 프리플라이트
무생성(AC-16), 읽기 전용 기본 args(AC-04), stepType별 산출물(AC-05), 세션 토큰
무접근(AC-08/19), cwd==worktreePath(AC-20).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 실제 실행 opt-in(`--claude`), 기본 Stub. analysis/design/review 읽기 전용.
- 어댑터 cwd=worktreePath, base/main 미접근.
- Codex credential / Claude 세션 토큰 무접근, `danger-full-access` 금지.
- worker 실패/timeout은 success:false(throw 금지). 코어 엔진 provider-agnostic.
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
- SQLite, worktree diff 캡처/자동 정리, 실제 멀티턴 등 남은 항목

## Notes for Reviewer
- 기본 Stub 회귀, 읽기 전용 args, 프리플라이트 무생성, stepType 산출물, 세션 토큰
  무접근, --codex --claude 조합을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
