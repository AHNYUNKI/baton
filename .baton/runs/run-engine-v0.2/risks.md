# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 승인 게이트 누수: 미승인 `implement`/`fix` step이 실행됨 | Med | High | 게이트 step은 `(runId, stepId)` 승인 레코드가 `approved`일 때만 실행. 결정 없으면 `awaiting-approval`로 반환하고 다운스트림 미실행. 테스트로 "미승인 시 worker 호출 0회" 단언. |
| R2 | worktree 격리 실패로 main/base 워킹트리 오염 | Low | High | mutating worker의 cwd는 항상 run의 worktreePath. 엔진은 base/main 경로를 worker cwd로 절대 전달하지 않음. worktree 브랜치는 `baton/<runId>`. 테스트로 cwd==worktreePath 단언. |
| R3 | 부분 실패 시 상태 비일관 → 재개 불가 | Med | High | 매 step 종료마다 RunStore로 원자적 영속화(임시파일 rename). resume는 첫 비종료 step부터 재평가. 실패 step 이후 잔여는 `skipped`로 명시. |
| R4 | 엔진이 worker 오류를 throw로 전파해 run 상태가 안 남음 | Med | Med | worker 호출은 try/catch로 감싸 실패를 `WorkerRunResult`/step `failed`로 변환. 엔진 public 메서드는 실행 결과를 반환하지 예외로 흐름 제어하지 않음. |
| R5 | StubWorker가 실제 워커로 오인되어 의도치 않게 "구현됨"으로 표시 | Med | Med | StubWorker 결과 아티팩트/이벤트에 `stub: true`와 명시 메시지. status는 `completed`지만 reason에 "stub worker"를 남김. CLI 출력에 스텁 경고. |
| R6 | 스키마 변경의 하위호환(기존 run.json 로드 실패) | Low | Med | 신규 필드는 모두 optional. RunStatus/RunStepStatus enum은 추가만(제거 없음). RunStore 로드시 Zod parse 실패를 명확히 보고. |
| R7 | worktree 누적(정리 없음)으로 디스크 증가 | Med | Low | v0.2는 보존(검사 목적) + 후속 `run clean` TODO 문서화. 테스트는 mock worktree로 실제 생성 없음. |
| R8 | 실제 git/codex 의존 테스트로 CI 불안정 | Low | Med | 모든 테스트는 mock ProcessRunner/WorkerRegistry/fixed Clock/temp $BATON_HOME. 실제 worktree/codex 실행 테스트 없음. |
| R9 | 재개 시 이미 완료한 step 재실행(중복 부수효과) | Med | High | resume는 `completed`/`skipped`/`failed`(종료) step을 건너뛰고 첫 비종료부터. step 상태 전이는 멱등하게 설계. 테스트로 "resume가 완료 step worker 재호출 안 함" 단언. |
| R10 | 승인 대기 중 동일 run 재실행으로 상태 경합 | Low | Med | start는 이미 존재하는 runId 재사용 금지(새 runId). 진행은 resume만. 동일 runId 동시 변경은 v0.2 비대상(순차 가정), 문서화. |
| R11 | prompt 구성이 빈약해 워커가 잘못된 작업 수행 | Med | Low | v0.2는 엔진 정확성 우선. `buildStepPrompt`는 요청+step+아티팩트 포인터 최소 구성, 후속에서 강화(TODO). 실제 워커는 다음 마일스톤. |
| R12 | credential/`danger-full-access` 회귀 | Low | High | 보안 grep 회귀 테스트 유지. worker 옵션 기본 sandbox `workspace-write`. auth 경로 문자열 부재 단언. |
