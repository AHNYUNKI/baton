# Acceptance Criteria — token-usage-v0.19.2

토큰 사용량 플랫폼별 집계·표시가 완료되려면 아래 모두 충족. 전부 stub·headless로 결정적 검증.

## 스키마 (pnpm test)
- [ ] AC-01 `TeamRunRoleUsageSchema{inputTokens int≥0, outputTokens int≥0, estimated bool}` +
  `TeamRunRole.usage?`(선택). 음수/비정수 거부.

## 순수 로직 (pnpm test)
- [ ] AC-02 `estimateTokens(text)`가 근사 토큰수 반환(빈 문자열 0, 길이 비례). 근사임을 주석/표시에 명시.
- [ ] AC-03 `readOrEstimateUsage(prompt, result)`: `result.metadata.usage`가 유효(음이 아닌 숫자)
  하면 그 값 + `estimated:false`; 없거나 불량이면 prompt/stdout 추정 + `estimated:true`.
- [ ] AC-04 `aggregateTeamRunUsage(teamRun)`가 **assignedAgentId(codex/claude)별** input/output/
  total/역할수 합산 + 총합 + `anyEstimated`(하나라도 추정이면 true). usage 없는 role 제외. 순수.

## 실행기 (pnpm test)
- [ ] AC-05 역할 완료(성공/실패) 시 `usage`가 role에 산출·**영속**된다(stub → estimated:true).
  `teamRun.role.completed` 이벤트에 usage 요약 포함. 역할당 워커 호출 1회 유지.
- [ ] AC-06 `resume` 후에도 이전 완료 role의 usage가 보존된다(영속에서).

## CLI 표시 (pnpm test)
- [ ] AC-07 `plan run show <teamRunId>`(텍스트)가 **플랫폼별 사용량 표**(codex/claude:
  input/output/total/역할수) + 총합을 출력한다.
- [ ] AC-08 추정 포함 시 "※ 추정치 포함(실측 디스패치 시 정확)" 주석을 병기한다. `--json`은
  team-run 봉투에 `role.usage`가 포함된다(구조 변경 없음).

## 안전 & 회귀
- [ ] AC-09 구독 플랜 잔량/계정 토큰/credential 접근 **없음**(Baton 호출분만). stub 기본. HTTP 없음.
- [ ] AC-10 `usage`는 선택 필드 — 기존 team-run/readApi 봉투, 기존 `Run`/CLI 명령/테스트 **회귀 0**.
  루트 `pnpm typecheck/test/build` 통과. Swift/실제 usage 파싱 변경 없음.
