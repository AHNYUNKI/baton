# Implementation Design

## Summary

macOS 앱을 "관찰자"에서 "구동 도구"로 확장하고, **paperclip 영감의 디자인 언어를
확립**한다(다크 + 크림 텍스트 + 그라데이션 캡슐 + 한국어 UI). (1) `BatonTheme` 디자인
시스템 + 재사용 컴포넌트, (2) 기존 RunsList/RunDetail을 대시보드/티켓으로 **리스타일**,
(3) **GUI에서 새 run 생성**(NewRunFormModel/RunsStore.startRun/baton 경로 설정). 로직은
BatonKit(테스트), View는 얇게(수동 QA). 상태/역할→한국어 라벨·색 매핑은 순수 함수로
테스트. 안전은 `baton` CLI 위임, TS 모노레포 불간섭. **디자인 기준: `ux-direction.md`.**

## Scope

### In Scope

- `NewRunFormModel`(BatonKit): 폼 상태 → `StartRunOptions`, `isValid`
- `RunsStore.startRun(request:options:)`: startRun 후 refresh
- `BatonLocation.resolve(preference:)`(순수) + ProcessRunner 주입
- `startRun` argv 테스트 보강(전 옵션)
- 얇은 SwiftUI: NewRunView(시트) + "New Run" 진입 + 최소 Settings(경로)
- swift test(로직) + 수동 QA, README 갱신

### Out of Scope

- 대시보드, 전체 config 편집 화면, .app 패키징/서명, Xcode UI 테스트, CLI 변경

## Proposed Architecture

```text
NewRunView (얇은 View)
  └─ NewRunFormModel (BatonKit, 테스트): request + toggles
       buildOptions() -> StartRunOptions ; isValid
  └─ Start → RunsStore.startRun(request, options)
                └─ BatonClient.startRun(request, options)   # argv 배열(기존)
                └─ await load()/refresh                     # 즉시 반영(+ 라이브 watch)

Settings (얇은 View)
  └─ baton 경로 입력 → preference
       BatonLocation.resolve(preference) -> executable      # 테스트 가능
       → ProcessRunner(executable:) → BatonClient
```

로직은 전부 BatonKit(테스트), View는 BatonKit 호출만(수동 QA).

## File-Level Plan

| File | Change |
|---|---|
| `Sources/BatonKit/Forms/NewRunFormModel.swift`(신규) | 폼 상태 + buildOptions + isValid |
| `Sources/BatonKit/Settings/BatonLocation.swift`(신규) | resolve(preference) 순수 |
| `Sources/BatonKit/Store/RunsStore.swift` | `startRun(...)` 오케스트레이션 |
| `Sources/BatonKit/Client/BatonClient.swift` | (필요 시) startRun argv 정리 |
| `Sources/BatonApp/NewRunView.swift`(신규) | 요청+토글 시트 |
| `Sources/BatonApp/SettingsView.swift`(신규) | baton 경로 입력(최소) |
| `Sources/BatonApp/*`(앱 진입/툴바) | "New Run" + Settings 진입 |
| `Tests/BatonKitTests/*` | 폼/스토어/경로/argv 테스트 |
| `apps/macos/README.md` | 새 run/경로 + 수동 QA |

## Data Model Changes

신규는 모두 앱 측(Swift). `StartRunOptions`(기존) 재사용. `NewRunFormModel`은 폼 상태.
`BatonLocation`은 경로 해석. TS/CLI/계약 불변.

## API / CLI Changes

CLI 표면 불변(기존 `baton run [flags]` 소비). 신규는 전부 Swift 패키지.

## Workflow / Safety Considerations

- 앱은 `baton run`만 호출(승인 게이트/worktree 격리는 core 강제, 우회 없음). `.baton`
  직접 변경 없음. Process 배열 인자(셸 인젝션 없음). credential 미취급.
- 사용자 지정 실행 파일 경로는 본인 baton(로컬). 미발견 시 기존 명확한 에러.

## Error Handling

