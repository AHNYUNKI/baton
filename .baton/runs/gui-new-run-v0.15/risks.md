# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | startRun 후 새 run이 즉시 화면에 안 보임(watch 폴 간격) | Med | Med | startRun 성공 후 명시적 `load()`/refresh로 즉시 반영. 라이브 watch는 이후 갱신. 스토어 오케스트레이션 테스트로 refresh 호출 단언. |
| R2 | 폼 → StartRunOptions/argv 매핑 오류 | Med | Med | `NewRunFormModel.buildOptions()` + `startRun` argv를 단위 테스트로 고정(각 토글/값 → 정확한 옵션·플래그). |
| R3 | 사용자 지정 실행 파일 경로 보안(임의 실행) | Low | Med | 사용자 자신의 baton 경로(로컬). Process는 (executable, args[]) 배열 — 셸 평가 없음. 경로 미설정 시 PATH "baton". 문서 명시. |
| R4 | 빈/공백 요청으로 빈 run 생성 | Low | Low | `isValid`(요청 trim non-empty) → 빈 요청 Start 비활성/거부. 검증 테스트. |
| R5 | 검증 비대칭(NewRunView/Settings 화면 자동 테스트 불가) | High | Low | 로직(폼/스토어/경로/argv)을 BatonKit에 모아 swift test. View 얇게 + 수동 QA 체크리스트. |
| R6 | 안전 우회(앱이 `.baton` 직접 변경/게이트 무시) | Low | High | 앱은 `baton run`만 호출. 승인 게이트/격리는 core 강제. `.baton` 직접 쓰기 없음. credential 미취급. |
| R7 | TS 모노레포 회귀 | Low | High | `packages/*` 미수정, apps/macos 격리. 루트 TS 게이트 193 유지 확인. |
| R8 | maxFixAttempts 잘못된 값 입력 | Low | Low | 폼에서 1~5 범위(혹은 빈값=미설정). 범위 밖이면 CLI가 거부(기존). 폼 검증/테스트. |
| R9 | startRun 실패(예: codex 미설치 preflight) 미표시 | Med | Low | startRun 결과/에러를 스토어 상태/배너로 표면화(테스트는 에러 전파). 사용자에게 안내. |
| R10 | 경로 preference 영속(UserDefaults) 테스트성 | Low | Low | 해석 로직(`BatonLocation.resolve(preference:)`)을 순수 함수로 분리해 테스트. UserDefaults 바인딩은 얇게. |
