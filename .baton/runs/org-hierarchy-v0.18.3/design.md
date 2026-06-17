# Implementation Design — org-hierarchy-v0.18.3

## Summary

`TeamPlan`에 **보고구조(`reportsTo`)** 를 추가하여 조직도를 평면 나열에서 **다단계 계층
트리**로 승격한다. 대표(agent)를 정점으로, `reportsTo`가 null인 역할은 대표 직속, 나머지는
지정 매니저 역할의 자식으로 중첩된다. Paperclip식 가로형 노드 카드 + 직각(elbow) 연결선 +
패닝 캔버스. 스키마는 **순수 추가(optional)** 라 기존 plan은 1단계로 그대로 렌더(하위호환).
TS(스키마+플래너) + Swift(계약/모델/뷰/편집) 혼합 마일스톤.

## Scope

### In Scope
- **TS**: `TeamRoleSchema.reportsTo?`(optional, nullable) 추가; 플래너 프롬프트 계층 지시;
  `normalizeHierarchy(plan)` 보정(미존재/자기참조/순환 → 대표 직속) + 테스트.
- **Swift BatonKit**: `TeamRole.reportsTo` 디코딩; `OrgChartModel.buildOrgChart` →
  트리(roots+children+depth, 방어 포함) + 테스트; `EditableTeamRole`/`toTeamPlan` 보존.
- **Swift BatonApp**: `OrgChartView` 다단계 elbow 트리 + 가로 노드 카드(아이콘+상태점+
  직함+부제+담당AI) + 범례 + 패닝; (옵션) 편집에 "보고 대상" Picker.
- README/UX 갱신.

### Out of Scope
- 실행 엔진/디스패치/라이브 점등(v0.19), 스킬(v0.20).
- 드래그 재배치(드래그&드롭) UI — 편집은 Picker 수준까지만.
- 새 CLI 명령. 멀티 워크스페이스.

## Proposed Architecture

### 데이터 모델 (TS)
```ts
// teamPlan.schema.ts
TeamRoleSchema = z.object({
  id, name, description, assignedAgentId, instructions,
  reportsTo: z.string().trim().min(1).nullish()   // 신규: 상위 role.id, 없으면 대표 직속
})
// superRefine: 기존 고유 id 검사 유지. (참조/순환 무결성은 플래너 normalizeHierarchy로 보정)
```
의미: `reportsTo` = 같은 plan 내 매니저 역할의 `id`. `null`/부재 ⇒ 대표(leadAgentId) 직속.

### 플래너 (TS)
- `buildPlanPrompt`: JSON 예시에 `reportsTo` 추가 + 한국어 규칙
  - "2~3단계 계층을 만들 것. 일부 역할은 대표 직속 매니저(reportsTo: null), 나머지는 매니저의
    id를 reportsTo로. 전부 평면(all null) 지양, 관련 역할을 매니저 밑에 묶기."
  - "reportsTo는 같은 plan의 존재하는 role id이거나 null. 순환 금지."
- `normalizeHierarchy(plan): TeamPlan`(신규, export):
  - reportsTo가 미존재 id | 자기참조(`=== id`) | 순환을 만들면 → 해당 role.reportsTo = null.
  - `parsePlanFromResult`에서 `clampAssignedAgents` 후 적용.

### Swift 계약/모델
```swift
// Contract/TeamPlan.swift
TeamRole { ...; let reportsTo: String? }   // Codable 자동(키 부재/null 허용)

// Org/OrgChartModel.swift
OrgChartNode { roleId, name, description, assignedAgentId, status, reportsTo: String? }
OrgChartTreeNode: Identifiable { let node; let children: [OrgChartTreeNode]; let depth: Int }
OrgChart { leadAgentId: String?; hasPlan: Bool; roots: [OrgChartTreeNode] }  // 대표 아래 최상위들

buildOrgChart(project, teamPlan?, statusByRole?) -> OrgChart:
  - 평면 roles → roleId→node 맵.
  - parent = reportsTo. 미존재/자기/순환 방어 → 해당 노드를 root로(=대표 직속).
  - roots = reportsTo==nil(보정 후) 노드. children 재귀 구성, depth 계산.
  - teamPlan 없음 → hasPlan=false, roots=[].
```

