# Analysis

## User Request

조직도를 Paperclip 실제 화면처럼 **다단계 계층 트리**로. 대표 → 매니저 → 실무.
가로형 노드 카드(원형 아이콘 + 상태 점 + 직함 + 부제 + 담당 AI), 직각 연결선, 패닝 캔버스.

## Intent

평면 역할 나열을 **보고구조가 있는 조직도**로 승격. 대표가 매니저급에 위임하고
매니저가 하위 실무 역할을 거느리는, 회사 조직도 형태. 이는 v0.19(대표→역할 위임 실행)의
위임 경로와도 일치한다.

## Current Repository Understanding

- **TS 스키마** `packages/schemas/src/teamPlan.schema.ts`: `TeamRoleSchema`
  = {id,name,description,assignedAgentId,instructions}; `TeamPlanSchema` = {roles[]} +
  superRefine(고유 id). `assertPlanAgents`(assignedAgentId∈agentIds).
- **플래너** `packages/core/src/projects/planner.ts`: `buildPlanPrompt`(영문 지시+한국어
  콘텐츠 규칙), `generateTeamPlan`(bounded retry 2), `extractJson`(lenient),
  `clampAssignedAgents`(잘못된 agent → fallback 보정, reject 아님). **"거부보다 보정"** 철학.
- **read API** `readApi.schema.ts`: `TeamPlanEnvelopeSchema`가 `TeamPlanSchema`를 그대로
  data로 사용 → 스키마에 필드 추가 시 `team-plan` 봉투로 앱까지 자동 전달.
- **Swift 계약** `BatonKit/Contract/TeamPlan.swift`: `TeamRole`/`TeamPlan` Codable(평면).
- **Swift 모델** `BatonKit/Org/OrgChartModel.swift`: `buildOrgChart` → `OrgChart{leadAgentId,
  hasPlan, nodes:[OrgChartNode{roleId,name,assignedAgentId,status}]}` (평면 리스트).
- **Swift 뷰** `BatonApp/OrgChartView.swift`: 대표 카드 → 단일 가로 막대 → `LazyVGrid`
  평면 그리드(역할 카드). 노드별 분기선 없음, 다단계 없음.
- **편집 모델** `BatonKit/Forms/TeamPlanEditModel.swift`: `EditableTeamRole` ↔ `TeamRole`
  왕복. `toTeamPlan()`이 역할을 **재생성**하므로 새 필드는 여기서도 보존해야 편집 시 유실 안 됨.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/teamPlan.schema.ts` | `reportsTo` 필드 + 검증 추가 |
| `packages/core/src/projects/planner.ts` | 프롬프트에 계층 지시, `normalizeHierarchy` 보정 |
| `apps/macos/Baton/Sources/BatonKit/Contract/TeamPlan.swift` | `TeamRole.reportsTo` 디코딩 |
| `apps/macos/Baton/Sources/BatonKit/Org/OrgChartModel.swift` | 평면→트리 빌드 |
| `apps/macos/Baton/Sources/BatonApp/OrgChartView.swift` | 다단계 elbow 트리 + 가로 노드 카드 |
| `apps/macos/Baton/Sources/BatonKit/Forms/TeamPlanEditModel.swift` | `reportsTo` 라운드트립 보존 |
| `packages/schemas/src/readApi.schema.ts` | (자동) team-plan 봉투 통과 — 변경 거의 없음 |

## Existing Behavior

대표(👑) 1개 + 역할 N개가 동일 레벨 그리드로 표시. 보고관계 없음.

## Target Behavior

대표를 정점으로, `reportsTo`가 없는 역할은 대표 직속(최상위 티어), `reportsTo`가 가리키는
역할의 자식으로 중첩되어 **다단계 트리**가 렌더된다. 노드 = 가로 카드(아이콘+상태점+직함+
부제+담당AI), 부모→자식은 직각 연결선. 캔버스 패닝(가로/세로 스크롤).

## Constraints

- **하위호환**: 기존 plan(=reportsTo 없음)은 전부 대표 직속 1단계 → 현재와 동일하게 보임.
- **거부보다 보정**(기존 철학 유지): 잘못된 `reportsTo`(미존재 id/자기참조/순환)는 플래너의
  `normalizeHierarchy`가 "대표 직속"으로 보정. 스키마는 구조 검증(타입/고유 id)만, 트리
  무결성은 보정으로 흡수해 생성 실패율을 높이지 않는다. Swift 모델도 동일 방어를 미러링.
- **편집 라운드트립**: `EditableTeamRole`/`toTeamPlan()`에 `reportsTo` 보존 필수(미보존 시
  편집 한 번에 계층 소실).
- **격리/안전**: 앱은 기존 `baton` CLI만(읽기). 새 CLI 없음. credential/HTTP 없음.
- UI 라벨 한국어, 식별자/필드명 영어(`reportsTo`). paperclip 다크/크림/그라데이션 톤.

## Assumptions

- 안전: `reportsTo`는 같은 plan 내 다른 role의 `id`(또는 null=대표 직속). 매니저=역할 노드이며
  대표(agent)와는 구분.
- 안전: 정상 plan은 2~3 레벨. 깊이 제한은 두지 않되 사이클은 보정으로 차단.
- 위험(낮음): 플래너가 계층을 잘 안 만들고 전부 null로 평면 출력할 수 있음 → 프롬프트로
  유도하되, 평면이어도 유효(하위호환). 품질은 후속 튜닝.

## Open Questions

없음(범위는 AskUserQuestion으로 확정). 편집 UI에서 보고대상 변경은 최소 Picker로 제공하되
핵심 AC는 "라운드트립 보존".

## Risks

- 스키마 변경이지만 **순수 추가(optional)** → 기존 데이터/테스트 회귀 위험 낮음.
- Swift 트리 렌더 복잡도(연결선 정렬). 로직(트리 빌드)은 순수 모델로 테스트, 선 그리기는
  수동 QA. 깊은/넓은 트리는 스크롤로 흡수.
- v0.19 실행이 이 계층을 위임 순서로 쓸 수 있으므로, 스키마가 v0.19의 토대가 됨(좋은 의존).

## Recommendation

`teamPlan.schema.ts`에 `reportsTo?: string|null`을 추가(순수 추가) → 플래너 프롬프트에
계층 생성 지시 + `normalizeHierarchy` 보정 → Swift `TeamRole.reportsTo` 디코딩 →
`OrgChartModel`이 트리 빌드(방어 포함, 테스트) → `OrgChartView`를 다단계 elbow 트리 +
가로 노드 카드로 재구성 → 편집 모델 라운드트립 보존. 게이트는 TS+Swift 양쪽.
