# Implementation Design

## Summary

파이프라인의 `finalize` 단계를 실제화한다. `release_writer` 역할을 run 상태 +
아티팩트로부터 `final_summary.md`/`pr_description.md`를 **결정적으로** 생성하는
`FinalizeWriter`로 연결한다. 외부 LLM/명령 없이 로컬 조립이라 모든 레지스트리에서
기본 on(Stub 아님). 쓰기는 run 디렉터리로 강제하고 누락 아티팩트는 우아하게 생략한다.

## Scope

### In Scope

- `FinalizeWriter`(core, WorkerAdapter, 결정적): run.json + 아티팩트 읽어 2개 산출물
- `release_writer` → FinalizeWriter(모든 레지스트리 변형, 기본 on)
- 누락 아티팩트 우아 처리, 멱등, run 디렉터리 경로 강제, IO 오류 상태화
- 단위/통합/안전 테스트

### Out of Scope

- LLM 산문, git diff 캡처, 실제 PR/gh 생성, 실패 경로 finalize, Fix 루프, SQLite

## Proposed Architecture

```text
RunExecutor (finalize step) → worker.run({ cwd: worktreePath,
                                           metadata:{ stepType:'finalize', runDirectory,... } })
  └─ FinalizeWriter (결정적)
        ├─ read <runDirectory>/run.json            # 요청/워크플로우/steps/outcome
        ├─ detect present artifacts                 # analysis/design/test_result/review.md
        ├─ write <runDirectory>/final_summary.md    # 요약(step 표/테스트/아티팩트/outcome)
        └─ write <runDirectory>/pr_description.md    # PR 제목/요약/개요/테스트 상태
  → WorkerRunResult{ success:true, artifacts:[final_summary.md, pr_description.md] }
```

다른 어댑터처럼 cwd=worktree로 호출되지만, 산출물은 run 디렉터리에 쓴다. 결정적.

## File-Level Plan

| File | Change |
|---|---|
| `packages/core/src/workers/finalize/FinalizeWriter.ts`(신규) | run 읽기 + 2개 산출물 생성 + 경로 강제 + IO 오류 상태화 |
| `packages/core/src/workers/finalize/render.ts`(신규) | 결정적 마크다운 렌더(요약/PR) |
| `packages/core/src/index.ts` | `FinalizeWriter` export |
| `packages/cli/src/registry.ts` | release_writer를 FinalizeWriter로(모든 변형); stubRoles에서 release_writer 제외 |
| `README.md` | finalize 산출물/기본 on 문서화 |
| `packages/*/test/*` | FinalizeWriter/registry/CLI/security 테스트 |

## Data Model Changes

스키마 변경 없음. 기존 `Run`(run.json)과 run 디렉터리 아티팩트를 입력으로 사용.
출력은 파일 규약: `final_summary.md`, `pr_description.md`(AGENTS.md 명시).

## API / CLI Changes

CLI 표면 변화 없음(새 플래그 없음). `baton run …` 완주 시 finalize step이 자동으로
두 산출물을 만든다. 신규 core API: `FinalizeWriter`.

## Workflow Changes

`finalize` step이 더 이상 무해 Stub이 아니라 결정적 요약 생성기로 동작. 성공 경로
완주 시 run 디렉터리에 `final_summary.md`/`pr_description.md`가 생긴다(Obsidian 저널이
자기완결 복사 시 함께 볼트로 들어감 — v0.5 동작).

## Error Handling

- run.json 부재/손상 → success:false + 메시지(throw 없음). 엔진이 step 상태로 처리.
- 누락 아티팩트 → 있는 것만 반영, 부재는 "(none)"류 표기(렌더 실패 없음).
- 산출물 write 실패 → success:false + 메시지.
- 제목 정규화: 개행 제거 + 길이 제한.

## Security Considerations

- 쓰기는 `metadata.runDirectory` 하위로 강제(resolve+검증). 삭제 없음. 저장소/
  worktree 미수정.
- 외부 프로세스/네트워크/토큰 미접근. credential/세션 토큰 무접근(grep 회귀).
- `danger-full-access` 무관.

## Test Plan

`test-plan.md` 참조. 요지: 두 산출물 섹션, 누락 아티팩트 우아 처리, 멱등, run.json
부재→상태화, run 디렉터리 경로 강제, release_writer FinalizeWriter 등록, 보안 회귀.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-701 → task-704 의존성 순서를 따른다.
- v0.1~v0.7 공개 동작/테스트를 깨지 말 것(release_writer Stub 단언이 있으면 의도적
  갱신). 다른 역할 매핑 불변.
- 결정적(Clock/random 없음). 쓰기는 run 디렉터리에만.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- LLM 산문, git diff, 실제 PR/gh, 실패 경로 finalize, Fix 루프, SQLite.

## Review Checklist

