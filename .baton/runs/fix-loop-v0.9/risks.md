# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **무한/과도 루프**(CLAUDE.md 금지) | Low | High | 정수 하드 상한 `maxFixAttempts`. 매 attempt마다 카운터++(fixer가 아무것도 안 고쳐도). 종료 조건: step 통과 / attempts==max / fixer 부재. 중첩 루프 없음. 테스트로 "정확히 N회 fixer 호출" 단언. |
| R2 | 엔진(`executeFrom`) 회귀 | Med | High | fix 루프를 `attemptFix` 헬퍼로 격리. `--fix` 미지정(fixEnabled=false) 경로는 기존과 동일(헬퍼 미진입). 기존 v0.2~v0.8 RunExecutor 테스트 회귀 없음 확인. |
| R3 | 종료 미보장(재실행이 계속 실패) | Low | High | 재실행 실패도 attempt로 카운트. 상한 도달 시 기존 실패 경로(skipFromIndex+run failed). 테스트로 "max 후 failed" 단언. |
| R4 | resume와 fix 상태 불일치(재실행 중복) | Med | Med | attempts/step 상태를 매 attempt 후 영속화. resume는 종료 step(completed/failed/skipped) 재실행 안 함(v0.2 멱등). awaiting-approval/fix 중간 상태 정의 명확화. |
| R5 | fixer가 Stub인데 `--fix`로 무의미하게 루프 | Med | Low | `--fix`인데 fixer 미해결(=`--codex` 없음) → 명확한 경고(실제 코드 변경 없음). 루프는 상한 내 1회 돌고 종료(무해). 테스트로 경고 단언. |
| R6 | fixer/재실행 실패의 throw 전파 | Low | High | invokeWorker는 success:false 반환(기존). 루프도 throw 없이 상태로. 엔진 public 메서드 예외 없음. |
| R7 | 영속/이벤트 누락으로 관측 불가 | Low | Med | 매 attempt: fix.attempt.started/finished, step.retried 이벤트 + 로그 + `RunStep.attempts` 갱신 + save. 테스트로 이벤트/attempts 단언. |
| R8 | 스키마 변경 하위호환 | Low | Low | `RunStep.attempts`는 optional. enum 변경 없음. 기존 run.json parse 유지. |
| R9 | 어댑터 cwd 격리 위반 | Low | High | fixer/재실행 모두 cwd=worktreePath(기존 invokeWorker). main 미수정. 테스트로 cwd 단언. |
| R10 | maxFixAttempts 잘못된 값(음수/과대) | Low | Med | 입력 검증: 정수, 1 이상, 상한(예: 5) 클램프 또는 거부. `--max-fix-attempts` 파싱 검증 테스트. |
| R11 | fixable 범위 확대 시 의도치 않은 루프 | Low | Med | v0.9는 `fixableStepTypes=['test']`만. 다른 step은 fix 루프 미진입(기존 즉시 실패). 명시·테스트. |