- 빈 요청 → 폼 invalid(Start 비활성/거부).
- startRun 실패(preflight 등) → 에러 전파/상태 표면화(UI 안내, 크래시 없음).
- baton 미발견(경로 오설정) → executableNotFound류 에러(기존).

## Test Plan

`test-plan.md` 참조. NewRunFormModel(매핑/검증), startRun argv(전 옵션), RunsStore.startRun
(호출+refresh), BatonLocation(해석). swift build로 View 컴파일. TS 회귀 0.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-N01 → task-N05 의존성 순서를 따른다.
- Swift 작업(`apps/macos/Baton`). `packages/*` 미수정(TS 회귀 0).
- 로직은 BatonKit(테스트), View 얇게. 게이트: swift build/test + 루트 TS.
- 안전은 `baton` CLI 위임. Swift 6 concurrency 준수(sending/Sendable/MainActor).

## Non-Goals

- 대시보드, 전체 설정, .app 패키징, Xcode UI 테스트.

## Review Checklist

- [ ] NewRunFormModel 매핑/검증, startRun argv 전 옵션 정확(배열 인자).
- [ ] RunsStore.startRun이 client 호출 후 refresh, 실패 표면화.
- [ ] BatonLocation 해석 테스트, ProcessRunner 주입.
- [ ] View 얇음(BatonKit 의존), 빈 요청 Start 막힘. 안전 우회 없음.
- [ ] swift build/test 통과, TS 회귀 0(packages/* 미수정).

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Swift 작업 + Base Branch

- **반드시 `origin/main`에서 분기**: `git worktree add ../baton-gui-new-run-v0.15
  -b baton/gui-new-run-v0.15 origin/main`. 분기 후 `git merge-base --is-ancestor
  origin/main HEAD` 확인. 직전 TS 테스트 수(193)는 불변(apps 무관).
- 신규 코드는 **전부 `apps/macos/Baton`(SwiftPM)**. `packages/*`(TS) 수정 금지.
- 게이트: (1) `apps/macos/Baton`에서 `swift build` + `swift test` 통과, (2) 루트
  `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- UI(SwiftUI)는 자동 테스트 불가 → 로직을 BatonKit에 모아 `swift test`, View 얇게 +
  수동 QA 체크리스트 문서화. Swift 6 strict concurrency 준수(sending/Sendable/MainActor).

### Goal

macOS 앱에 **paperclip 영감의 디자인 언어**(다크 + 크림 + 그라데이션 캡슐 + **한국어
UI**)를 확립하고, **GUI에서 새 run을 생성**할 수 있게 한다. (1) `BatonTheme` + 재사용
컴포넌트(StatusPill/RoleBadge/RunCard/GradientButton), (2) RunsList(대시보드)/RunDetail
(티켓) 리스타일, (3) NewRunFormModel/RunsStore.startRun/baton 경로 설정 + NewRunView/
SettingsView. **디자인은 `.baton/runs/gui-new-run-v0.15/ux-direction.md`를 정확히 따른다.**

상태/역할 → 한국어 라벨·색 매핑은 BatonKit 순수 함수로 테스트. View는 얇게(수동 QA).
안전은 `baton` CLI 위임(게이트/격리 우회 금지).

성공 기준은 "화면"이 아니라 **디자인 언어 준수(다크/캡슐/한국어) + 폼→옵션/argv 정확 +
스토어 오케스트레이션 + 안전 우회 없음 + swift/TS 게이트 통과**다.

### 디자인 참조 (필수)

- `.baton/runs/gui-new-run-v0.15/ux-direction.md` — 다크 색(#141414/크림 #F2EAD8/뮤트
  #9A968C), 상태색(running=블루·틸/awaiting=앰버/completed=그린/failed=레드/cancelled·
  skipped=뮤트/planned=보라), 그라데이션 캡슐 모티프, 한국어 용어집(상태/역할/액션),
  화면 구성(대시보드/티켓/새 실행 시트/설정). 색만으로 상태 구분 금지 — 텍스트 라벨 병기.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/gui-new-run-v0.15/design.md`
3. `.baton/runs/gui-new-run-v0.15/tasks.json`
4. `.baton/runs/gui-new-run-v0.15/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. v0.14 `apps/macos/Baton`(BatonClient.startRun/StartRunOptions, RunsStore, CommandRunner)
   + `docs/INTEGRATION.md`
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton/)

- 신규(로직/테스트): `Sources/BatonKit/Forms/NewRunFormModel.swift`,
  `Sources/BatonKit/Settings/BatonLocation.swift`,
  `Sources/BatonKit/Theme/{StatusDisplay,RoleDisplay}.swift`(순수, 한국어 매핑),
  `Tests/BatonKitTests/{NewRunFormModelTests,BatonLocationTests,RunsStoreStartRunTests,StatusDisplayTests}.swift`
- 신규(View/디자인): `Sources/BatonApp/Theme/BatonTheme.swift`,
  `Sources/BatonApp/Components/{StatusPill,RoleBadge,RunCard,GradientButton}.swift`,
  `Sources/BatonApp/{NewRunView,SettingsView}.swift`, `apps/macos/UX.md`
- 수정: `Sources/BatonKit/Store/RunsStore.swift`(startRun), `Sources/BatonApp/{BatonApp,
  RunsListView,RunDetailView}.swift`(리스타일/진입), `Sources/BatonKit/Client/BatonClient.swift`
  (argv 정리), `Tests/BatonKitTests/BatonClientTests.swift`(argv 보강), `apps/macos/README.md`
- **디자인 기준**: `.baton/runs/gui-new-run-v0.15/ux-direction.md`(읽기 전용)를 정확히 따른다.

### Files NOT to Modify

- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용 입력), `packages/*`(TS).
- HTTP/소켓 서버 금지. 앱의 `.baton` 직접 변경 금지(CLI 경유만). 런타임 의존성 추가 금지.

### Step-by-Step Implementation Plan

1. 설계/태스크/AC/test-plan + v0.14 BatonClient/RunsStore 읽기.
2. `NewRunFormModel`(요청+토글, buildOptions()->StartRunOptions, isValid) + 테스트. (task-N01)
3. `BatonClient.startRun` argv 보강 테스트(전 옵션, 배열 인자). (task-N02)
4. `RunsStore.startRun(request:options:)`(client.startRun 후 load/refresh, 실패 표면화) +
   주입형 client 테스트. (task-N03)
5. `BatonLocation.resolve(preference:)`(순수) + ProcessRunner/BatonClient 주입 + 테스트. (task-N04)
6. 얇은 NewRunView(요청+토글+Start, 빈 요청 비활성) + SettingsView(baton 경로) + 앱
   진입("New Run"/Settings) + README 수동 QA. swift build/test + 루트 TS 회귀 0 확인.
   자체 diff 리뷰, 최종 요약. (task-N05)

### Test / Gate Commands

```bash
# Swift (apps/macos/Baton)
swift build
swift test
# TS (루트)
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
node packages/cli/dist/main.js run --help
```

### Acceptance Criteria

`.baton/runs/gui-new-run-v0.15/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: 폼 매핑/검증(AC-02/03), startRun argv 전 옵션(AC-07), 스토어 startRun+refresh
(AC-05), 경로 해석(AC-08), 안전 우회 없음(AC-12), TS 회귀 0(AC-13), swift 게이트(AC-15).

### Constraints

- Swift 6.x / SwiftPM. View 얇게, 로직 BatonKit(테스트). Swift 6 concurrency 준수.
- v0.13 계약 + 기존 `baton` 명령만. HTTP 금지. Process 배열 인자. 안전 우회 금지.
- `packages/*` 미수정(TS 회귀 0). base = `origin/main`. 새 worktree. **commit/push 금지**.

### Expected Final Summary Format

```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test 및 TS 게이트 결과)
## Tests (Passing swift/TS / Failing / 수동 QA만 가능(UI))
## Risks / TODOs (대시보드/전체 설정/.app 패키징 등)
## Notes for Reviewer (폼 매핑·argv, 스토어 refresh, 경로 해석, 안전 우회 없음, TS 회귀 0)
```

명령 미실행/테스트 실패는 정직하게 보고(UI는 수동 QA임 명시).