### Swift 뷰 (OrgChartView)
```text
ScrollView([.horizontal,.vertical]) {           // 패닝 캔버스
  VStack {
    leadCard(👑, gradient ring, 대표 displayName, "대표 AI")
    if !roots.isEmpty { elbowConnector(children: roots) }
    HStack(top) { ForEach roots { subtree($0) } }
  }
}
subtree(treeNode) = VStack {
  nodeCard(treeNode.node)                          // 가로 카드
  if !children.isEmpty { elbowConnector(children) ; HStack(top){ ForEach children { subtree } } }
}
nodeCard: HStack[ circular avatar(roleIcon)+상태점 badge,
                  VStack(직함 bold, 부제=description muted lineLimit2, 담당AI 라벨) ]
          agent tint: claude=보라, codex=주황. status 점+짧은 라벨(완료/진행 중/승인 대기/대기…).
elbowConnector: 부모 하단center→수직 드롭→자식 중심 가로 버스→각 자식 상단center 수직 드롭.
하단 범례: 상태색(완료/실행 중/승인 대기/대기) + Claude/Codex 배지. (색만으로 구분 금지: 라벨 병기)
```

### 편집 모델
- `EditableTeamRole`에 `reportsTo: String?` 추가, `init(role:)`/`toTeamRole()`에서 보존.
- (옵션) `ProjectPlanView` 역할 편집에 "보고 대상" Picker(대표 / 다른 역할) — 자기/순환 선택은
  저장 시 normalize가 흡수하므로 UI는 단순 Picker로 충분.

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/teamPlan.schema.ts` | `reportsTo` optional/nullable 추가 |
| `packages/core/src/projects/planner.ts` | 프롬프트 계층 지시 + `normalizeHierarchy` + 적용 |
| `packages/core/src/projects/planner.test.ts`(있으면) / 신규 | normalizeHierarchy/프롬프트 테스트 |
| `packages/schemas/src/teamPlan.schema.test.ts`(있으면) / 신규 | reportsTo 수용/고유 id |
| `apps/macos/Baton/Sources/BatonKit/Contract/TeamPlan.swift` | `TeamRole.reportsTo` |
| `apps/macos/Baton/Sources/BatonKit/Org/OrgChartModel.swift` | 트리 빌드 + 방어 |
| `apps/macos/Baton/Sources/BatonKit/Forms/TeamPlanEditModel.swift` | reportsTo 라운드트립 |
| `apps/macos/Baton/Sources/BatonApp/OrgChartView.swift` | 다단계 트리 + 가로 카드 |
| `apps/macos/Baton/Sources/BatonApp/ProjectPlanView.swift`(옵션) | 보고 대상 Picker |
| `apps/macos/Baton/Tests/BatonKitTests/OrgChartModelTests.swift` | 트리 케이스 |
| `apps/macos/Baton/Tests/BatonKitTests/TeamPlanEditModelTests.swift`(있으면) | 라운드트립 |
| `apps/macos/README.md`/`UX.md` | 계층 조직도 IA + 수동 QA |

## Data Model Changes

`TeamRole`에 `reportsTo?: string|null` 추가(TS+Swift). **순수 추가** — 기존 plan.json은
필드 부재 → null 취급 → 대표 직속 1단계(현행 동일). 데이터 마이그레이션 불필요.

## API / CLI Changes

없음. `team-plan` 봉투는 `TeamPlanSchema`를 그대로 사용 → `reportsTo`가 자동 통과.
새 명령/플래그 없음.

## Workflow Changes

플래너가 계층을 생성하도록 프롬프트/보정 추가. 실행(v0.19)은 본 마일스톤 범위 밖이나,
`reportsTo`가 향후 위임 순서(대표→매니저→실무)의 토대가 됨.

## Error Handling

- 잘못된 `reportsTo`(미존재/자기/순환): 플래너 `normalizeHierarchy` + Swift `buildOrgChart`
  양쪽에서 "대표 직속"으로 보정(throw 금지). 생성/렌더 실패 없음.
- teamPlan/프로젝트 없음: 조직도 빈 상태 안내(기존).
- 깊거나 넓은 트리: 스크롤/패닝으로 흡수.

## Security Considerations

앱은 기존 `baton` CLI 읽기만. `.baton` 직접 변경/credential/HTTP 없음. 신규 명령 없음.

## Test Plan

`test-plan.md` 참조. TS: schema(reportsTo 수용/고유 id), planner(normalizeHierarchy 4케이스,
프롬프트에 reportsTo+한국어 계층 규칙). Swift: buildOrgChart 트리(다단계/평면/미존재→root/
순환 방어/depth/status·agent 매핑), EditableTeamRole 라운드트립, TeamRole 디코딩(키 부재).
뷰는 swift build 컴파일 + 수동 QA. 루트 `pnpm typecheck/test/build` 통과(신규 포함).

## Acceptance Criteria

`acceptance-criteria.md` AC-01~14.

## Non-Goals

실행/디스패치/라이브 점등(v0.19), 스킬(v0.20), 드래그 재배치, 새 CLI.

## Review Checklist

- [ ] `reportsTo` optional/nullable — 기존 plan(필드 부재) 회귀 0(평면 1단계 렌더).
- [ ] 플래너 normalizeHierarchy: 미존재/자기/순환 → 대표 직속 보정(throw 아님), 테스트.
- [ ] buildOrgChart 순수 트리 + 동일 방어, 테스트. 편집 라운드트립 reportsTo 보존.
- [ ] OrgChartView 다단계 elbow 트리 + 가로 카드(아이콘/상태점/부제/담당AI), 색+라벨 병기.
- [ ] credential/HTTP/새 CLI 없음. UI 한국어/paperclip. 양쪽 게이트 통과.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-org-hierarchy
  -b baton/org-hierarchy-v0.18.3 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD` 로 base 확인.
