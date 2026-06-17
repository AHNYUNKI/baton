# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | AI가 스키마 안 맞는 출력(파싱 실패) | High | Med | 관대한 JSON 추출(프로즈/코드펜스 허용) + Zod 검증. 실패 시 교정 재시도(bounded). 끝까지 실패면 명확한 에러(억지 부분결과 금지). |
| R2 | 생성 재시도 무한 루프(CLAUDE.md 금지) | Low | High | 정수 하드 상한(기본 2). 매 시도 카운트++. 종료: 검증 통과/상한 소진. mock 호출 횟수로 단언. |
| R3 | 담당 AI가 project.agentIds 밖 | Med | Med | 생성 후 assignedAgentId를 agentIds로 클램프(또는 그 역할 거부+재시도). 편집/저장 시에도 검증. 테스트. |
| R4 | opt-in 실제 AI가 테스트/CI에 유입 | Low | High | 생성은 주입형 어댑터로 mock(실제 AI/네트워크 0). 실제 호출은 사용자 환경 + opt-in. lead 미가용 시 안내. |
| R5 | TeamPlan 저장/검증 누락(손상 plan 저장) | Low | Med | setTeamPlan은 TeamPlanSchema 검증 통과만 저장(역할 id 유일/비빈, 담당AI∈agentIds). 위반 거부. |
| R6 | 역할 편집 일관성(중복 id/빈 이름) | Med | Low | TeamPlanEditModel + core 양쪽 검증. add/remove/edit 후 유효성. 단위 테스트. |
| R7 | 대표 호출 cwd/격리 | Low | Med | plan 생성은 읽기 전용 분석(파일 변경 아님). cwd는 프로젝트/임시. 위험 단계 아님(실행은 v0.18). |
| R8 | argv/셸 인젝션(overview에 특수문자) | Low | High | overview/플랜은 argv 배열 또는 stdin/파일로 전달. 셸 결합 금지. 테스트. |
| R9 | 이중 게이트(TS+swift) 누락 | Med | Med | core pnpm + GUI swift 둘 다 통과 + 루트 TS 회귀 0. |
| R10 | credential/세션 토큰 회귀 | Low | High | 어댑터는 공식 CLI만. 토큰/auth 미접근. 보안 회귀 테스트. |
| R11 | 자유 역할 ↔ v0.18 실행 인터페이스 불안정 | Low | Low | TeamPlan 스키마를 실행이 소비할 형태로 설계(역할/담당AI/지침). v0.18에서 그대로 사용. |
