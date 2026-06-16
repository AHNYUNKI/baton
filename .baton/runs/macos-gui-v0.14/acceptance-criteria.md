# Acceptance Criteria

v0.14 macOS GUI 첫 슬라이스가 완료되려면 아래가 모두 충족되어야 한다.

## Package & build

- [ ] AC-01 `apps/macos/Baton/Package.swift`(SwiftPM)가 앱 실행 타깃(`BatonApp`),
  로직 라이브러리(`BatonKit`), 테스트 타깃(`BatonKitTests`)을 정의한다.
- [ ] AC-02 `swift build`(apps/macos/Baton에서)가 성공한다.
- [ ] AC-03 `swift test`(apps/macos/Baton에서)가 성공한다.

## Contract models (Codable, v0.13)

- [ ] AC-04 봉투 `JsonEnvelope`(schemaVersion:1, kind, data) + `RunSummary`,
  `RunDetail`, `State`, `WatchEvent`(run.created/updated/status-changed/removed) Codable.
- [ ] AC-05 v0.13 실제 출력 픽스처(run-list/run-detail/state 봉투, watch NDJSON 이벤트)를
  디코드하는 테스트가 통과한다. schemaVersion 불일치는 명확한 에러로 처리(크래시 없음).

## BatonClient

- [ ] AC-06 `BatonClient`가 주입형 `CommandRunner`로 `baton`을 호출하며, 읽기
  (`run list --json`/`run show --json`/`state --json`)·쓰기(`run "<req>"`/`run approve
  [--reject]`/`run resume`/`run clean`) 명령의 argv를 **배열**로 구성한다(셸 결합 없음).
- [ ] AC-07 `--json` 응답을 봉투로 디코드해 모델로 반환한다.
- [ ] AC-08 watch NDJSON 라인 파서가 개행 경계/잔여 버퍼를 처리해 이벤트 스트림을
  산출한다(부분 라인 안전). 주입형 입력으로 테스트된다.
- [ ] AC-09 `baton` 미발견/비정상 종료를 명확한 에러로 처리한다(크래시 없음).

## RunsStore

- [ ] AC-10 `RunsStore`가 스냅샷 로드 후 `WatchEvent`를 적용하는 **순수 리듀서**를
  가진다: created 추가, removed 제거, status-changed/updated 갱신, 결정적 정렬.
- [ ] AC-11 리듀서가 단위 테스트(각 이벤트 타입)로 검증된다.

## UI (thin, manual QA)

- [ ] AC-12 SwiftUI: `RunsList`(사이드바, run 요약) + `RunDetail`(steps/approvals/
  artifacts) + 승인/재개/clean 액션(BatonClient 호출)이 컴파일된다.
- [ ] AC-13 View는 BatonKit(테스트된 로직)에만 의존하고 비즈니스 로직을 직접 갖지
  않는다(얇은 View). 수동 QA 체크리스트가 문서화된다.

## Safety & monorepo isolation

- [ ] AC-14 앱은 `.baton`를 직접 변경하지 않고 공식 `baton` 명령만 호출한다(승인 게이트/
  worktree 격리 우회 없음). credential/세션 토큰 미취급. Process는 배열 인자.
- [ ] AC-15 `packages/*`(TS) 미수정. pnpm 워크스페이스에 apps 미포함. 기존 TS
  `pnpm typecheck && pnpm test && pnpm build`가 회귀 없이 통과한다.
- [ ] AC-16 `apps/macos/README.md`가 빌드(`swift build`)/실행/QA 체크리스트와 v0.13
  계약 의존을 문서화한다. (선택) `.gitignore`에 `.build/` 추가.
