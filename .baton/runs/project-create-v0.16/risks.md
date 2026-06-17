# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Project 스키마 확장이 기존 add/list 회귀 | Med | Med | `source`로 일반화하되 `add(path)`는 `source:{kind:local,value:path}`로 매핑해 명령 동작 유지. 기존 테스트 의도적 갱신. 저장된 실데이터 없어 마이그레이션 불필요. |
| R2 | AI 카탈로그 이중 정의(core/ GUI) 불일치 | Med | Low | core가 허용 id의 단일 검증 출처. GUI는 동일 정적 목록(codex/claude) 표시. 불일치 방지 위해 id 문자열 고정 + 문서화. 완전 단일화는 후속. |
| R3 | GitHub 소스 처리 오해(클론 기대) | Low | Med | v0.16은 **참조만**(URL 저장+형식 검증). clone/네트워크 없음. 문서·UI에 "참조" 명시. |
| R4 | 위저드 검증 누락(빈 이름/소스, lead 불일치) | Med | Med | `ProjectFormModel.isValid` + core `create` 양쪽 검증. lead ∈ agentIds(복수 필수). 단위 테스트로 각 케이스. |
| R5 | argv/셸 인젝션 | Low | High | `project create`는 argv 배열 전달(이름/소스에 공백·특수문자 안전). 셸 결합 금지. 테스트로 단언. |
| R6 | TS/Swift 이중 게이트 누락 | Med | Med | core는 pnpm typecheck/test, GUI는 swift build/test. 둘 다 통과 + 루트 TS 회귀 0 확인. |
| R7 | 봉투 계약 일탈(project-list --json) | Low | Low | v0.13 봉투 `{schemaVersion:1, kind:'project-list', data}` 재사용. Zod 검증. |
| R8 | 프로젝트↔런/실행 범위 누수 | Low | Med | v0.16은 프로젝트 CRUD(생성/목록)만. 계획/역할/실행 미포함(후속). 명확한 경계. |
| R9 | id 충돌/중복 프로젝트 | Low | Low | id는 결정적(이름+소스 해시) 또는 uuid. 중복 소스 처리(멱등 또는 거부) 정의 + 테스트. |
| R10 | credential/세션 토큰 회귀 | Low | High | core/GUI 모두 로컬 파일/CLI만. 외부/토큰 미접근. 보안 회귀 테스트. |
