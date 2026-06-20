# Analysis

## User Request
지정 체크포인트에서 멈춰 설명을 읽고 이해/판단 후 진행. 자율 실행의 불안 해소(특히 설계 후).

## Current Repository Understanding
- `TeamRunExecutor.executeFrom`: order 순회, 역할 완료 후 다음으로. **post-run write review**
  (status `awaiting-review` + approval stepId `post-run-review`, 루프 끝)와 **pre-dispatch**
  (`awaiting-approval`) 게이트가 이미 있음. `decide`(pre-dispatch), `review`(post-run) + `resume`
  (비종료부터 재개; awaiting-review/approval은 게이트 유지). `upsertApproval`/`skipRolesAfter`/
  `replaceRole` 헬퍼. 이벤트 EventLogger.
- 게이트 패턴 정립됨 → **체크포인트는 동일 패턴을 루프 중간에** 적용하면 됨.
- `TeamRole`(teamPlan.schema): id/name/description/assignedAgentId/instructions/reportsTo?.
  **checkpoint 없음**(추가). `role.explanation`(L1)이 체크포인트에서 읽을 내용.
- `TeamRunStatus`: planned/awaiting-approval/running/awaiting-review/completed/failed/cancelled.
  **awaiting-checkpoint 없음**(추가).
- 플래너 buildPlanPrompt: 역할 생성. checkpoint 표시 지시 추가 가능.
- CLI `plan run`: start/approve/reject/review/show/list. continue 추가.

## Relevant Files
| File | Reason |
|---|---|
| `schemas/teamPlan.schema.ts` | `TeamRole.checkpoint?` |
| `schemas/teamRun.schema.ts` | `awaiting-checkpoint` 상태 |
| `core/projects/planner.ts` | 체크포인트 표시 프롬프트 |
| `core/teamRuns/TeamRunExecutor.ts` | 체크포인트 멈춤 + `continueCheckpoint` + resume |
| `cli/commands/project.ts` | `plan run continue` + show 설명 |
| 각 `*.test.ts` | 스키마/실행기/CLI |

## Existing Behavior
승인 후 모든 역할이 끝까지 자동 진행(쓰기면 끝에 diff 검토). 중간 멈춤 없음.

## Target Behavior
`checkpoint=true` 역할이 **성공 완료**하면, 다음으로 가기 전에 status `awaiting-checkpoint` +
pending approval(stepId `checkpoint:<roleId>`)로 멈춤. 사람이 `show`로 그 역할의 explanation/출력을
읽고 → `plan run continue <id>`(진행) 또는 `--reject`(중단). continue 시 resume으로 다음 역할 진행.
여러 체크포인트는 각각 멈춤. 읽기전용/쓰기/stub 모두 동작.

## Constraints
- TS 단독. **Swift 체크포인트 UI는 L3**(그 전엔 CLI continue). `checkpoint?`/`awaiting-checkpoint`는
  추가(회귀 0). 안전 정책(승인 게이트·worktree·읽기전용·credential) 불변.
- 체크포인트는 **성공 완료 시에만** 멈춤(실패는 기존대로 정지). 승인된 체크포인트는 재멈춤 없음.
- 기존 pre-dispatch/post-run review 게이트와 **합성**(중간 체크포인트 → 끝 diff 검토 순서대로).

## Assumptions
- 안전: 체크포인트 표시는 플래너(설계/계획 성격) 또는 사용자 편집. 실행기는 flag만 honor(누가
  설정했든). stub도 동작(설명은 L1 합성).
- resume 재진입 시 완료(terminal) 체크포인트 역할은 루프가 skip → 재멈춤 안 함. 다음 미승인
  체크포인트에서 멈춤.

## Open Questions
없음. 질문/수정은 후속(L2.1).

## Risks
- 재멈춤 루프(continue 후 같은 체크포인트 재정지) → 완료 역할 terminal skip + 승인 확인으로 차단. 테스트.
- 게이트 합성 복잡(체크포인트+pre/post) → 각 게이트는 return-후-재진입 패턴 동일, 순차 처리.
- Swift 미지원 구간 → 앱에서 awaiting-checkpoint면 멈춰 보임(continue 버튼 없음) → CLI 안내 + L3에서 UI.

## Recommendation
`TeamRole.checkpoint?` + `awaiting-checkpoint` + 실행기 멈춤/continueCheckpoint/resume + CLI
continue + show 설명. 플래너 표시. TS 단독, stub 헤드리스. 게이트 pnpm typecheck/test/build 회귀 0.
