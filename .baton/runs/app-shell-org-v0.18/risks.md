# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 평면 화면 → 셸 재구성 중 기존 네비/화면 회귀 | Med | Med | 기존 화면(RunsList/Projects/NewProject/ProjectPlan)을 **보존**하고 라우팅 destination으로 재배치만. RootView가 기존 store/client 재사용. swift build로 전체 컴파일 보장. |
| R2 | 검증 비대칭(셸/조직도 렌더 자동 테스트 불가) | High | Low | 네비게이션·조직도를 **순수 모델**로 분리해 swift test. View는 얇게 + 수동 QA 체크리스트. |
| R3 | 네비게이션 상태 일관성(섹션↔프로젝트↔탭) | Med | Low | `AppNavigationModel`로 선택 상태 단일화(enum). 전이 규칙 테스트(프로젝트 선택 시 탭 기본값 등). |
| R4 | 조직도 매핑 오류(역할/담당AI/대표) | Med | Med | `buildOrgChart`가 TeamPlan+project.leadAgentId로 노드 구성, assignedAgentId→AI 라벨. 역할 없음/대표 없음/teamPlan 없음 케이스 테스트. |
| R5 | TS 코어 회귀 | Low | Med | TS/CLI 미수정(데이터는 기존 명령). 루트 pnpm 게이트 회귀 0 확인. apps/macos만 변경. |
| R6 | 받은 함 필터 정확성 | Low | Low | run list에서 status==awaiting-approval만. 필터 순수 함수 테스트. |
| R7 | 에이전트 섹션 데이터 출처 모호 | Low | Low | 프로젝트별 agentIds + leadAgentId(대표 👑). 선택 프로젝트 없으면 빈/안내. |
| R8 | 조직도 상태가 정적이라 "안 도는 것처럼" 보임 | Low | Low | v0.18은 정적 상태(대기/계획) 표기 + "실행은 v0.19" 안내. 라이브 점등은 v0.19. 문서화. |
| R9 | 큰 화면 변경의 수동 QA 누락 | Med | Low | README/UX에 QA 체크리스트(섹션 전환/프로젝트 탭/조직도 표시/받은 함). |
