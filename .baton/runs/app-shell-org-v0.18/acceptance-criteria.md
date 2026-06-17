# Acceptance Criteria

v0.18 앱 셸 IA + 조직도가 완료되려면 아래가 모두 충족되어야 한다.

## Navigation model (BatonKit, swift test)

- [ ] AC-01 `AppNavigationModel`이 사이드바 선택 상태를 표현한다: 섹션(대시보드/받은 함/
  실행/프로젝트(:id)/에이전트/설정) + 선택 프로젝트 탭(개요/계획/조직도/실행).
- [ ] AC-02 전이 규칙 단위 테스트: 프로젝트 선택 시 기본 탭(개요), 섹션 전환 시 상태 갱신,
  유효하지 않은 선택 방어.

## Org chart model (BatonKit, swift test)

- [ ] AC-03 `buildOrgChart(project, teamPlan, statusByRole?)`가 대표(leadAgentId) 정점 +
  역할 노드[roleId, name, assignedAgentId, status]를 만든다(순수).
- [ ] AC-04 케이스: teamPlan 없음 → 빈/안내 상태, 대표 없음(단일 AI) → 그 AI를 대표로,
  statusByRole 미제공 → 정적 기본 상태. 단위 테스트.

## Shell & routing (views, manual QA)

- [ ] AC-05 좌측 사이드바: 액션(새 실행·대시보드·받은 함[승인 수]) / 작업(실행) /
  프로젝트(색점+상태 목록) / 에이전트(AI 목록 + 대표 👑) / 하단 계정·설정.
- [ ] AC-06 사이드바 선택 시 본문이 해당 화면으로 라우팅된다(대시보드/실행/프로젝트/받은 함).
- [ ] AC-07 기존 화면(실행 목록/상세, 새 실행, 프로젝트 목록/생성, 계획)이 보존되어 셸
  안에서 접근 가능하다(회귀 없음).

## Project tabs & org chart view (manual QA)

- [ ] AC-08 프로젝트 상세에 탭: 개요 / 계획(기존 ProjectPlan) / **조직도** / 실행(placeholder).
- [ ] AC-09 `OrgChartView`가 `buildOrgChart` 결과를 paperclip 톤 트리로 렌더(대표 👑 정점,
  역할 노드 = 역할명 + 담당AI 배지 + 상태). 색만으로 상태 구분 안 함(라벨 병기).
- [ ] AC-10 "실행" 탭은 placeholder + "실행 엔진은 v0.19" 안내. 조직도 상태는 정적.

## Inbox (받은 함)

- [ ] AC-11 받은 함이 `run list`에서 awaiting-approval run만 보여준다(필터 순수 함수 테스트).

## Safety & gates

- [ ] AC-12 TS/CLI 미수정 — 데이터는 기존 명령에서만. 루트 `pnpm typecheck/test/build`
  회귀 0. 앱은 `baton` CLI만, credential 무접근.
- [ ] AC-13 `swift build` + `swift test`(네비/조직도/필터 모델) 통과.
- [ ] AC-14 한국어 라벨, paperclip 디자인. README/UX에 IA·조직도·수동 QA 체크리스트 갱신.
