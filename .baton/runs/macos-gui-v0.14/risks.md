# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | UI 검증 비대칭(Xcode 부재로 화면 자동 게이트 불가) | High | Med | 로직(모델/클라이언트/스토어)을 두텁게 + `swift test` 게이트. View는 얇게. `swift build`로 컴파일 보장. 수동 QA 체크리스트 문서화. |
| R2 | subprocess `--json`/NDJSON 파싱 견고성(부분 라인/버퍼) | Med | Med | `--json`은 단일 JSON(봉투) 디코드. watch는 라인 분할 파서(개행 경계, 잔여 버퍼) + 단위 테스트. |
| R3 | 스키마 버전 드리프트(앱 기대 ≠ CLI 출력) | Low | Med | 앱은 schemaVersion 1 기대, 불일치 시 명확한 에러(크래시 금지). 계약 v0.13 고정. 픽스처 디코드 테스트로 계약 고정. |
| R4 | TS 모노레포 게이트 간섭/회귀 | Low | High | Swift는 `apps/macos`에 격리. `packages/*` 미수정. pnpm 워크스페이스 글롭(`packages/*`)에 apps 미포함 확인. TS typecheck/test/build 불변. |
| R5 | `baton` 바이너리 미발견/경로 문제 | Med | Med | 설정 경로 또는 PATH 탐색. 미발견 시 명확한 안내(앱 크래시 금지). CommandRunner 주입으로 테스트. |
| R6 | 앱이 Baton 안전(승인/격리)을 우회 | Low | High | 앱은 `.baton`를 직접 변경하지 않고 공식 `baton` 명령만 호출. 승인은 `run approve`, 격리는 core가 강제. credential/세션 토큰 미취급. |
| R7 | Process 호출의 보안(셸 인젝션) | Low | High | Process는 (executable, args[]) 배열 인자. 셸 문자열 결합 금지. 사용자 입력은 인자로 전달. |
| R8 | watch 프로세스 누수(앱 종료 시 미정리) | Med | Low | watch Task/Process 수명 관리(앱/뷰 사라질 때 종료). cancel/terminate. |
| R9 | Swift 동시성(액터/메인스레드) 오용 | Med | Low | UI 갱신은 MainActor. 네트워크 대신 subprocess는 백그라운드. RunsStore @MainActor ObservableObject. |
| R10 | 빌드만 되고 실제 동작 미검증 | Med | Med | `swift test`로 로직 보장 + 수동 QA로 실제 baton 연동(별도 환경에서 사용자/Codex). 정직히 한계 보고. |
| R11 | 후속 슬라이스와의 인터페이스 불안정 | Low | Low | v0.14는 읽기+watch+승인. 설정/새 run/대시보드는 후속. BatonKit API를 확장 가능하게 설계. |
