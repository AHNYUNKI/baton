# Review — org-hierarchy-v0.18.3

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-org-hierarchy`
(branch `baton/org-hierarchy-v0.18.3`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손(`merge-base --is-ancestor` 통과) |
| 범위 격리 | ✅ packages/* 변경은 `teamPlan.schema.ts` + `planner.ts`(+테스트)만, 의도대로 |
| TS 게이트 | ✅ `pnpm test` **223 passed**(신규 schema/planner 포함) |
| Swift 게이트 | ✅ `swift build` 성공, `swift test` **66 passed** |
| 하위호환 | ✅ reportsTo optional 순수 추가 — 기존 plan(필드 부재)=대표 직속 1단계 |
| 보정(거부 아님) | ✅ 미존재/자기/순환 → 대표 직속, TS+Swift 양쪽 미러 |
| 편집 라운드트립 | ✅ reportsTo 보존 테스트 통과 |

## Independent Verification (직접 재실행)
- 워크트리 base 확인, diff 14파일/820+·179- 확인.
- **TS**: `teamPlan.schema.ts`는 `reportsTo: z.string().trim().min(1).nullish()` 순수 추가
  (superRefine 고유 id 유지, 참조/순환 reject 안 함). `planner.ts`:
  - `buildPlanPrompt`에 `reportsTo:null` 예시 + 한국어 계층 규칙 4줄(2~3단계/대표 직속 매니저/
    매니저 보고/순환 금지) 추가.
  - `normalizeHierarchy`: null 보존, undefined/자기/미존재/순환 → reportsTo 제거. DFS 순환
    탐지. `parsePlanFromResult`에서 `clampAssignedAgents` 후 적용.
  - 테스트: valid(비변형)/missing/self/cyclic 4케이스.
- **Swift**: `OrgChartModel.buildOrgChart`가 평면 roles→트리(roots/children/depth). 동일
  방어(validParent 필터 → DFS 순환 → effectiveParent, 무효는 root). `OrgChartNode`에
  description/reportsTo, `OrgChartTreeNode{node,children,depth}`, `OrgChart{leadAgentId,
  hasPlan,roots}`.
  - 테스트: 중첩 트리/평면 하위호환/미존재 parent→root/자기·순환→root/빈 plan/단일 agent 대표.
  - `TeamRole.reportsTo`(Codable, 키 부재→nil) + ContractTests.
  - `EditableTeamRole`/`toTeamRole`/`updateReportsTo` 라운드트립 + 테스트.
- **뷰**: `OrgChartView` `ScrollView([.horizontal,.vertical])` 패닝, 대표 정점→재귀 트리,
  상태 점 + 한국어 라벨(대기/승인 대기/완료/실패/진행 중) 병기(색 단독 아님), 범례.
  `ProjectPlanView` "보고 대상" Picker(대표/다른 역할). swift build 컴파일.

## Acceptance Criteria
AC-01~14 충족. 뷰 렌더(AC-09/10/11)는 swift build 컴파일 + 수동 QA — 설계대로.

## Deviations / Notes
- `.baton/runs/**` 산출물은 worktree(origin/main 분기)에 없어 Codex는 붙여넣은 Handoff 기준
  진행 — 정상(아티팩트는 main 작업본에만 존재, 읽기 전용).
- 드래그 재배치 UI 미구현(설계상 비목표, Picker로 대체).
- 실제 macOS UI 트리/패닝/elbow 시각 확인은 수동 QA 대상.

## Follow-ups
- v0.19: 실행 엔진(대표→매니저→실무 위임에 reportsTo 활용) + 라이브 점등. v0.20: 스킬.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**` 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 있으므로 머지 후 main에서 dist 재빌드 권장.
