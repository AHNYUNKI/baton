# Review — lead-teamplan-v0.17

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-lead-teamplan-v0.17`(branch `baton/lead-teamplan-v0.17`,
base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| TS 게이트 | ✅ typecheck, **218 passed (38 files)** (v0.16 203→+15) |
| Swift 게이트 | ✅ `swift build` 성공, **51 tests passed** (v0.16 45→+6) |
| 플래너(파싱/bounded/클램프) | ✅ 테스트로 고정 |
| setTeamPlan 저장 전 검증 | ✅ Zod + assertPlanAgents |
| 안전 | ✅ eval/network/credential/세션 토큰 없음, 재시도 bounded |

## Independent Verification

- `pnpm typecheck/test`(218) + `swift build/test`(51) 직접 재실행 통과. 회귀 0.
- `planner.ts`:
  - `extractJson`: ```json 펜스 → balanced `{}` 후보 순으로 관대 추출, 없으면 throw.
    `JSON.parse`만(eval/Function 없음). (AC-04)
  - `generateTeamPlan`: `for attempt<=maxAttempts` 루프, 검증 통과 시 반환, **상한 소진 시
    `PlanGenerationError` throw**(무한 없음). 테스트 "stops at the bounded retry maximum". (AC-05)
  - `clampAssignedAgents`: 담당AID ∉ agentIds → fallback. 테스트 "clamps assignedAgentId
    values outside the project agents". (AC-06)
  - 주입형 어댑터 mock 테스트(프로즈+fenced 추출, clean JSON 생성). 실제 AI 호출 없음. (AC-07)
- `ProjectService.setTeamPlan`: `parseTeamPlan(plan)`(Zod) + `assertPlanAgents(plan,
  project.agentIds)` **후** 저장. 손상/담당AI 위반 거부. (AC-08)
- CLI: "generates and stores a project TeamPlan as a JSON envelope"(kind 'team-plan'),
  plan show/set. lead preflight. (AC-09/10)
- GUI: TeamPlan Codable + TeamPlanEditModel(편집/검증) + BatonClient plan API — Swift 51
  테스트에 포함. ProjectPlanView(개요→생성→편집→저장), paperclip/한국어. (AC-11~13)
- 보안: eval/fetch/credential/세션 토큰/danger 매치 0. argv 배열 + stdin 주입(`main.ts`/
  `context.ts`). 공식 어댑터만.

## Acceptance Criteria

AC-01 ~ AC-16 충족(UI는 swift build 컴파일 + 수동 QA, 실제 lead AI는 미호출/mock — 설계대로).

## Deviations / Notes (수용 가능)

1. CLI가 `project plan set`/생성을 위해 stdin 주입을 `main.ts`/`context.ts`에 추가 —
   대형 plan JSON을 argv 대신 stdin으로 받는 합리적 확장(셸/길이 안전).
2. 클램프 fallback = agentIds[0](또는 preferred) — 담당AI 밖 값 보정의 명확한 규칙.

## Follow-ups
- v0.18: 자유 역할 실행 엔진 + 확정 TeamPlan 실행 연결(대표 디스패치, bounded·게이트·격리).
- 실제 lead CLI 환경에서 프롬프트 품질 수동 QA.

## Reviewer Notes
- 커밋/푸시 없음. `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 미수정.
- 머지 후 worktree 즉시 제거 예정(정리 방침).
