# Acceptance Criteria — context-relay-v0.19.1

컨텍스트 릴레이(이벤트 트리거형 단발 디스패치 + 요청 페이로드 컨텍스트)가 완료되려면 아래가
모두 충족. 전부 stub·headless로 결정적 검증.

## 순수 로직 (pnpm test)
- [ ] AC-02 `collectUpstreamRoleIds(roleId, teamPlan)`가 보고 체인 상위를 **root→…→직속 부모**
  순으로 반환(자기 제외). 미존재 부모/사이클은 거기서 중단(무한루프 없음). 단위 테스트.
- [ ] AC-03 `summarizeWorkerResult(result, maxChars)`가 출력(성공 stdout/실패 stderr)을 maxChars로
  **절단**하고 절단 시 표시를 남긴다. 빈 출력 처리. 토큰 가드. 단위 테스트.

## 프롬프트 (pnpm test)
- [ ] AC-04 `buildRolePrompt`가 `upstream`이 있으면 "Upstream Context" 섹션(상위 이름/roleId/
  담당AI/상태 + 요약 + 산출물 **경로**)을 추가하고, 없으면 생략한다.
- [ ] AC-06 산출물은 **경로만** 포함(파일 내용을 프롬프트에 통째로 넣지 않음). 다운스트림이
  worktree/runDirectory에서 직접 읽도록.

## 실행기 릴레이 (pnpm test)
- [ ] AC-01 역할 호출 직전, 그 역할의 보고 체인 상위 중 **완료된** 역할만 컨텍스트로 구성해
  프롬프트에 전달한다(트리거가 다음 AI를 깨울 때 컨텍스트 동봉).
- [ ] AC-05 자식 역할 프롬프트에 **부모(보고 체인) 요약이 포함**되고, **보고 관계가 없는 형제**의
  컨텍스트는 **포함되지 않는다**(토큰 경계). 단위 테스트.
- [ ] AC-07 역할 성공 완료 시 `summary`(절단)가 role에 **영속**된다(teamRun.roles[].summary).
- [ ] AC-08 `resume` 후에도 이전 완료 상위의 요약이 릴레이된다(메모리가 아니라 영속 summary
  에서 구성). 단위 테스트.
- [ ] AC-09 단방향·**역할당 1회 호출**·StubWorker 유지(상시 루프/양방향 대화 없음). 트리거
  이벤트(`teamRun.role.started`)에 `upstreamRoleIds` 기록.

## 안전 & 회귀
- [ ] AC-10 `summary`는 선택 필드 — 기존 team-run/readApi 봉투, 기존 `Run`/CLI 명령/테스트
  **회귀 0**. 루트 `pnpm typecheck/test/build` 통과. Swift/실제 codex·claude 디스패치/credential/
  HTTP 변경 없음.
