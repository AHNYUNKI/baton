# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 기본값이 실수로 실제 Codex를 실행 | Med | High | 실제 실행은 `--codex` opt-in일 때만. 기본 레지스트리는 StubWorker 유지. 테스트로 "플래그 없으면 실제 어댑터 미등록/미호출" 단언. |
| R2 | codex CLI 인터페이스 가정(`codex exec` + stdin) 오류 | Med | Med | 어댑터의 command/args/프롬프트 전달 방식을 구성 가능하게. doctor 프리플라이트로 가용성 검증. 실패는 success:false로 표면화. 실제 호출은 mock 테스트. |
| R3 | 프리플라이트 누락 → codex 미설치인데 worktree/run 생성 | Med | Med | `--codex` 시 run 시작 전 `codex --version` 점검. 실패면 명확한 안내 + 종료, worktree/run **미생성**. 테스트로 단언. |
| R4 | `run clean`이 잘못된 경로(base/main 워킹트리) 제거 | Low | High | clean은 run.json의 `worktreePath`만 `removeWorktree`로 제거. base/main 경로/브랜치 미접근. 종료된 run에만 허용(진행 중 거부). 테스트로 경로 단언. |
| R5 | 대용량 프롬프트를 argv로 전달 시 길이/인용 오류 | Med | Med | 프롬프트를 stdin(`ProcessRunner.input`)으로 전달. 프롬프트를 아티팩트로도 기록해 재현/검토 가능. |
| R6 | timeout/비정상 종료가 success로 오판 | Low | High | exitCode!==0 또는 timeout → success:false. ProcessRunner timeout 경로 테스트. |
| R7 | auth 파일/credential 접근 회귀 | Low | High | 보안 grep 회귀 테스트 유지. 어댑터/doctor는 `codex` 바이너리만 호출, auth 경로 문자열 부재 단언. |
| R8 | 실제 codex가 worktree 밖 파일 변경(격리 누수) | Low | High | 어댑터 cwd는 항상 run worktreePath(엔진이 전달). sandbox `workspace-write`. `danger-full-access` 금지. |
| R9 | clean 후 재개(resume) 시 worktree 부재로 실패 | Med | Low | clean은 종료된 run에만. cleaned 표시 후 resume 거부 또는 명확한 에러. 문서화. |
| R10 | stdin 추가가 기존 ProcessRunner 사용처 회귀 | Low | Med | `input`은 optional, 미지정 시 기존 동작 동일. 기존 테스트 회귀 없음 확인. |
| R11 | `--codex`가 analysis/design 역할까지 실제화 시도 | Low | Med | `--codex`는 implementer/fixer만 실제 어댑터로 교체. 그 외 역할은 Stub 유지(어댑터 없음). 테스트로 역할 한정 단언. |
| R12 | 실제 실행 결과(변경 diff) 미기록으로 리뷰 곤란 | Med | Low | v0.3는 codex stdout/stderr를 logs로 기록(기존). worktree diff 캡처는 후속 TODO로 명시. |
