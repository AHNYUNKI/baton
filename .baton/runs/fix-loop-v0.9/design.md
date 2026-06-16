# Implementation Design

## Summary

파이프라인의 마지막 빈칸인 **bounded Fix 루프**를 `RunExecutor`에 추가한다. fixable
step(기본 `test`)이 실패하면 `fixer` 역할 워커가 수정을 시도한 뒤 그 step을 재실행하되,
**하드 상한 `maxFixAttempts`(기본 1)** 로 엄격히 제한한다. opt-in(`--fix`)이며 미지정 시
동작은 바이트 동일하게 불변. 무한 루프 불가(정수 상한 + 명확한 종료 조건).

## Scope

### In Scope

- `RunExecutor` 내 `attemptFix` 헬퍼(격리된 bounded 루프)
- `FixPolicy`{maxAttempts, fixableStepTypes:['test']} + `buildFixPrompt`
- optional `RunStep.attempts`
- CLI `--fix`/`--max-fix-attempts`, fixer 미해결 경고, 조합/resume/approve
- 단위/통합/안전 테스트(mock 호출 횟수로 경계 단언)

### Out of Scope

- review 자동 수정, LLM fix 전략, 부분 수정, 중첩 루프, SQLite, 실제 codex/git 테스트

## Proposed Architecture

```text
executeFrom(...) 내 step 실행 후:
  result = invokeWorker(step)
  status = result.success ? completed : failed
  save(step, status)

  if (!result.success):
     if (fixEnabled && isFixable(step) && fixerAvailable):
        ── attemptFix (BOUNDED) ──
        attempts = 0
        while (attempts < maxFixAttempts):
           attempts += 1
           fixResult = invokeWorker(fixerStep@worktree)      # fixer 1회
           events/logs; save
           result = invokeWorker(step)                       # 재실행 1회
           save(step, attempts, status= result.success?completed:failed)
           if (result.success): break                        # 종료: 통과
        ── attemptFix 끝 (종료 보장: attempts==max 또는 통과) ──
     if (!result.success):                                   # 여전히 실패
        skipFromIndex(index+1); save run failed; return      # 기존 경로
  # 통과 시 다음 step 계속
```

종료 보장: `attempts`는 정수, 매 반복 +1, `attempts < maxFixAttempts` 가드 →
최대 N회. fixer가 아무것도 안 고쳐도 카운터로 종료. 중첩/재귀 없음.

