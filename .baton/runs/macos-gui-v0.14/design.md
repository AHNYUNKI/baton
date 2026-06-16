# Implementation Design

## Summary

`apps/macos/Baton`(SwiftPM)에 네이티브 SwiftUI macOS 앱의 **첫 슬라이스**를 만든다.
앱은 v0.13 통합 계약(`--json` 봉투 + `baton watch` NDJSON + run/approve/resume/clean)을
통해 `baton` CLI에 subprocess로 붙는다(HTTP 없음). Xcode 부재를 감안해 **로직(Codable
모델·BatonClient·RunsStore)을 `swift test`로 게이트**하고 View는 얇게(수동 QA) 둔다.
TS 모노레포는 불간섭(회귀 0). 안전은 전적으로 `baton` CLI에 위임.

## Scope

### In Scope

- SwiftPM 패키지(BatonApp 실행 + BatonKit 라이브러리 + BatonKitTests)
- v0.13 계약 Codable 모델(봉투/RunSummary/RunDetail/State/WatchEvent)
- `BatonClient`(주입형 CommandRunner: 읽기 `--json`/쓰기 명령/watch NDJSON 파싱)
- `RunsStore`(ObservableObject + 순수 리듀서)
- 얇은 SwiftUI: RunsList + RunDetail + 승인/재개/clean 액션
- `swift test`(로직) + 수동 QA 체크리스트 문서

### Out of Scope

- 설정/대시보드/새 run 폼(후속 슬라이스), .app 패키징/서명/배포, Xcode 프로젝트,
  HTTP 서버, 앱의 `.baton` 직접 변경

## Proposed Architecture

```text
apps/macos/Baton/                      # SwiftPM (TS 모노레포와 분리)
  Package.swift                        # products: BatonApp(exe), BatonKit(lib); test target
  Sources/
    BatonKit/                          # 테스트 가능 로직 (swift test 게이트)
      Contract/                        # v0.13 계약 Codable
        JsonEnvelope.swift             # { schemaVersion:1, kind, data:T }
        RunSummary.swift RunDetail.swift StateSnapshot.swift WatchEvent.swift
      Client/
        CommandRunner.swift            # protocol run(args)->(stdout,stderr,exit); ProcessRunner(real); 주입형
        NDJSONParser.swift             # 라인 분할(부분 라인/버퍼)
        BatonClient.swift              # argv 구성 + 봉투 디코드 + watch 스트림
      Store/
        RunsStore.swift                # @MainActor ObservableObject + reduce(WatchEvent)
    BatonApp/                          # 얇은 View (수동 QA)
      BatonApp.swift                   # @main App
      RunsListView.swift RunDetailView.swift
  Tests/BatonKitTests/                 # 모델/클라이언트/파서/스토어 테스트 + 픽스처
  README.md                            # 빌드/실행/QA/계약

데이터 흐름:
  앱 시작 → BatonClient.listRuns()/state() (--json 봉투 디코드) → RunsStore 초기화
          → BatonClient.watch() NDJSON 스트림 → RunsStore.reduce(event) → View 갱신
  사용자 액션(Approve/Reject/Resume/Clean) → BatonClient.run*(…) → watch/재조회 반영
```

핵심: View는 BatonKit(테스트된 로직)에만 의존. 비즈니스 로직은 전부 BatonKit.

## File-Level Plan

| File | Change |
|---|---|
| `apps/macos/Baton/Package.swift` | SwiftPM 매니페스트(타깃 3종, macOS 13+) |
| `Sources/BatonKit/Contract/*.swift` | 봉투 + Run*/State/WatchEvent Codable |
| `Sources/BatonKit/Client/CommandRunner.swift` | 실행 프로토콜 + Process 구현 + 주입 |
| `Sources/BatonKit/Client/NDJSONParser.swift` | 라인 파서(버퍼/부분 라인) |
| `Sources/BatonKit/Client/BatonClient.swift` | argv 구성 + 디코드 + watch |
| `Sources/BatonKit/Store/RunsStore.swift` | ObservableObject + 순수 reduce |
| `Sources/BatonApp/*.swift` | @main App + RunsList/RunDetail View(얇게) |
| `Tests/BatonKitTests/*.swift` | 모델/클라이언트/파서/스토어 테스트 + v0.13 픽스처 |
| `apps/macos/README.md` | 빌드/실행/QA 체크리스트/계약 |
| `apps/macos/.gitignore`(또는 루트) | `.build/` 무시 |

## Data Model Changes

TS 측 변경 없음. Swift Codable 모델이 v0.13 JSON 계약을 **소비**:

