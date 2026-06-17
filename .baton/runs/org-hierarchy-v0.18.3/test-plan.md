# Test Plan — org-hierarchy-v0.18.3

게이트: 루트 **pnpm typecheck/test/build**(TS, 신규 포함·회귀 0) + **swift build/test**(Swift
모델). 뷰는 swift build 컴파일 + 수동 QA. 네트워크 없음.

## TS Unit Tests (pnpm test)

### teamPlan.schema
- `reportsTo` 부재 / `null` / 유효 문자열 → 파싱 성공.
- 고유 id 위반 → 거부(기존 동작 유지).
- 기존 평면 plan(필드 없음) → 그대로 통과(회귀 0).

### planner.normalizeHierarchy
- 정상 계층(존재하는 parent) → 변경 없음.
- 미존재 parent id → reportsTo 제거(대표 직속).
- 자기참조(reportsTo === id) → 제거.
- 순환(a→b→a) → 끊어 대표 직속으로(throw 금지).

### planner.buildPlanPrompt
- 출력 문자열에 `reportsTo` 포함.
- 한국어 계층 규칙 문구(2~3단계 / 대표 직속 매니저 / 순환 금지 등) 포함.

## Swift Unit Tests (swift test)

### TeamRole (Codable)
- JSON 키 부재 → reportsTo == nil.
- `"reportsTo": null` → nil. 값 있으면 보존.

### TeamPlanEditModel
- plan→Editable→toTeamPlan() 왕복 시 reportsTo 보존.

### OrgChartModel.buildOrgChart
- 다단계: 대표 직속 매니저 + 그 자식 → roots/children/depth 정확.
- 평면(reportsTo 없음): 모든 역할이 roots(하위호환).
- 미존재 parent → 해당 노드 root.
- 자기참조 → root.
- 순환 → 방어(끊어 root), 무한루프 없음.
- statusByRole 반영 / 미제공 시 정적 기본. agent 매핑.
- teamPlan 없음 → hasPlan=false, roots=[].

## Build / Manual QA
- `swift build`: OrgChartView(트리/elbow/가로 카드) 포함 컴파일.
- 수동 QA 체크리스트:
  - 대표 정점 → 다단계 트리(매니저→실무) elbow 연결선 표시.
  - 노드 = 가로 카드(아이콘+상태점+직함+부제+담당AI). 캔버스 패닝.
  - 상태 점 + 한국어 라벨 병기(색 단독 아님). 범례 표시.
  - 기존 평면 plan → 대표 직속 1단계로 정상 표시(하위호환).
  - 계획 편집 후 저장 → 계층(reportsTo) 유지.

## Isolation / Security
- 앱은 `baton` CLI 읽기만. `.baton` 직접 변경/credential/HTTP/새 CLI 없음.
- 스키마는 순수 추가(optional) → 기존 데이터/테스트 회귀 0.

## Out of Scope (테스트 비대상)
- 실행 엔진/디스패치/라이브 점등(v0.19), 스킬(v0.20), 드래그 재배치, SwiftUI 자동 UI 테스트.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build   # 회귀 0
cd apps/macos/Baton && swift build && swift test
```