- 본 마일스톤은 **TS(스키마+플래너) + Swift(GUI) 혼합**. 양쪽 게이트 모두 통과해야 함.
- 머지 후 worktree 즉시 제거.
- **commit/push 하지 말 것**(리뷰 후 본 에이전트가 진행).

### Goal
`TeamPlan`에 `reportsTo`(상위 role.id, null=대표 직속)를 추가하여 조직도를 **다단계 계층
트리**로 만든다. 플래너가 2~3단계 계층을 생성하고(잘못된 보고는 "대표 직속"으로 보정),
Swift `OrgChartModel`이 트리를 빌드(동일 방어), `OrgChartView`가 Paperclip식 가로 노드
카드 + 직각(elbow) 연결선 + 패닝 캔버스로 렌더한다. 기존 plan(reportsTo 없음)은 1단계로
그대로 표시(하위호환). **실행/점등은 범위 밖(v0.19).**

성공 기준은 화면이 아니라 **(1) 스키마 순수 추가·회귀 0, (2) 플래너 normalizeHierarchy 보정
테스트, (3) buildOrgChart 트리 + 방어 테스트, (4) 편집 라운드트립 보존, (5) 양쪽 게이트**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/org-hierarchy-v0.18.3/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드: `teamPlan.schema.ts`, `planner.ts`(clampAssignedAgents 패턴),
   `OrgChartModel.swift`, `OrgChartView.swift`, `TeamPlan.swift`, `TeamPlanEditModel.swift`,
   `BatonTheme.swift`, `AgentCatalog`(ids: `codex`,`claude`), `StatusDisplay`(tint),
   `lead-teamplan-v0.17`, `app-shell-org-v0.18`.
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify
- **TS**:
  - `packages/schemas/src/teamPlan.schema.ts`: `TeamRoleSchema`에
    `reportsTo: z.string().trim().min(1).nullish()`. superRefine 고유 id 유지(참조/순환은
    스키마에서 reject하지 말 것 — 플래너 보정으로 흡수).
  - `packages/core/src/projects/planner.ts`:
    - `buildPlanPrompt`: JSON 예시에 `reportsTo`(예: null) 추가 + 한국어 규칙
      ("2~3단계 계층, 일부는 대표 직속 매니저(reportsTo: null), 나머지는 매니저 id로 보고,
      전부 평면 지양, reportsTo는 존재하는 role id이거나 null, 순환 금지").
    - `export function normalizeHierarchy(plan: TeamPlan): TeamPlan` — 각 role의 reportsTo가
      (a) 미존재 id, (b) 자기참조, (c) 순환을 만들면 `undefined`로(대표 직속). 순수.
    - `parsePlanFromResult`에서 `clampAssignedAgents` 결과에 `normalizeHierarchy` 적용.
  - 테스트: schema(reportsTo 수용/고유 id 위반 거부), planner(normalizeHierarchy 4케이스 +
    buildPlanPrompt에 reportsTo·한국어 계층 문구 포함). 기존 테스트 파일 패턴을 따르라.
- **Swift BatonKit**:
  - `Contract/TeamPlan.swift`: `TeamRole`에 `public let reportsTo: String?` 추가
    (init 갱신, Codable 기본 — 키 부재/null 디코딩 OK). 기존 호출부 컴파일 보정.
  - `Org/OrgChartModel.swift`: `OrgChartNode`에 `description: String`, `reportsTo: String?`
    추가. `OrgChartTreeNode { let node: OrgChartNode; let children: [OrgChartTreeNode];
    let depth: Int; var id { node.roleId } }`(Identifiable/Equatable/Sendable).
    `OrgChart`를 `{ leadAgentId: String?; hasPlan: Bool; roots: [OrgChartTreeNode] }`로 변경.
    `buildOrgChart`가 평면 roles→트리(미존재/자기/순환 reportsTo → root로 방어, depth 계산).
  - `Forms/TeamPlanEditModel.swift`: `EditableTeamRole`에 `reportsTo: String?`,
    `init(role:)`/`toTeamRole()`에서 보존(편집 시 계층 유실 금지). isValid 영향 없음.
- **Swift BatonApp**:
  - `OrgChartView.swift`: 다단계 트리 렌더. `ScrollView([.horizontal,.vertical])` 패닝.
    대표 카드(👑, gradient ring) → 재귀 `subtree` (가로 노드 카드 + elbow 연결선 + 자식 HStack).
    노드 카드 = 원형 역할 아이콘(SF Symbol, 상태점 badge) + 직함(bold) + 부제(description,
    lineLimit) + 담당 AI 라벨. agent tint claude=보라/codex=주황. 상태는 점 + 짧은 한국어
    라벨(완료/실행 중/승인 대기/대기/실패 등) — **색만으로 구분 금지**. 하단 범례.
  - (옵션) `ProjectPlanView.swift`: 역할 편집에 "보고 대상" Picker(대표 / 다른 역할).
    선택을 `updateReportsTo`로 모델에 반영(자기/순환은 normalize가 흡수).
  - 테스트: `OrgChartModelTests`(다단계 중첩, 평면(reportsTo 없음)→대표 직속 roots, 미존재
    parent→root, 자기/순환→root 방어, depth, status·agent 매핑, teamPlan 없음→hasPlan=false),
    `TeamPlanEditModelTests`(reportsTo 라운드트립 보존), TeamRole 디코딩(키 부재→nil).
- **문서**: `apps/macos/README.md`/`UX.md` 계층 조직도 IA + 수동 QA 체크리스트.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용).
- 새 CLI 명령/플래그 금지. HTTP/네트워크 금지. credential 접근 금지.
- 실행 엔진/디스패치/라이브 점등(v0.19), 스킬(v0.20) 금지.
- 기존 화면/명령 삭제 금지(보존). `reportsTo`는 **optional** — 기존 plan 회귀 0.