```swift
struct JsonEnvelope<T: Decodable>: Decodable { let schemaVersion: Int; let kind: String; let data: T }
struct RunSummary: Decodable, Identifiable { let runId: String; let status: String; let dryRun: Bool
  let workflowId: String; let createdAt: String; let updatedAt: String?; let stepCount: Int; let outcome: String? ; var id: String { runId } }
struct RunDetail: Decodable { let run: RunRecord; let artifacts: [String] }   // run.json 형태 + 파일 목록
struct StateSnapshot: Decodable { let total: Int; let byStatus: [String:Int]; let recent: [RunSummary] }
enum WatchEventType: String, Decodable { case created="run.created", updated="run.updated", statusChanged="run.status-changed", removed="run.removed" }
struct WatchEvent: Decodable { let type: WatchEventType; let runId: String; let status: String? ; ... }
```

schemaVersion != 1 → 디코드 에러로 명확히(크래시 금지).

## API / CLI Changes

CLI 표면 불변(앱이 기존 명령 소비). 신규는 전부 Swift 패키지(`apps/macos`).

## Workflow / Safety Considerations

- 앱은 **공식 `baton` 명령만** 호출(읽기 `--json`, 쓰기 run/approve/resume/clean).
  승인 게이트·worktree 격리는 core가 강제 — 앱은 우회하지 않는다.
- Process는 (executable, args[]) 배열 인자(셸 평가/인젝션 없음). 사용자 입력은 인자로.
- `.baton` 직접 파일 변경 없음. credential/세션 토큰 미취급.
- `baton` 위치: 설정 또는 PATH. 미발견 시 명확한 안내(크래시 없음).

## Error Handling

- subprocess 비정상 종료/빈 출력 → 에러 모델로(throw), UI는 안내.
- schemaVersion/디코드 실패 → 명확한 에러.
- watch 부분 라인 → 버퍼링 후 완전한 줄만 디코드.
- watch 프로세스는 앱/뷰 수명에 맞춰 종료(누수 방지).

## Test Plan

`test-plan.md` 참조. `swift test`: 픽스처 디코드, argv 구성, NDJSON 파서, RunsStore
리듀서. `swift build`로 View 컴파일. TS 게이트 불변(회귀 0). 실제 baton은 수동 QA.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-G01 → task-G06 의존성 순서를 따른다.
- **이건 Swift 작업(TS 아님)** — `apps/macos/Baton`에 SwiftPM. `packages/*` 미수정.
- 게이트: `swift build` + `swift test`(apps/macos/Baton) **그리고** 기존 TS
  `pnpm typecheck/test/build` 회귀 0. UI는 자동 테스트 불가 → 수동 QA 체크리스트.
- v0.13 계약(schemaVersion 1 봉투, watch NDJSON)만 소비. 안전은 `baton` CLI 위임.

## Non-Goals

- 설정/대시보드/새 run 폼, .app 패키징/서명, Xcode 프로젝트, HTTP 서버.

## Review Checklist