`fixEnabled=false`면 `attemptFix`에 진입하지 않음 → 기존 `executeFrom` 경로 그대로.

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/run.schema.ts` | optional `RunStep.attempts?: number` |
| `packages/schemas/test/schemas.test.ts` | attempts 하위호환 테스트 |
| `packages/core/src/policies/FixPolicy.ts`(신규) | `maxAttempts`, `fixableStepTypes`, `isFixable(type)` |
| `packages/core/src/runs/buildFixPrompt.ts`(신규) | fixer 프롬프트(실패 step + 출력 컨텍스트) |
| `packages/core/src/runs/RunExecutor.ts` | `attemptFix` 헬퍼 + 실패 분기에 bounded 루프; RunExecutorOptions에 `fixPolicy?`/`fixEnabled` |
| `packages/cli/src/commands/run.ts` | `--fix`/`--max-fix-attempts` 파싱·검증, executor 옵션, fixer 미해결 경고, resume/approve |
| `packages/core/src/index.ts` | `FixPolicy` export(필요 시) |
| `README.md` | fix 루프/상한/안전 문서화 |
| `packages/*/test/*` | 루프 경계/회귀/CLI/보안 테스트 |

## Data Model Changes

```ts
// run.schema.ts
RunStep += attempts?: number   // fixable step의 실행 시도 수(초기 1, fix마다 +1). optional → 하위호환
```

`FixPolicy` 기본: `{ maxAttempts: 1, fixableStepTypes: ['test'] }`. `maxAttempts`는
1 이상 정수, 상한(예: 5)으로 클램프(또는 검증 에러).

## API / CLI Changes

```bash
baton run "<request>" --codex --test --test-command "<cmd>" --fix
baton run "<request>" ... --fix --max-fix-attempts 3
baton run resume <runId> --fix
baton run approve <runId> --fix
```

`--fix` 없으면 기존 동작. fixer는 registry의 `fixer` 역할(= `--codex` 시 Codex).
신규 core: `FixPolicy`, `RunExecutorOptions.fixPolicy`/fix 활성 옵션.

## Workflow Changes

`test` 실패가 곧 run 실패가 아니라, fix가 활성이면 bounded 재시도 후 결정된다. step
상태기계는 유지하되 fixable step은 `running`↔재시도를 거쳐 최종 completed|failed.
`RunStep.attempts`로 시도 수를 노출. review/finalize는 test가 통과해야 진행.

## Error Handling

- fixer/재실행 실패·예외 → success:false(invokeWorker가 try/catch). 루프는 throw 없이
  상태로. 상한 소진 → 기존 실패 경로(skipFromIndex+run failed).
- `--max-fix-attempts` 잘못된 값 → 검증 에러 + 사용법.
- fixer 미해결 + `--fix` → 경고(코드 변경 없음), 루프는 무해하게 상한 내 종료.

## Security Considerations

- fixer/재실행 cwd=worktreePath(격리). main 직접 수정 경로 없음.
- credential/세션 토큰 무접근. `danger-full-access` 무관(fixer=Codex는 workspace-write).
- 루프 상한으로 자원 소모 제한(무한/과도 실행 방지).

## Test Plan

`test-plan.md` 참조. 요지: fix 비활성 회귀(fixer 0회), 1회 fix 통과, N회 소진(정확히
N회 단언), 처음 통과 시 미진입, fixer 미등록 무해, cwd 격리, attempts/이벤트 영속,
resume 멱등, max 검증. 모든 경계는 mock 호출 횟수로.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-801 → task-805 의존성 순서를 따른다.
- **fix 루프는 반드시 정수 하드 상한으로 bounded** — 무한/무가드 루프 금지(CLAUDE.md).
- `--fix` 미지정 경로는 기존 `executeFrom`과 동일하게 유지(회귀 0).
- 실패는 상태로(throw 금지). 어댑터 cwd=worktreePath. 스키마 additive.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- review 자동 수정, LLM fix 전략, 부분 수정, 중첩 루프, SQLite.

## Review Checklist

- [ ] 루프가 정수 상한으로 bounded, 종료 조건 명확(통과/소진/fixer 부재). 무한 불가.
- [ ] `--fix` 미지정 시 fixer 0회·기존 경로 불변(회귀 없음).
- [ ] 1회 fix 통과/ N회 소진/ 처음 통과 미진입/ fixer 미등록 무해 — mock 호출 횟수 단언.
- [ ] cwd=worktreePath, 실패 상태화(throw 없음), attempts/이벤트 영속, resume 멱등.
- [ ] max 값 검증, fixer 미해결 경고. credential/토큰/danger 회귀 없음. v0.1~v0.8 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.8 누적). 예:
  `git worktree add ../baton-fix-loop-v0.9 -b baton/fix-loop-v0.9 origin/main`
- 분기 직후 확인: `packages/core/src/workers/finalize/FinalizeWriter.ts`(v0.8),
  `packages/core/src/runs/RunExecutor.ts`의 `executeFrom`, 그리고
  `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(131)보다 줄면 base를 의심하라.

### Goal

파이프라인에 **bounded Fix 루프**를 추가한다. fixable step(기본 `test`)이 실패하면
`fixer` 역할 워커가 수정 시도 후 그 step을 재실행하되, **하드 상한 `maxFixAttempts`
(기본 1)** 로 엄격히 제한한다. opt-in(`--fix`)이며 미지정 시 동작은 불변.
**무한 루프 금지(CLAUDE.md)** — 정수 상한 + 명확한 종료 조건이 성공의 핵심이다.

성공 기준은 "자동 수정"이 아니라 **bounded + 회귀 0 + 종료 보장 + mock 호출 횟수로
검증되는 경계**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/fix-loop-v0.9/design.md`
3. `.baton/runs/fix-loop-v0.9/tasks.json`
4. `.baton/runs/fix-loop-v0.9/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.8 코드 컨벤션(`RunExecutor.executeFrom`/`invokeWorker`, registry의
   fixer 역할, `--codex`/`--test` 플래그)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/policies/FixPolicy.ts`
- `packages/core/src/runs/buildFixPrompt.ts`
- `packages/core/test/fixLoop.test.ts`(또는 `runExecutor.fix.test.ts`)

### Files to Modify

- `packages/schemas/src/run.schema.ts` — optional `RunStep.attempts?: number`
- `packages/schemas/test/schemas.test.ts` — attempts 하위호환
- `packages/core/src/runs/RunExecutor.ts` — `attemptFix` 헬퍼 + 실패 분기 bounded 루프;
  `RunExecutorOptions`에 fix 활성/`fixPolicy`
- `packages/core/src/index.ts` — `FixPolicy` export(필요 시)
- `packages/cli/src/commands/run.ts` — `--fix`/`--max-fix-attempts` 파싱·검증, executor
  옵션, fixer 미해결 경고, resume/approve
- `packages/cli/test/cli.test.ts` — `--fix` 조합/경고/검증/회귀
- `README.md` — fix 루프/상한/안전 문서화

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 무한/무가드 루프 금지. `--fix` 미지정 경로 변경 금지(회귀 0).
- 실제 codex/git을 실행하는 자동화 테스트 금지(mock만).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/fix-loop-v0.9/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. optional `RunStep.attempts` + 하위호환 테스트. (task-801)
3. `FixPolicy`{maxAttempts(기본1, 1≤정수≤상한), fixableStepTypes:['test'], isFixable} +
   `buildFixPrompt`(실패 step + 출력 컨텍스트). (task-802)
4. `RunExecutor`: 실패 분기 직전에 `attemptFix` 헬퍼 삽입 — fixEnabled && isFixable &&
   fixer 등록 시 `while(attempts<max){ attempts++; fixer 실행; step 재실행; 통과면 break }`.
   cwd=worktreePath, 매 attempt 영속화 + 이벤트(fix.attempt.*/step.retried) + attempts.
   fixEnabled=false면 미진입(기존 경로 불변). + 테스트(회귀/1회통과/N회소진 정확히 N/
   처음통과 미진입/fixer미등록 무해/cwd/영속). (task-803)
