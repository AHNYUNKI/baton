# Acceptance Criteria

v0.17 대표 TeamPlan 생성 + 검토/수정이 완료되려면 아래가 모두 충족되어야 한다.

## Schema (TS)

- [ ] AC-01 `TeamRole = { id, name, description, assignedAgentId, instructions }`,
  `TeamPlan = { roles: TeamRole[] }` Zod. 자유 역할(고정 enum 아님). 역할 id 유일·비빈,
  name 비빈, instructions 문자열.
- [ ] AC-02 `Project`에 optional `teamPlan?`, `overview?` 추가(additive, 기존 프로젝트 호환).
- [ ] AC-03 TeamPlan 검증: 모든 `assignedAgentId` ∈ project.agentIds. 위반 거부.

## Planner (core)

- [ ] AC-04 `generateTeamPlan({project, overview, leadAdapter, maxAttempts})`가 대표
  어댑터를 호출하고, 출력에서 **관대하게 JSON 추출**(프로즈/코드펜스 허용) 후
  TeamPlanSchema로 검증해 반환한다.
- [ ] AC-05 파싱/검증 실패 시 **bounded 재시도**(기본 2, 교정 프롬프트). 상한 소진 시
  명확한 에러(throw, 억지 부분결과 없음). 어댑터 호출 횟수가 상한 이하임을 단언.
- [ ] AC-06 생성된 plan의 `assignedAgentId`가 project.agentIds로 클램프/검증된다(밖이면
  보정 또는 거부, 정의대로).
- [ ] AC-07 플래너는 주입형 어댑터로 동작 — 단위 테스트는 mock 어댑터(canned JSON,
  프로즈+JSON, 실패→재시도→에러)로 결정적. 실제 AI/네트워크 호출 없음.

## Service & CLI (TS)

- [ ] AC-08 `ProjectService.setTeamPlan(projectId, teamPlan)`/`getTeamPlan`이 검증 후
  저장/조회한다(손상 plan 거부).
- [ ] AC-09 `baton project plan generate <id> --overview "<t>"`가 대표로 plan 생성 →
  저장(overview 포함) → 봉투(kind 'team-plan') 출력. lead 미가용 시 명확한 안내+비정상 종료.
- [ ] AC-10 `baton project plan show <id> --json`(저장 plan, 봉투), `baton project plan
  set <id>`(stdin/--file JSON → 검증 후 저장)이 동작한다.

## GUI (Swift)

- [ ] AC-11 `TeamPlanEditModel`(roles add/remove/edit name·description·instructions,
  담당AI 변경(project.agentIds 내), 검증) + 직렬화가 단위 테스트된다.
- [ ] AC-12 `BatonClient.generateTeamPlan/showTeamPlan/setTeamPlan`이 argv 배열/봉투
  디코드로 동작하고 에러를 표면화한다.
- [ ] AC-13 화면: 프로젝트 상세 → 개요 입력 → "대표에게 맡기기"(생성) → TeamPlan 편집
  (역할 카드: 이름/설명/담당AI/지침 + 추가/삭제) → 저장. paperclip/한국어, View 얇게.
  생성 중/lead 미설정 안내. 수동 QA 체크리스트.

## Safety & gates

- [ ] AC-14 생성은 공식 CLI/SDK 경유, credential/세션 토큰 무접근. argv 배열/stdin·파일,
  셸 결합 없음. 재시도 bounded.
- [ ] AC-15 `swift build` + `swift test` 통과. 루트 `pnpm typecheck/test/build` 회귀 0.
- [ ] AC-16 README/UX 갱신(개요→생성→검토/수정 흐름, 수동 QA), 보안 회귀 테스트 통과.