- [ ] FinalizeWriter가 run.json+아티팩트로 결정적 생성, 멱등.
- [ ] final_summary.md/pr_description.md 섹션 구비, 누락 우아 처리.
- [ ] 쓰기 run 디렉터리 한정, 저장소/worktree 미수정, 삭제 없음.
- [ ] release_writer→FinalizeWriter(모든 변형), 다른 역할 불변.
- [ ] IO 오류 상태화(throw 없음), credential/토큰/danger 회귀 없음. v0.1~v0.7 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.7 누적). 예:
  `git worktree add ../baton-finalize-writer-v0.8 -b baton/finalize-writer-v0.8 origin/main`
- 분기 직후 확인: `packages/core/src/workers/test/TestRunnerAdapter.ts`(v0.7),
  `packages/cli/src/registry.ts`의 `createWorkerRegistry`, 그리고
  `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(123)보다 줄면 base를 의심하라.

### Goal

Baton 파이프라인의 `finalize` 단계를 실제화한다. `release_writer` 역할을 run 상태 +
아티팩트로부터 `final_summary.md`/`pr_description.md`를 **결정적으로**(외부 LLM/명령
없이) 생성하는 `FinalizeWriter`로 연결한다. 모든 레지스트리에서 기본 on(Stub 아님).
쓰기는 run 디렉터리에만, 누락 아티팩트는 우아하게 생략, IO 오류는 상태로 표현.

성공 기준은 "산출물 생성"뿐 아니라 **결정적·멱등 + run 디렉터리 한정 쓰기 + 누락
우아 처리 + 회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/finalize-writer-v0.8/design.md`
3. `.baton/runs/finalize-writer-v0.8/tasks.json`
4. `.baton/runs/finalize-writer-v0.8/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.7 코드 컨벤션(`ClaudeCodeAdapter`의 runDirectory 산출물 패턴,
   `RunStore`/`listRuns`의 run.json 읽기, `createWorkerRegistry`)
6. `AGENTS.md`(final_summary.md / pr_description.md 규약)

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/core/src/workers/finalize/FinalizeWriter.ts`
- `packages/core/src/workers/finalize/render.ts`
- `packages/core/test/finalizeWriter.test.ts`

### Files to Modify

- `packages/core/src/index.ts` — `FinalizeWriter` export
- `packages/cli/src/registry.ts` — release_writer를 FinalizeWriter로(모든 변형);
  stubRoles에서 release_writer 제외(또는 등록 우선순위 조정)
- `packages/cli/test/cli.test.ts` — release_writer 매핑/생성 산출물 회귀 테스트
- `README.md` — finalize 산출물/기본 on 문서화

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 저장소/worktree 파일 수정·삭제 금지(쓰기는 run 디렉터리에만).
- LLM 호출/외부 프로세스/네트워크/git diff 추가 금지(결정적 로컬 생성).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/finalize-writer-v0.8/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `FinalizeWriter`(WorkerAdapter): `metadata.runDirectory`에서 run.json 읽기(없음/손상
   → success:false), 존재 아티팩트 탐지(analysis/design/test_result/review.md),
   `render.ts`로 `final_summary.md`/`pr_description.md` 결정적 생성, run 디렉터리에
   쓰기(경로 강제, 삭제 없음), artifacts 반환, IO 오류 try/catch → success:false +
   테스트(섹션/누락 우아/멱등/경로 강제/run.json 부재). (task-701)
3. `render.ts`: 결정적 마크다운(요약: 요청/워크플로우/step 표/테스트 요약/아티팩트
   목록/outcome; PR: 제목 정규화/요약/개요/테스트 상태/포인터). (task-701에 포함)
4. `createWorkerRegistry`/기본 레지스트리에서 release_writer → FinalizeWriter(모든
   변형), 다른 역할 매핑 불변 + 테스트. (task-702)
5. CLI 통합: `baton run` 성공 완주 시 final_summary.md/pr_description.md 생성 단언,
   cwd 격리, (해당 시) Obsidian 저널 복사 회귀 + 테스트. (task-703)
6. README/help 갱신, 보안·경로 회귀 테스트, 전체 게이트(v0.1~v0.8) + 스모크, 자체
   diff 리뷰, 최종 요약. (task-704)

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

`.baton/runs/finalize-writer-v0.8/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: 결정적·멱등(AC-06), run 디렉터리 경로 강제+삭제 없음(AC-08), 누락 아티팩트
우아 처리(AC-05), release_writer 기본 FinalizeWriter(AC-09), IO 오류 상태화(AC-07).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 결정적(Clock/random 없음). 쓰기는 run 디렉터리에만, 삭제 없음, 저장소/worktree 미수정.
- 외부 LLM/프로세스/네트워크 미사용. credential/세션 토큰 무접근, danger 무관.
- release_writer 기본 on(opt-in 플래그 없음). 다른 역할 매핑 불변.
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
- 실패 경로 finalize, LLM 산문, git diff, Fix 루프, SQLite 등 남은 항목

## Notes for Reviewer
- 결정적·멱등, run 디렉터리 한정 쓰기, 누락 우아 처리, release_writer 기본 매핑,
  IO 오류 상태화, v0.1~v0.7 회귀 없음을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
