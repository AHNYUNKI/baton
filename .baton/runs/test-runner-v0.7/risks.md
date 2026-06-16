# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 기본값이 실수로 테스트 명령 실행 | Med | Med | 실제 실행은 `--test` opt-in일 때만. 기본 레지스트리 tester=Stub. 테스트로 "플래그 없으면 TestRunner 미등록/미호출" 단언. |
| R2 | 테스트 명령 출처 불명확/미설정 | Med | Low | config `test.command` 또는 `--test-command`로 해석. 둘 다 없으면 tester 미등록(Stub) + 명확한 경고. 테스트로 미설정 경고/Stub 유지 단언. |
| R3 | 셸 문자열 결합으로 명령 주입 | Low | High | 항상 `(command, args[])` 배열 전달. config는 string[] 권장, `--test-command`는 단순 공백 분리(문서화). 셸 평가 없음. |
| R4 | 테스트가 무한정 실행/행 | Med | Med | timeout 지원(ProcessRunner). 기본 timeout 설정 가능. timeout → success:false. 테스트로 timeout 경로. |
| R5 | 테스트 실패가 throw로 전파되어 run 상태 미보존 | Low | High | 어댑터 try/catch → success:false. 엔진이 step failed/run failed로. 잔여 skipped. throw 없음. |
| R6 | test_result.md 누락/덮어쓰기 문제 | Low | Low | metadata.runDirectory/stepId로 `test_result.md` 작성(멱등 덮어쓰기). 작성 실패는 결과에 영향 주되 throw 안 함. |
| R7 | `--codex --claude --test` 조합 시 역할 충돌 | Low | Med | 역할 분리(implementer/fixer=Codex, analyst/architect/reviewer=Claude, tester=TestRunner). 겹치지 않음. 조합 테스트. |
| R8 | 어댑터 cwd가 worktree 밖 | Low | High | 엔진이 cwd=worktreePath 전달(유지). 어댑터는 input.cwd만 사용. 테스트로 cwd 단언. |
| R9 | 대용량 테스트 출력으로 산출물 비대 | Low | Low | test_result.md에는 요약+잘린 출력, 전체는 logs/<stepId>.{stdout,stderr}.log(기존 엔진 동작). |
| R10 | credential/세션 토큰/danger 회귀 | Low | High | 보안 회귀 테스트 유지. 어댑터는 테스트 명령만 실행, auth/토큰 미접근. |
| R11 | 임의 명령 실행의 안전성(사용자 신뢰) | Low | Med | opt-in + 사용자 자신의 프로젝트 명령 + worktree 격리. 기본 sandbox/danger 없음. 문서에 명시. |
