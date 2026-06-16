# Analysis

## User Request

파이프라인의 `finalize` 단계를 실제화한다. `release_writer` 역할을 run 상태와
아티팩트로부터 `final_summary.md`/`pr_description.md`를 **결정적으로** 생성하는
`FinalizeWriter`로 연결한다. v0.3~v0.7의 어댑터 패턴을 따르되, 외부 LLM/명령 없이
로컬 결정적 생성이라 기본 on이다.

## Intent

지금까지 analyze/design(v0.4)·implement(v0.3)·test(v0.7)·review(v0.4)가 실제 워커로
동작한다. 마지막 `finalize`만 Stub이라 "이 run이 무엇을 했고 결과가 무엇인지"를
사람이 읽는 산출물이 없다. 가치의 핵심은 **run마다 자동으로 사람 친화 요약과 PR
설명을 남기는** 것 — 사용자의 기록/추적 목표(Obsidian 저널이 이 산출물도 자동 복사)에
직접 기여한다. 외부 의존 없이 결정적으로 만들어 항상 동작하고 테스트 가능하다.

## Current Repository Understanding (v0.7 / main 84e84ad 기준)

- `examples/workflows/default.workflow.yaml` — `finalize` step(type `finalize`,
  role `release_writer`)이 review 다음에 존재. 현재 release_writer → Stub.
- `packages/cli/src/registry.ts` — `stubRoles`에 `release_writer` 포함. codex/claude/
  test 역할만 실제 어댑터. release_writer를 FinalizeWriter로 연결할 지점.
- `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` — `metadata.runDirectory`/
  `stepType`로 산출물(analysis.md 등) 기록. **FinalizeWriter의 직접 템플릿**(읽기+조립).
- `packages/core/src/runs/RunExecutor.ts` — worker 호출 metadata에 runId/stepId/
  stepType/role/runDirectory 전달. run.json은 매 step 저장.
- `packages/core/src/runs/RunStore.ts` / `listRuns.ts`(v0.6) — run.json 읽기 패턴.
- run 디렉터리 산출물: request.md, analysis.md, design.md, test_result.md(v0.7),
  review.md, run.json, logs/, steps/. FinalizeWriter가 읽을 입력.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/workers/finalize/FinalizeWriter.ts`(신규) | run 디렉터리 읽어 요약/PR 생성 |
| `packages/core/src/workers/finalize/render.ts`(신규, 선택) | 결정적 마크다운 렌더 |
| `packages/core/src/index.ts` | export |
| `packages/cli/src/registry.ts` | release_writer → FinalizeWriter(모든 변형, 기본 on) |

## Existing Behavior

`finalize` step은 StubWorker로 무해 완료 — `final_summary.md`/`pr_description.md`
없음. run 결과를 사람이 보려면 run.json/개별 아티팩트를 직접 열어야 한다.

## Target Behavior

- finalize step 실행 시 `FinalizeWriter`가 run.json + 존재하는 아티팩트를 읽어:
  - `final_summary.md`: 요청, 워크플로우, step 상태 표, 테스트 결과 요약(있으면),
    아티팩트 목록, 최종 outcome.
  - `pr_description.md`: 제목(요청 기반), 요약, step 개요, 테스트 상태, 아티팩트 포인터.
- 누락 아티팩트는 있는 것만 반영. 결정적·멱등(동일 run → 동일 출력).
- 기본 on: `baton run`(플래그 무관)에서 release_writer가 FinalizeWriter로 동작.

## Constraints

- 결정적(Clock/random 없음). run 상태에서만 조립.
- 쓰기는 run 디렉터리에만(저장소/worktree/외부 미수정, 삭제 없음).
- exit/실패 개념 없음 — 생성 성공이 기본, IO 오류만 success:false.
- credential/세션 토큰 무접근. 모든 FS 테스트는 임시 run 디렉터리.

## Assumptions

### Safe

- FinalizeWriter는 `metadata.runDirectory`에서 run.json과 아티팩트를 읽고 같은
  디렉터리에 2개 파일을 쓴다.
- release_writer 기본 on(결정적·안전)이라 opt-in 플래그 불필요.
- 출력 산출물명은 AGENTS.md 규약: `final_summary.md`, `pr_description.md`.

### Risky

- **기본 동작 변경**: release_writer가 Stub→FinalizeWriter. 부수효과는 산출물 생성뿐
  (저장소 무수정). 기존 Stub 회귀 테스트가 release_writer를 Stub로 단언했다면 갱신
  필요 — 의도된 변경.
- **run.json 시점**: finalize step 실행 시 run.json은 finalize를 `running`으로
  포함할 수 있다. 요약은 그 시점 상태를 반영(finalize 자체는 진행 중으로 표기되거나
  요약에서 자기 자신 제외). 결정성 위해 입력을 명확히 규정.
- **성공 경로 한정**: 앞 step 실패 시 run은 failed로 멈춰 finalize는 skipped. 즉
  finalize는 성공 경로에서만 생성(실패 run 요약은 후속 — run.json/저널이 이미 기록).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. release_writer를 기본 on으로 둘지(기본 그렇게 — 결정적·안전).
2. finalize에서 자기 자신(finalize step)을 요약 표에 포함할지. 기본: 포함(running/
   completed 상태로 표기).

## Risks

`risks.md` 참조. 핵심: 기본 변경 회귀, run.json 시점 모호, 누락 아티팩트, run 디렉터리
밖 쓰기, 비결정성, 멱등성.

## Recommendation

ClaudeCodeAdapter 패턴으로 `FinalizeWriter`를 만들되 외부 의존 없이 결정적으로
run.json+아티팩트를 조립해 `final_summary.md`/`pr_description.md`를 생성한다.
release_writer를 모든 레지스트리에서 FinalizeWriter로 연결(기본 on). 쓰기는 run
디렉터리로 강제하고, 누락 아티팩트는 우아하게 생략하며, 동일 입력→동일 출력을
테스트로 고정한다. 상세는 `design.md`.
