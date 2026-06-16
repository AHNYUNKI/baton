# Request

## Run

- runId: `finalize-writer-v0.8`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `test-runner-v0.7` (PR #7, merged → main `84e84ad`)

## User Request

Baton 파이프라인의 마지막 출력 단계인 **Finalize**를 채운다. 기본 워크플로우에
`finalize` step(역할 `release_writer`)이 있으나 현재 Stub이라 산출물이 없다. v0.8은
run 상태와 기존 아티팩트로부터 **사람이 읽는 최종 요약**(`final_summary.md`)과
**PR 설명**(`pr_description.md`)을 **결정적으로** 생성하는 `FinalizeWriter`를 연결한다.
AGENTS.md가 명시한 `final_summary.md`/`pr_description.md` 아티팩트를 만든다.

## Scope (v0.8)

- `FinalizeWriter`(core, WorkerAdapter, 결정적): run 디렉터리(run.json + 존재하는
  아티팩트)를 읽어 `final_summary.md` + `pr_description.md` 생성
- `release_writer` 역할을 모든 레지스트리에서 `FinalizeWriter`로 연결(기본 on,
  더 이상 Stub 아님) — LLM/외부 실행 불필요, 안전
- 누락 아티팩트(analysis/design/test_result/review)는 있는 것만 반영, 멱등 재생성
- 단위/통합 테스트(임시 run 디렉터리)

## Out of Scope

- LLM 기반 산문 생성, git diff 캡처, 실제 PR/gh 생성, 실패 경로 finalize(이번엔
  성공 경로 finalize만), Fix 루프, SQLite

## Constraints

- **결정적**(Clock/random 없음): run 상태에서만 조립.
- 쓰기는 **run 디렉터리(`.baton/runs/<id>/`)에만** — 저장소/worktree/외부 미수정.
- release_writer 기본 동작 변경(Stub→FinalizeWriter)이지만 부수효과는 산출물 생성뿐.
- credential/세션 토큰 무접근, danger 무관(기존 안전 유지).
- 런타임 의존성 추가 없음(zod/yaml). base = `origin/main`(v0.1~v0.7).
