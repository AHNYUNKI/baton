# Acceptance Criteria — org-hierarchy-v0.18.3

## Schema (TS, pnpm test)
- [ ] AC-01 `TeamRoleSchema`에 `reportsTo`가 **optional/nullable**로 추가된다(부재/null/유효
  문자열 모두 수용). `TeamRole` 타입에 `reportsTo?: string|null` 반영.
- [ ] AC-02 `TeamPlanSchema.superRefine`은 기존 고유 id 검사를 유지한다. 참조/순환은 스키마에서
  reject하지 않는다(플래너 보정으로 흡수).

## Planner (TS, pnpm test)
- [ ] AC-03 `normalizeHierarchy(plan)`(export, 순수): reportsTo가 미존재 id / 자기참조 / 순환을
  만들면 해당 role의 reportsTo를 제거(대표 직속)한다. 4케이스 단위 테스트(정상 유지/미존재/
  자기/순환). `parsePlanFromResult`에서 clampAssignedAgents 후 적용된다.
- [ ] AC-04 `buildPlanPrompt` 출력에 `reportsTo` 필드와 **한국어 계층 생성 규칙**(2~3단계,
  대표 직속 매니저 + 매니저 보고, 평면 지양, 순환 금지)이 포함된다(테스트).

## Swift contract & edit round-trip (swift test)
- [ ] AC-07 `TeamRole`이 `reportsTo: String?`를 가지며 JSON 키 부재/null을 nil로 디코딩한다(테스트).
- [ ] AC-08 `EditableTeamRole`/`TeamPlanEditModel.toTeamPlan()`이 `reportsTo`를 라운드트립
  보존한다(편집 시 계층 유실 없음, 테스트).

## Org chart model (swift test)
- [ ] AC-05 `buildOrgChart`가 평면 roles + reportsTo로 **트리**(roots + children + depth)를
  만든다. roots = 대표 직속(reportsTo nil). `OrgChart{leadAgentId,hasPlan,roots}`.
- [ ] AC-06 방어 케이스 단위 테스트: 다단계 중첩, 평면(reportsTo 없음)→전부 roots(하위호환),
  미존재 parent→root, 자기참조→root, 순환→끊어 root, depth 계산, status·agent 매핑,
  teamPlan 없음→hasPlan=false & roots=[].

## Org chart view (manual QA)
- [ ] AC-09 `OrgChartView`가 대표(👑) 정점에서 **다단계 트리**를 직각(elbow) 연결선으로 렌더한다.
  노드 = 가로 카드(원형 역할 아이콘 + 상태점 + 직함 + 부제 + 담당 AI). 캔버스 패닝(가로/세로).
- [ ] AC-10 상태는 **점 + 한국어 라벨**(완료/실행 중/승인 대기/대기/실패) 병기 — 색만으로 구분
  하지 않는다. agent tint claude=보라/codex=주황. 하단 범례 제공.
- [ ] AC-11 (옵션) 역할 편집에 "보고 대상" Picker(대표/다른 역할)가 있으면 선택이 저장 후
  계층에 반영된다(자기/순환은 normalize가 흡수). 미구현 시 라운드트립 보존(AC-08)으로 충족.

## Safety & gates
- [ ] AC-12 기존 plan(reportsTo 부재)은 대표 직속 1단계로 그대로 렌더(하위호환). 데이터
  마이그레이션 불필요. 앱은 `baton` CLI 읽기만, 새 CLI/HTTP/credential 없음.
- [ ] AC-13 루트 `pnpm typecheck && pnpm test && pnpm build` 통과(신규 테스트 포함, 회귀 0).
- [ ] AC-14 `swift build` + `swift test` 통과. README/UX에 계층 조직도 IA + 수동 QA 갱신.
  UI 한국어 + paperclip 톤.
