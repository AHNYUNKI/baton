# Analysis

## User Request
이벤트 트리거형 단발 디스패치에 **컨텍스트 릴레이**를 추가. 트리거가 다음 역할 AI를 깨울 때
상위(보고 체인) 역할의 결과를 요청에 실어 전달. 토큰 절약(보고 체인만·요약·절단·경로 참조).
단방향 유지. stub·headless.

## Intent
"대표가 이전 작업 결과를 받아 다음 역할에 넘긴다"를 **저비용**으로 구현. 양방향 채팅 아님 —
요청 페이로드에 컨텍스트를 동봉하는 단방향 릴레이.

## Current Repository Understanding (v0.19 코드)
- `TeamRunExecutor.executeFrom`: `teamRun.order` 순회 → 역할별 running → `invokeWorker`
  (→ `buildRolePrompt`) → 아티팩트(`logs/<roleId>.*`, `steps/<roleId>.result.json`) → completed/
  failed. 실패 시 잔여 skipped + failed. 이벤트 `teamRun.role.*`.
- `buildRolePrompt({project, role, teamPlan, runDirectory})`: overview + 역할 메타/지침 +
  동료 역할 목록 + 산출물 경로. **이전 역할 산출물 미포함.**
- `WorkerRunResult`: {success, exitCode, stdout, stderr, durationMs, artifacts, metadata?}.
- `TeamRunRole`(teamRun.schema): {roleId, name, assignedAgentId, status, startedAt?,
  completedAt?, reason?, artifacts?}. **요약 필드 없음.**
- `order.ts`: reportsTo BFS + 사이클 방어(`hasCyclicAncestry`). 동일 패턴 재사용 가능.
- `events.jsonl` + `baton watch`(NDJSON) = SSE형 스트림 이미 존재.

## Relevant Files
| File | Reason |
|---|---|
| `packages/core/src/teamRuns/collectUpstream.ts`(신규) | 보고 체인 상위 roleId(순수) |
| `packages/core/src/teamRuns/summarizeResult.ts`(신규) | 결과 요약·절단(토큰 가드, 순수) |
| `packages/core/src/teamRuns/buildRolePrompt.ts` | upstream 컨텍스트 섹션 추가 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | 완료 시 summary 저장 + 호출 전 upstream 주입 |
| `packages/schemas/src/teamRun.schema.ts` | `TeamRunRole.summary?` 추가(선택, 영속/관찰용) |
| 각 `*.test.ts` | 순수/실행기 릴레이 테스트 |

## Existing Behavior
각 역할이 독립적으로 실행. 다음 역할은 이전 역할 결과를 모른다.

## Target Behavior
역할 호출 직전, **보고 체인(root→…→직속 부모)** 중 **완료된** 역할들의 {이름, 담당AI, 상태,
요약, 산출물 경로}를 `buildRolePrompt`의 "Upstream Context" 섹션으로 동봉. 각 요약은 최대
길이로 절단(기본 ~1500자), 산출물은 경로만(내용 미포함). 역할 완료 시 `summary`를 role에
영속(resume·관찰 대비). 트리거 이벤트(`teamRun.role.started`)에 `upstreamRoleIds` 기록.

## Constraints
- **토큰 효율(1순위)**: 전체 누적 금지. **보고 체인만**(O(깊이)). 역할별 요약 절단, 산출물 경로
  참조. 릴레이 예산은 옵션(기본값)으로 조절.
- **단방향·이벤트 트리거 유지**: 채팅 루프/상시 LLM 대표 도입 금지. 역할당 1회 호출.
- **stub·headless**: 실제 codex/claude 디스패치 금지(다음). Swift 금지(그 다음).
- **하위호환**: `summary`는 선택 필드(기존 team-run 회귀 0). 기존 Run/CLI 불변.
- 사이클/미존재 부모는 order.ts와 동일하게 방어(보고 체인 끊김 → 상위 없음).

## Assumptions
- 릴레이 경로 = **보고 체인**(reportsTo 상향). 명시적 데이터 의존(`dependsOn`)·형제 릴레이는
  후속 확장(범위 밖). 보고 체인이 위임 메타포에 부합하고 토큰 경계가 명확.
- 완료된 상위만 컨텍스트에 포함(running/실패/skip 상위는 요약 없음 → 표기 생략 또는 상태만).
- summary는 stub stdout 기준이라 의미는 작지만, **배선·절단·영속·주입 경로**를 검증(실제
  디스패치 때 그대로 동작).

## Open Questions
없음(모델은 사용자와 확정). 릴레이 범위는 보고 체인으로 시작(형제/explicit deps 후속).

## Risks
- 요약 미절단 시 토큰 폭증 → `summarizeResult`로 강제 절단 + 테스트.
- resume 시 메모리 유실 → `summary`를 role에 영속(파일 재파싱 불필요).
- 보고 체인 사이클/깊이 → order.ts 패턴 재사용(방어), O(깊이) 경계.
- 스키마 변경이지만 선택 필드 추가 → 회귀 위험 낮음.

## Recommendation
순수 `collectUpstream`(보고 체인) + `summarizeResult`(절단) + `buildRolePrompt` upstream 섹션 +
`TeamRunRole.summary?`(영속) + `TeamRunExecutor`(완료 시 summary 저장, 호출 전 upstream 주입,
트리거 이벤트에 upstreamRoleIds). stub·headless, 게이트 `pnpm typecheck/test/build` 회귀 0.