5. CLI `--fix`/`--max-fix-attempts`(검증), executor 옵션 전달, `--codex`/`--claude`/
   `--test`·resume·approve 조합, fixer 미해결 경고 + 테스트. (task-804)
6. README/help, 보안 회귀(토큰/danger 0), 전체 게이트 + 스모크, 자체 diff 리뷰,
   최종 요약. (task-805)

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

`.baton/runs/fix-loop-v0.9/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: fix 비활성 회귀(AC-02), 하드 상한 정확히 N회(AC-04/15), N회 후 failed(AC-05),
처음 통과 미진입(AC-06), cwd 격리(AC-08), resume 멱등(AC-10), max 검증(AC-11).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- **fix 루프는 정수 하드 상한으로 bounded** — 무한/무가드 루프 금지.
- `--fix` 미지정 경로 불변(회귀 0). 실패는 success:false 상태로(throw 금지).
- 어댑터 cwd=worktreePath, main 미수정. credential/세션 토큰 무접근. 스키마 additive.
- 매 attempt 영속화(resume 멱등 유지). 코어 엔진 외 결합 최소.
- base = `origin/main`. 작업은 새 worktree에서. **commit/push 하지 말 것**.

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
- review 자동 수정, LLM fix 전략, SQLite 등 남은 항목

## Notes for Reviewer
- 루프 bounded(정확히 N회)·종료 보장, --fix 미지정 회귀 0, cwd 격리, 실패 상태화,
  attempts/이벤트 영속, resume 멱등, max 검증을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
