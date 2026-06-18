# Analysis

## User Request
역할이 작업과 함께 "무엇을·왜"를 초보자용으로 설명하게 하고, 그 설명을 1급으로 저장·표시.
학습 전환의 토대(L1).

## Current Repository Understanding
- `buildRolePrompt({project,role,teamPlan,runDirectory,upstream})`: 섹션 배열(Project/Assigned
  Role/Role Instructions/Team Plan/Upstream Context/Artifacts) join. **설명 지시 없음.**
- `TeamRunExecutor.executeFrom`: 역할 완료 시 `summary = summarizeWorkerResult(...)`,
  `usage = readOrEstimateUsage(...)`를 `replaceRole`로 저장(라인 ~286-289). 같은 지점에 explanation
  추가 가능. `invocation.prompt`/`result.stdout` 보유.
- `TeamRunRole`(teamRun.schema): roleId/name/assignedAgentId/status/.../summary?/usage?/artifacts?.
  **explanation 없음**(추가).
- `StubWorker`: AI 미호출, 합성 stdout 반환 → 설명 섹션 합성 가능(헤드리스 검증).
- CLI `plan run show`: 역할 줄 + 토큰 표. 설명 표시 추가 지점.

## Relevant Files
| File | Reason |
|---|---|
| `packages/core/src/teamRuns/buildRolePrompt.ts` | "## 학습 설명" 지시 섹션 |
| `packages/core/src/teamRuns/explanation.ts`(신규/순수) | `extractExplanation(stdout)` |
| `packages/schemas/src/teamRun.schema.ts` | `TeamRunRole.explanation?` |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | 완료 시 explanation 추출·저장 |
| `packages/core/src/workers/StubWorker.ts` | 설명 섹션 합성(무토큰 검증) |
| `packages/cli/src/commands/project.ts` | `plan run show` 설명 표시 |
| 각 `*.test.ts` | 프롬프트/추출/저장/CLI |

## Existing Behavior
역할 산출물은 코드/요약뿐 — "왜"가 없어 학습 불가.

## Target Behavior
역할 프롬프트가 워커에게 **출력 끝에 "## 학습 설명" 섹션**(무엇을 했나/왜 이렇게/핵심 개념/대안·
트레이드오프, 초보자용 한국어)을 요구. 완료 시 `extractExplanation(stdout)`로 그 섹션을 뽑아
`role.explanation`에 저장. `plan run show`가 역할별 설명을 표시. 없으면(추출 실패) graceful.

## Constraints
- TS 단독, Swift/스트리밍 L3. `explanation`은 **선택 필드**(team-run/Run/CLI 회귀 0).
- 안전 불변(승인 게이트·worktree·읽기전용·credential). 설명은 출력에 텍스트로만(부수효과 없음).
- 읽기전용/쓰기 모드 **둘 다** stdout 섹션 방식(파일 쓰기 불요 → read-only도 동작).
- 순수 추출 함수는 주입형 테스트. StubWorker 합성 섹션으로 무토큰 전 경로 검증.

## Assumptions
- 워커가 지시대로 "## 학습 설명" 헤딩을 출력 끝에 둠 → 추출은 그 헤딩~끝(또는 다음 H2 전)까지.
  미준수/부재 시 undefined(graceful).
- 설명은 role 출력(stdout)에 포함 → 기존 summary/relay/아티팩트로도 흐름. 별도 파일 불요(L1).

## Open Questions
없음. 표시 고도화(전체 뷰)는 L2/L3.

## Risks
- 워커가 헤딩 형식 안 지킴 → 추출 실패(undefined), graceful. 프롬프트로 강하게 유도 + 테스트.
- 설명이 길어 토큰↑ → 미미(같은 호출 내 출력 증가분만). 가치 대비 수용. 필요 시 길이 가이드.
- 스키마 변경 → 선택 필드라 회귀 위험 낮음.

## Recommendation
buildRolePrompt 설명 지시 + 순수 extractExplanation + `role.explanation?` + 완료 시 저장 +
Stub 합성 + CLI 표시. TS 단독, 회귀 0. 게이트 pnpm typecheck/test/build + 헤드리스(stub) 검증.