- [ ] `swift build`/`swift test` 통과. TS 게이트 회귀 0(packages/* 미수정).
- [ ] 봉투/모델이 v0.13 픽스처 디코드, schemaVersion 불일치 에러 처리.
- [ ] BatonClient argv 배열(셸 결합 없음), watch NDJSON 부분 라인 안전.
- [ ] RunsStore 리듀서 결정적(이벤트별), View는 얇음(로직은 BatonKit).
- [ ] 앱이 `.baton` 직접 변경 없이 `baton`만 호출(안전 우회 없음), credential 미취급.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ 이 마일스톤은 Swift다 (TS 아님) + Base Branch

- **반드시 `origin/main`에서 분기**: `git worktree add ../baton-macos-gui-v0.14
  -b baton/macos-gui-v0.14 origin/main`. 분기 후 `git merge-base --is-ancestor
  origin/main HEAD` 확인. 직전 테스트 수(TS 193)는 변하지 않아야 함(apps 추가는 TS 무관).
- 신규 코드는 **전부 `apps/macos/Baton`(SwiftPM)**. `packages/*`(TS) 수정 금지.
- 게이트: (1) `apps/macos/Baton`에서 `swift build` + `swift test` 통과, (2) 루트에서
  기존 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- **UI(SwiftUI View)는 자동 테스트 불가**(Xcode 부재) → 로직을 BatonKit에 모아
  `swift test`로 검증하고, View는 얇게 + 수동 QA 체크리스트 문서화. 정직히 보고.

### Goal

Baton 네이티브 SwiftUI macOS 앱의 첫 슬라이스를 `apps/macos/Baton`(SwiftPM)에 만든다.
v0.13 계약(`--json` 봉투 + `baton watch` NDJSON + run/approve/resume/clean)으로 `baton`
CLI에 subprocess로 붙는다(HTTP 없음). 로직(Codable 모델·BatonClient·RunsStore)을
`swift test`로 게이트하고 View(RunsList/RunDetail + 승인 액션)는 얇게 둔다. 안전은
전적으로 `baton` CLI에 위임(승인 게이트/격리 우회 금지). TS 모노레포 불간섭.

성공 기준은 "앱 화면"이 아니라 **계약 정확 디코드 + 테스트된 로직 레이어 + 안전 우회
없음 + TS 회귀 0**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/macos-gui-v0.14/design.md`
3. `.baton/runs/macos-gui-v0.14/tasks.json`
4. `.baton/runs/macos-gui-v0.14/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. `docs/INTEGRATION.md`(v0.13 계약) + 실제 `baton ... --json`/`baton watch` 출력
6. `AGENTS.md`(HTTP 서버 비목표)

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create (전부 apps/macos/Baton/)

- `Package.swift`
- `Sources/BatonKit/Contract/{JsonEnvelope,RunSummary,RunDetail,StateSnapshot,WatchEvent}.swift`
- `Sources/BatonKit/Client/{CommandRunner,NDJSONParser,BatonClient}.swift`
- `Sources/BatonKit/Store/RunsStore.swift`
- `Sources/BatonApp/{BatonApp,RunsListView,RunDetailView}.swift`
- `Tests/BatonKitTests/{ContractTests,BatonClientTests,NDJSONParserTests,RunsStoreTests}.swift`
  (+ v0.13 JSON 픽스처)
- `apps/macos/README.md`, `apps/macos/.gitignore`(.build/)

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- `packages/*`(TS) 수정 금지(모노레포 불간섭, TS 회귀 0).
- HTTP/소켓 서버 도입 금지. 앱이 `.baton` 파일 직접 변경 금지(CLI 경유만).
- pnpm 워크스페이스 글롭에 apps 포함 금지(TS 게이트 무영향).

### Step-by-Step Implementation Plan

1. `.baton/runs/macos-gui-v0.14/`의 design/tasks/… + `docs/INTEGRATION.md` 읽고, 실제
   `baton run list --json`/`baton watch --once` 출력을 픽스처로 캡처.
2. `Package.swift`: products BatonApp(executable, SwiftUI), BatonKit(library), 테스트
   타깃. macOS 13+. `swift build` 성공. (task-G01)
3. Contract Codable 모델 + v0.13 픽스처 디코드 테스트(schemaVersion 1, 불일치 에러,
   optional 안전). (task-G02)
4. `CommandRunner`(protocol + Process 구현 + 주입형 가짜) + `BatonClient`(읽기/쓰기
   argv **배열** 구성, 봉투 디코드, `baton` 미발견/비정상 종료 에러) + 테스트. (task-G03)
5. `NDJSONParser`(라인/버퍼/부분 라인) + `BatonClient.watch` 스트림 + 파서 테스트. (task-G04)
6. `RunsStore`(@MainActor ObservableObject + 순수 reduce(WatchEvent): created/removed/
   status-changed/updated, 결정적 정렬) + 리듀서 테스트. (task-G05)
7. 얇은 SwiftUI(RunsList/RunDetail + Approve/Reject/Resume/Clean 액션, BatonKit 호출) +
   `apps/macos/README.md`(빌드/실행/QA 체크리스트) + `.gitignore`. `swift build`/`swift
   test` 통과 + 루트 TS 게이트 회귀 0 확인. 자체 diff 리뷰, 최종 요약. (task-G06)

### Test / Gate Commands

```bash
# Swift (apps/macos/Baton 디렉터리에서)
swift build
swift test
# TS 모노레포 (루트, 회귀 0 확인)
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
node packages/cli/dist/main.js run --help
```

명령 미실행/실패는 성공으로 위장하지 말고 그대로 보고(특히 UI는 자동 테스트 불가임을 명시).

### Acceptance Criteria

`.baton/runs/macos-gui-v0.14/acceptance-criteria.md`의 AC-01 ~ AC-16 전부 충족.
특히: swift build/test(AC-02/03), 픽스처 디코드/버전 에러(AC-05), argv 배열·미발견
에러(AC-06/09), NDJSON 부분 라인(AC-08), 리듀서 결정적(AC-10/11), 안전 우회 없음(AC-14),
TS 회귀 0(AC-15).

### Constraints

- Swift 6.2 / SwiftPM. macOS 13+. View는 얇게, 로직은 BatonKit(테스트).
- v0.13 계약만 소비(schemaVersion 1). HTTP 서버 금지. Process 배열 인자.
- 앱은 `baton` CLI만 호출(안전 우회 금지), `.baton` 직접 변경 금지, credential 미취급.
- `packages/*` 미수정(TS 회귀 0). base = `origin/main`. 새 worktree. **commit/push 금지**.

### Expected Final Summary Format

```md
## Summary
- 무엇이 / 왜 바뀌었는지

## Changed Files
| File | Change |
|---|---|

## Commands Run
| Command | Result |   # swift build/test 및 TS 게이트 결과 모두

## Tests
- Passing(swift test / TS):
- Failing:
- Not run / 수동 QA만 가능(UI):

## Risks / TODOs
- 설정/새 run/대시보드, .app 패키징, Xcode UI 테스트 등 남은 항목

## Notes for Reviewer
- 계약 디코드/버전 에러, argv 배열·미발견 에러, NDJSON 부분 라인, 리듀서 결정성,
  안전 우회 없음, TS 회귀 0, UI는 수동 QA임을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
