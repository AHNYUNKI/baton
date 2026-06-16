# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 게이트 흐름 오해(approve+implement 두 게이트) | Med | Med | E2E/문서가 기본 정책상 두 게이트를 정확히 반영(approve 2회). 테스트로 각 게이트 awaiting-approval→approve→resume 시퀀스 단언. |
| R2 | hermetic 한계 오인(analysis/design/review.md 미생성) | Med | Med | E2E는 stub 경로의 결정적 산출물(request/run.json/test_result/final_summary/pr_description)만 단언. 문서가 "실제 --codex --claude 시 추가 산출물"을 정직히 구분 설명. |
| R3 | 문서 드리프트(명령/플래그 불일치) | Med | Med | 문서 명령을 실제 CLI 표면(main usage)과 대조. 가벼운 테스트로 문서의 핵심 명령/플래그가 usage 문자열에 존재함을 검증(선택). |
| R4 | E2E 비결정/취약(타임스탬프/경로) | Med | Med | fixed clock 주입, 임시 디렉터리($BATON_HOME/cwd), mock runner 고정 응답. 산출물 존재/상태 위주 단언(전체 바이트 비교 지양). |
| R5 | 실제 codex/claude/git 의존 유입 | Low | High | E2E는 mock runner만. 실제 외부 실행/네트워크 금지. 보안/hermetic 단언. |
| R6 | 문서가 안전 모델을 과장/누락 | Low | Med | ARCHITECTURE.md가 실제 구현된 안전(격리·승인·bounded fix·읽기전용 조회·볼트 Baton/ 한정·credential 무접근)만 기술. 코드와 대조. |
| R7 | 기존 테스트/동작 회귀 | Low | High | E2E/문서는 추가만(기능 변경 없음). 전체 게이트로 회귀 0 확인. |
| R8 | E2E가 느리거나 불안정 | Low | Low | 단일 시나리오, mock 기반 → 빠름. 재시도/실제 IO 없음. |
| R9 | 데모 config 샘플이 실제 스키마와 불일치 | Low | Low | (선택) 샘플 config는 BatonConfig로 검증되게 작성하거나 문서 예시로만. |
