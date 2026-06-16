# Request

## Run

- runId: `fix-loop-v0.9`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `finalize-writer-v0.8` (PR #8, merged → main `7c8ca20`)

## User Request

파이프라인의 마지막 빈칸인 **Fix 루프**를 채운다. 현재 `test` step이 실패하면 run이
즉시 failed로 멈추고 review/finalize는 skipped 된다. v0.9는 실패한 fixable step
(기본 `test`)에 대해 **`fixer` 역할 워커로 수정을 시도한 뒤 해당 step을 재실행**하는
**경계가 명확한(bounded)** 루프를 추가한다. CLAUDE.md "무한 루프 금지"를 엄수한다.

## Scope (v0.9)

- `RunExecutor`에 **bounded fix 루프**: fixable step 실패 시 fixer 실행 → step 재실행,
  최대 `maxFixAttempts`회(기본 1, 명시 상한). 통과하면 파이프라인 계속, 소진하면
  기존대로 run failed.
- `--fix` opt-in 플래그(+ `--max-fix-attempts <n>`). 미지정 시 동작 불변.
- fixer 역할은 기존 레지스트리(`--codex` 시 Codex, 아니면 Stub) 사용. `--fix`인데
  실제 fixer 없으면 경고(코드 변경 없음).
- fix 시도/재실행을 이벤트·아티팩트·step 상태로 기록(optional `RunStep.attempts`)
- 단위/통합 테스트(실제 워커 없이 mock, 경계 단언)

## Out of Scope

- review 실패 자동 수정(이번엔 `test`만), LLM 기반 fix 전략, 부분 수정 병합,
  중첩 루프, SQLite, 실제 codex/git 실행 테스트

## Constraints

- **bounded**: 하드 상한 `maxFixAttempts`. 매 시도 = fixer 1회 + step 재실행 1회.
  종료 조건 명확(통과/상한 소진/fixer 부재). 무한 루프 불가.
- 실패는 throw 아닌 상태로(엔진 계약 유지). 매 시도 후 영속화(재개 가능).
- 어댑터 cwd=worktreePath, main 미수정. credential/세션 토큰 무접근, danger 무관.
- 런타임 의존성 추가 없음. base = `origin/main`(v0.1~v0.8). 스키마 변경은 additive.
