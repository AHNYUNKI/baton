# Analysis

## User Request

네이티브 SwiftUI macOS 앱을 시작한다. v0.13 통합 계약(`--json` 봉투 + `baton watch`
NDJSON + run/approve/resume/clean/config)으로 `baton` CLI에 subprocess로 붙는다.
v0.14는 검증 가능한 첫 슬라이스(모델/클라이언트/스토어 + 얇은 화면).

## Intent

지금까지 13개 마일스톤으로 CLI·파이프라인·기록·인덱스·read API/watch를 갖췄다. GUI는
이 위에 얹는 사용자 표면이다. 가치의 핵심은 "화면을 빨리"가 아니라, **계약(v0.13)에
정확히 묶이고 + 로직이 테스트 가능하며 + 안전을 우회하지 않는** 앱의 골격을 세우는 것.
Xcode 부재로 UI는 자동 게이트 불가하므로, 로직 레이어를 두텁게/테스트 가능하게 설계한다.

## Toolchain & Verification Reality

- Swift 6.2 + SwiftPM(`swift build`/`swift test`) 사용 가능. xcodebuild(전체 Xcode) 부재.
- 결론:
  - **테스트 가능(게이트)**: Codable 모델 디코드(v0.13 픽스처), BatonClient의 argv
    구성·봉투 디코드, watch NDJSON 라인 파싱, RunsStore 리듀서(WatchEvent 적용). 전부
    순수/주입 가능 → `swift test`.
  - **수동 QA**: SwiftUI View/윈도우/UX.
  - 따라서 View는 얇게, 로직은 테스트 레이어로.

## Current Repository Understanding (v0.13 / main 976f8f8 기준)

- 통합 계약(`docs/INTEGRATION.md`, v0.13): 봉투 `{schemaVersion:1, kind, data}`.
  - `run list --json` → kind `run-list`, data `{ runs:[summary], skipped }`
  - `run show/status --json` → kind `run-detail`, data `{ run, artifacts:[file] }`
  - `state --json` → kind `state`, data `{ total, byStatus, recent:[summary] }`
  - `baton watch [--once|--interval]` → NDJSON, 봉투 kind `event`, data WatchEvent
    (run.created/updated/status-changed/removed)
  - 쓰기: `run "<req>" [flags]`, `run approve <id> [--reject]`, `run resume <id>`,
    `run clean <id>`, `config set ...`
- 레포: pnpm TS 모노레포(`packages/*`). `apps/` 없음. Swift 앱은 신규 별도 트리.

## Relevant Files (신규, 모두 apps/macos/)

| File | Reason |
|---|---|
| `apps/macos/Baton/Package.swift` | SwiftPM 패키지(앱+테스트 타깃) |
| `.../Sources/BatonKit/Contract/*.swift` | Codable 모델(봉투/Run*/State/WatchEvent) |
| `.../Sources/BatonKit/Client/BatonClient.swift` | subprocess 호출 + 디코드 + watch 파싱 |
| `.../Sources/BatonKit/Client/CommandRunner.swift` | 주입형 실행 추상화(테스트) |
| `.../Sources/BatonKit/Store/RunsStore.swift` | ObservableObject 리듀서 |
| `.../Sources/BatonApp/*.swift` | @main App + RunsList/RunDetail View(얇게) |
| `.../Tests/BatonKitTests/*.swift` | 모델/클라이언트/스토어 테스트 |
| `apps/macos/README.md` | 빌드/실행/QA 안내 |

## Existing Behavior

GUI 없음. 사용자는 CLI로만 상호작용. v0.13이 GUI가 붙을 계약을 제공.

## Target Behavior

- 앱 실행 → `baton` 경로(설정/PATH) 확인 → `run list --json`/`state --json`으로 초기
  스냅샷 로드 → `baton watch`로 라이브 갱신(RunsStore 리듀서).
- RunsList(사이드바): run 요약(상태/날짜/워크플로우) 선택.
- RunDetail: steps(상태/타이밍/reason), approvals, artifacts 목록 + 액션
  (승인 게이트 → `run approve`/`--reject`, `run resume`, `run clean`).
- 모든 쓰기는 `baton` 명령 경유(안전 우회 없음). 결과는 watch/재조회로 반영.

## Constraints

- v0.13 계약만 사용(스키마 변경 없이 디코드). HTTP 서버 미도입.
- 앱은 승인 게이트/worktree 격리를 우회하지 않음. credential/세션 토큰 미취급.
- `packages/*`(TS) 미수정 → 기존 TS 게이트 회귀 0. Swift는 `apps/macos`에 격리.
- 로직 테스트 가능(`swift test`), UI 수동 QA. base = origin/main.

## Assumptions

### Safe

- SwiftPM 실행 타깃으로 SwiftUI 앱 구성(swift build/run). Codable로 봉투 디코드.
- BatonClient는 `CommandRunner` 프로토콜 주입(실제=Process, 테스트=가짜)으로 결정적 테스트.
- `baton` 위치는 설정 또는 PATH. 미발견 시 명확한 안내.

### Risky

- **검증 비대칭**: UI는 swift test로 못 잡음 → 로직 레이어 최대화 + 수동 QA 체크리스트
  문서화. 앱 빌드는 `swift build`로 최소 보장.
- **subprocess 파싱 견고성**: `--json`은 단일 JSON(봉투), watch는 NDJSON(라인 단위).
  부분 라인/버퍼링 처리 필요 → 라인 분할 파서 테스트.
- **스키마 버전 드리프트**: 앱이 schemaVersion 1을 기대. 불일치 시 명확한 에러(맹목적
  크래시 금지). 계약은 v0.13 고정.
- **모노레포 빌드 영향 0**: pnpm 워크스페이스(`packages/*`)와 분리. CI/게이트는 TS와
  Swift 별도. apps/macos가 TS typecheck/test/build에 영향 없어야 함.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 위치 `apps/macos/Baton`(SwiftPM)로 둘지(기본).
2. v0.14를 읽기+watch+승인 액션 슬라이스로 한정하고 설정/새 run 폼은 후속(기본).

## Risks

`risks.md` 참조. 핵심: UI 검증 비대칭, subprocess/NDJSON 파싱, 스키마 드리프트,
모노레포 간섭, `baton` 미발견, 안전 우회.

## Recommendation

`apps/macos/Baton`에 SwiftPM 패키지로 앱을 시작한다. v0.13 계약을 Codable 모델로 1:1
매핑하고, `BatonClient`(주입형 CommandRunner)·`RunsStore`(리듀서)를 `swift test`로
게이트한다. View는 얇게(RunsList/RunDetail + 승인 액션) 두고 수동 QA 체크리스트를
문서화한다. TS 모노레포는 불간섭(회귀 0). 안전은 전적으로 `baton` CLI에 위임한다.
상세는 `design.md`.
