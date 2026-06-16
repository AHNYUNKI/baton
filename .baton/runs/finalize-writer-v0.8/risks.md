# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | release_writer 기본 변경(Stub→FinalizeWriter)이 기존 회귀 | Med | Med | 모든 레지스트리 변형에서 release_writer→FinalizeWriter. 부수효과는 산출물 생성뿐(저장소 무수정). release_writer를 Stub로 단언하던 테스트는 의도적으로 갱신. 전체 게이트로 회귀 확인. |
| R2 | run 디렉터리 밖/저장소에 쓰기 | Low | High | 출력 경로는 `metadata.runDirectory` 하위로 강제(resolve+검증). 삭제 연산 없음. worktree/저장소 미수정. 경로 단언 테스트. |
| R3 | 비결정성(타임스탬프/순서)으로 출력 불안정 | Med | Med | Clock/random 미사용. 입력은 run.json + 아티팩트 파일. step 순서는 run.steps 순서. 동일 run → 동일 출력 멱등 테스트. |
| R4 | 누락 아티팩트(analysis/design/test_result/review 부재)로 렌더 실패 | Med | Med | 존재하는 아티팩트만 반영(파일 존재 검사). 부재는 "(none)" 등으로 우아하게 표기. 누락 케이스 테스트. |
| R5 | run.json 시점 모호(finalize 진행 중 상태) | Low | Low | finalize step은 run.steps에 포함되며 현재 상태로 표기. 요약은 그 시점 스냅샷임을 문서화. 결정적. |
| R6 | 대용량 아티팩트 임베드로 산출물 비대 | Low | Low | final_summary는 요약/포인터 중심(전체 임베드 아님), 큰 출력은 잘라 표기. |
| R7 | IO 오류가 throw로 전파 | Low | Med | run() try/catch → success:false + 메시지. 엔진이 step 상태로 처리. throw 없음. |
| R8 | pr_description 제목에 민감/이상 문자 | Low | Low | 요청 텍스트를 안전하게 1줄 제목으로 정규화(개행 제거, 길이 제한). |
| R9 | 성공 경로 한정으로 실패 run에 요약 없음 | Med | Low | v0.8은 성공 경로 finalize만(실패 run은 run.json/저널이 기록). 실패 요약은 후속 TODO 명시(no silent gap). |
| R10 | credential/세션 토큰/danger 회귀 | Low | High | FinalizeWriter는 run 디렉터리 FS 읽기/쓰기만. 외부 프로세스/토큰 미접근. 보안 회귀 테스트. |
