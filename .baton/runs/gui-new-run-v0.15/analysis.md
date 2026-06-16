# Analysis

## User Request

macOS 앱에서 새 run을 생성할 수 있게 한다(New Run 폼 + 워커 토글 → `baton run`).
스토어 오케스트레이션과 baton 실행 파일 경로 설정을 더해 앱을 end-to-end로 쓸 수
있게 만든다.

## Intent

v0.14 슬라이스로 앱은 run을 보고(읽기/라이브 watch) 기존 run을 조작(approve/resume/
clean)할 수 있다. 하지만 **새 run을 시작할 수 없다** — 즉 "관찰자"에 머문다. 이 슬라이스의
가치는 앱을 **실제로 파이프라인을 구동하는 도구**로 만드는 것이다(요청 입력 → 워커
선택 → 실행 → 라이브로 진행 관찰). 안전은 전적으로 `baton` CLI에 위임한다.

## Current Repository Understanding (v0.14 / main 168fbe6 기준)

- `BatonClient.startRun(request:options:)` + `StartRunOptions`(dryRun/workflowId/
  projectId/useCodex/useClaude/useTest/testCommand/fixEnabled/maxFixAttempts) +
  `appendWorkerOptions`(argv: --codex/--no-codex/--test-command/--max-fix-attempts 등)
  **이미 존재**(클라이언트 측 완료). approve/resume/clean도 존재.
- `RunsStore`(@MainActor): `load()`(state 스냅샷), `startWatching(intervalSeconds:)`
  (라이브 watch 구독), `loadDetail`, 순수 `reduce`. **새 run 생성 오케스트레이션 없음.**
- `ProcessRunner(executable: String = "baton", environment:)` — 실행 파일 경로
  **구성 가능**(기본 PATH의 "baton"). 단 앱에 경로 설정 UI/preference 없음.
- SwiftUI: RunsListView/RunDetailView(읽기 + approve/resume/clean). **NewRun 화면 없음.**

## Relevant Files (apps/macos/Baton)

| File | Reason |
|---|---|
| `Sources/BatonKit/Forms/NewRunFormModel.swift`(신규) | 폼 상태 → StartRunOptions + 검증 |
| `Sources/BatonKit/Settings/BatonLocation.swift`(신규) | 실행 파일 경로 해석(preference/기본) |
| `Sources/BatonKit/Store/RunsStore.swift` | `startRun(...)` 오케스트레이션 |
| `Sources/BatonKit/Client/BatonClient.swift` | startRun argv(테스트 보강) |
| `Sources/BatonApp/NewRunView.swift`(신규) | 요청+토글 시트 |
| `Sources/BatonApp/*`(앱 진입, Settings) | "New Run" 버튼 + 경로 설정 |
| `Tests/BatonKitTests/*` | 폼/스토어/경로/ argv 테스트 |
| `apps/macos/README.md` | 수동 QA 갱신 |

## Existing Behavior

앱은 run을 보고 기존 run을 조작할 수 있으나 새 run 생성 불가. baton 경로는 코드 기본값
("baton", PATH)만, 사용자 설정 경로 없음.

## Target Behavior

- "New Run" → 시트: 요청 텍스트 + 워커 토글(codex/claude/test, testCommand, fix,
  maxFixAttempts) + dry-run. Start → `RunsStore.startRun` → `BatonClient.startRun`
  → 목록에 반영(라이브 watch/refresh).
- 요청이 비면 Start 비활성/검증 에러.
- Settings(최소): baton 실행 파일 경로 입력 → `ProcessRunner(executable:)`로 사용.
  미설정 시 PATH의 "baton". 미발견 시 명확한 안내(기존 에러).

## Constraints

- v0.13 계약 + 기존 명령만(HTTP 없음). 안전 우회 금지(`baton`만 호출). Process 배열 인자.
- 로직 BatonKit(테스트), View 얇게(수동 QA). `packages/*` 미수정(TS 회귀 0).
- 게이트: swift build/test + 루트 TS. base = origin/main.

## Assumptions

### Safe

- `NewRunFormModel`은 값 타입/관찰 모델: 필드 + `buildOptions() -> StartRunOptions` +
  `isValid`(요청 non-empty). 순수 로직 → 테스트.
- `startRun` 후 라이브 watch가 새 run을 잡거나, 보강으로 `load()` refresh.
- 경로 설정은 앱 preference(UserDefaults)지만 해석 로직은 주입 가능(테스트).

### Risky

- **watch 즉시성**: 새 run이 watch에 즉시 안 잡힐 수 있음(폴 간격) → startRun 후 명시적
  refresh(load)로 보강해 UX 보장.
- **경로 설정 보안**: 사용자가 지정한 실행 파일을 그대로 실행 → 사용자 자신의 baton
  경로(로컬). 인자는 배열. 임의 셸 평가 없음. 문서에 명시.
- **검증 비대칭 유지**: 폼/스토어/경로/argv는 테스트, NewRunView/Settings 화면은 수동 QA.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. v0.15를 New Run + 경로 설정으로 한정(대시보드/전체 설정은 후속). 기본 그렇게.
2. startRun 후 라이브 watch + 명시 refresh 보강으로 즉시 반영. 기본 그렇게.

## Risks

`risks.md` 참조. 핵심: watch 즉시성, 경로 실행 안전, 검증 비대칭, 폼→argv 정확성,
TS 격리, 안전 우회.

## Recommendation

`NewRunFormModel`(폼→StartRunOptions+검증)과 `RunsStore.startRun`(client 호출 후
refresh)을 BatonKit에 두어 `swift test`로 게이트하고, baton 경로 해석도 테스트 가능하게
한다. 얇은 NewRunView/Settings는 BatonKit에만 의존하고 수동 QA로 검증한다. 안전은
`baton` CLI에 위임하고 TS 모노레포는 불간섭한다. 상세는 `design.md`.