### Step-by-Step Plan
1. 설계/태스크 + 기존 코드 읽기.
2. **TS 스키마**: `reportsTo` optional/nullable 추가 + 테스트. 루트 게이트 1차 확인.
3. **TS 플래너**: 프롬프트 계층 지시 + `normalizeHierarchy` + 적용 + 테스트.
4. **Swift 계약**: `TeamRole.reportsTo` + 호출부 컴파일.
5. **Swift 모델**: `buildOrgChart` 트리 + 방어 + 테스트.
6. **Swift 편집**: `EditableTeamRole.reportsTo` 라운드트립 + 테스트.
7. **Swift 뷰**: `OrgChartView` 다단계 elbow 트리 + 가로 카드 + 범례 + 패닝. (옵션 Picker)
8. README/UX + 전체 게이트(아래) + 자체 diff 리뷰 + 최종 요약(UI 수동 QA·보정 동작 명시).

### Test / Gate Commands
```bash
# 루트 (TS)
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
# GUI (Swift)
cd apps/macos/Baton && swift build && swift test
```
명령 미실행/실패는 정직히 보고. 뷰는 swift build 컴파일 + 수동 QA(트리 렌더).

### Acceptance Criteria
`.baton/runs/org-hierarchy-v0.18.3/acceptance-criteria.md` AC-01~14. 특히: reportsTo
순수 추가·회귀 0(AC-01/12), normalizeHierarchy 보정 테스트(AC-03), buildOrgChart 트리+방어
테스트(AC-05/06), 편집 라운드트립(AC-08), 다단계 elbow 렌더+색/라벨 병기(AC-09/10),
양쪽 게이트(AC-13/14).

### Constraints
- Swift 6 concurrency 준수. View 얇게, 로직 BatonKit(테스트). paperclip/한국어.
- 스키마 `reportsTo`는 **optional/nullable**(기존 plan 회귀 0). "거부보다 보정"(throw 금지).
- 편집 라운드트립에서 reportsTo 보존 필수. credential/HTTP/새 CLI 없음.
- base = `origin/main`. **commit/push 금지**.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표: TS / Swift 구분)
## Commands Run (표: 루트 pnpm typecheck/test/build + swift build/test)
## Tests (Passing TS / Passing Swift / Failing / 수동 QA만(UI 트리 렌더))
## Hierarchy Behavior (정상 계층 / 미존재·자기·순환 보정 / 기존 평면 plan 하위호환)
## Risks / TODOs (실행 v0.19, 스킬 v0.20, 드래그 재배치 미구현)
## Notes for Reviewer (reportsTo optional·회귀 0, normalizeHierarchy, 편집 라운드트립)
```
명령 미실행/테스트 실패는 정직히 보고.
