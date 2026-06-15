# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 기본값이 실수로 실제 Claude 실행 | Med | High | 실제 실행은 `--claude` opt-in일 때만. 기본 레지스트리 전부 Stub. 테스트로 "플래그 없으면 claude 호출 0회" 단언. |
| R2 | claude CLI 인터페이스(비대화형/읽기 전용 플래그) 가정 오류 | Med | Med | 어댑터 command/args 구성 가능 + doctor 프리플라이트. 기본 args는 비변경. 실제 호출은 mock 테스트. |
| R3 | 읽기 전용 위반(analysis/design step이 파일 변경) | Med | High | 기본 args에 write/edit/danger 플래그 부재를 테스트로 단언. analysis/design/review는 비변경 print 모드. worktree 격리로 main 보호. |
| R4 | **Claude Code 세션 토큰** 접근 회귀 | Low | High | 어댑터/doctor는 `claude` 바이너리만 호출. 세션/토큰/credential 경로 문자열 부재를 보안 grep 회귀 테스트로 고정. |
| R5 | 프리플라이트 누락 → claude 미설치인데 run/worktree 생성 | Med | Med | `--claude` 시 run 시작 전 `claude --version` 점검. 실패면 안내+종료, 미생성. 테스트로 단언. |
| R6 | 레지스트리 통합이 v0.3 `createCodexWorkerRegistry`/기본 회귀 유발 | Med | Med | 통합 `createWorkerRegistry({codex,claude})` 도입 후 기존 함수는 얇은 위임으로 유지. 기존 CLI 테스트 회귀 없음 확인. |
| R7 | metadata에 stepType 추가가 기존 어댑터/테스트 회귀 | Low | Low | metadata는 추가만(기존 키 유지). CodexExecAdapter는 stepType 미사용이라 무영향. 기존 테스트 회귀 확인. |
| R8 | 출력 stdout이 비어/오류인데 산출물로 기록 | Med | Low | exit≠0 → success:false → step failed. 빈 stdout도 아티팩트로 남기되 success 매핑은 exit 기준. |
| R9 | `--codex --claude` 조합 시 역할 충돌 | Low | Med | 역할 집합 분리(implementer/fixer=Codex, analyst/architect/reviewer=Claude). 겹치지 않음. 조합 테스트로 단언. |
| R10 | timeout/비정상 종료 success 오판 | Low | High | exit≠0/예외/timeout → success:false. ProcessRunner timeout 경로 테스트. |
| R11 | 어댑터 cwd가 worktree 밖 | Low | High | 엔진이 cwd=worktreePath 전달(v0.2/v0.3 유지). 어댑터는 input.cwd만 사용. 테스트로 cwd 단언. |
| R12 | 산출물 아티팩트가 설계 시점 `.baton/runs/<id>/`와 혼동 | Low | Low | 런타임 run은 별도 runId 디렉터리. `.gitignore`가 런타임 run 무시(설계 run만 allowlist). 문서화. |
