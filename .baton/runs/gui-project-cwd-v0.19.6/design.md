# Implementation Design — gui-project-cwd-v0.19.6

## Summary

macOS 앱이 로컬 프로젝트의 `source.value` 경로를 baton의 **workingDirectory**로 사용하도록
수정한다. 프로젝트 상세/실행/계획 뷰가 그 경로로 스코프된 `BatonClient`를 써서 team-run·plan·
watch가 **올바른 프로젝트 저장소**에서 실행·조회된다. github 소스(참조 전용)는 스코프 없음.
인프라(`BatonClient(workingDirectory:)`)는 이미 존재 — 배선만 추가. Swift 단독, TS 무변경.

## Scope

### In Scope
- 순수 `localWorkingDirectory(for: Project) -> URL?`(local→경로 URL, github→nil) + 테스트.
- ProjectDetailView가 스코프된 client 구성→ExecutionView/ProjectPlanView 전달. preference는
  BatonApp에서 전달.
- README/UX 한 줄 + 수동 QA.

### Out of Scope
- TS/CLI 변경. github 클론. 프로젝트별 cwd 설정 UI(자동=source.value). 글로벌 뷰 변경.

## Proposed Architecture
```
BatonKit (순수)
  localWorkingDirectory(for: Project) -> URL?
    project.source.kind == "local" ? URL(fileURLWithPath: source.value) : nil

BatonApp
  BatonApp: batonExecutablePreference 보유(기존). ProjectDetailView 생성 시 preference 전달
    (또는 client 팩토리 클로저).
  ProjectDetailView(project, preference):
    let projectClient = BatonClient(
        executable: BatonLocation.resolve(preference: preference),
        workingDirectory: localWorkingDirectory(for: project))
    // 프로젝트 범위 작업(plan generate/run, team-run, watch)에 projectClient 사용,
    // ExecutionView/ProjectPlanView에도 projectClient 전달.
  글로벌 뷰(RootView 대시보드/프로젝트 목록/실행 목록)는 기존 글로벌 client 유지.
```
- 프로젝트 메타(list/create)는 전역이라 스코프돼도 정상 — 단, 프로젝트 범위 작업만 스코프하면 충분.

## File-Level Plan
| File | Change |
|---|---|
| `Sources/BatonKit/Settings/ProjectWorkingDirectory.swift`(신규) | `localWorkingDirectory(for:)` 순수 |
| `Sources/BatonApp/BatonApp.swift` | ProjectDetailView route에 preference(또는 팩토리) 전달 |
| `Sources/BatonApp/RootView.swift`(생성부) | preference 전달 경로 |
| `Sources/BatonApp/ProjectDetailView.swift` | 스코프 client 구성→자식 전달, 프로젝트 작업에 사용 |
| `Tests/BatonKitTests/ProjectWorkingDirectoryTests.swift` | local→URL / github→nil |
| `apps/macos/README.md`/`UX.md` | 프로젝트 cwd 스코프 + 수동 QA |

## Data Model Changes
없음.

## API / CLI Changes
없음(앱 내부 배선만).

## Error Handling
- source 경로 미존재/비-git → baton 명령이 오류 반환 → 기존 에러 표시 경로로 표면화.
- github 소스 → workingDirectory nil(글로벌과 동일 동작). 실행은 비대상.

## Security
앱은 `baton` CLI만. workingDirectory = 사용자가 등록한 프로젝트 경로. credential/HTTP 없음.

## Test Plan
`test-plan.md`. swift test: `localWorkingDirectory`(local→URL, github→nil, 공백/정규화). 뷰
배선은 swift build + 수동 QA(앱에서 calc-demo 선택 → 실행 탭에 CLI run 보임 → 조직도 점등).
`git diff -- packages` 비어 있음.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~06.

## Non-Goals
TS 변경, github 클론, cwd 설정 UI, 글로벌 뷰 변경.

## Review Checklist
- [ ] `localWorkingDirectory` 순수·테스트(local→URL, github→nil).
- [ ] ProjectDetailView/ExecutionView/ProjectPlanView가 스코프 client 사용(team-run/plan/watch).
- [ ] 글로벌 뷰/기존 동작 보존(회귀 0). packages 무변경(TS 회귀 0). swift build/test 통과.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-project-cwd
  -b baton/gui-project-cwd-v0.19.6 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**(`git diff -- packages`
  비어 있어야).
- 게이트: `apps/macos/Baton`에서 `swift build` + `swift test`. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
앱이 로컬 프로젝트의 `source.value`를 baton `workingDirectory`로 사용하도록 배선. 프로젝트 상세/
실행/계획 뷰가 그 경로로 스코프된 `BatonClient`를 써서 team-run·plan·watch가 올바른 저장소에서
동작. github 소스는 nil(기본). 인프라는 이미 있음(`BatonClient(workingDirectory:)`).

성공 기준: `localWorkingDirectory` 순수 테스트 + 프로젝트 뷰가 스코프 client 사용(team-run/plan/
watch) + 글로벌/기존 동작 보존(회귀 0) + TS 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/gui-project-cwd-v0.19.6/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 Swift: `BatonClient`(init executable/workingDirectory), `ProcessRunner`(currentDirectoryURL),
   `BatonApp`(batonExecutablePreference/BatonLocation.resolve), `ProjectDetailView`/`ExecutionView`/
   `ProjectPlanView`(client 주입), `Project`(source.kind/value).
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- 신규: `Sources/BatonKit/Settings/ProjectWorkingDirectory.swift`
  (`public func localWorkingDirectory(for project: Project) -> URL?` — source.kind=="local"이고
  경로 비어있지 않으면 `URL(fileURLWithPath:)`, 아니면 nil),
  `Tests/BatonKitTests/ProjectWorkingDirectoryTests.swift`.
- 수정: `Sources/BatonApp/ProjectDetailView.swift`(project로 스코프 client 구성 —
  `BatonClient(executable: BatonLocation.resolve(preference:), workingDirectory:
  localWorkingDirectory(for: project))` — 그리고 plan/team-run/watch 및 ExecutionView/
  ProjectPlanView 전달에 그 client 사용). `Sources/BatonApp/BatonApp.swift` 및 ProjectDetailView
  생성부(`RootView` 등): preference(또는 client 팩토리)를 ProjectDetailView로 전달.
  `apps/macos/README.md`/`UX.md` 갱신.
- 글로벌 뷰(대시보드/프로젝트 목록/실행 목록)는 **기존 글로벌 client 유지**(변경 금지).

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **`packages/*`(TS) 금지.** credential/HTTP 금지.
  기존 글로벌 동작/화면 삭제·변경 금지.

### Step-by-Step Plan
1. 설계 + BatonClient/BatonApp/ProjectDetailView 읽기.
2. `localWorkingDirectory(for:)` + 테스트(local→URL, github→nil, 공백).
3. ProjectDetailView 스코프 client 구성 + 자식/작업 배선. preference 전달 경로.
4. README/UX + 게이트(swift build/test + `git diff -- packages` 비어 있음) + 자체 리뷰 + 요약.

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```

### Acceptance Criteria
`.baton/runs/gui-project-cwd-v0.19.6/acceptance-criteria.md` AC-01~06.

### Constraints
- Swift 6. 순수 로직 BatonKit 테스트, 뷰 수동 QA. `packages/*` 미수정. credential/HTTP 없음.
- base=`origin/main`. commit/push 금지. 한국어/paperclip.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + git diff -- packages)
## Tests (Passing swift / 수동 QA만(UI))
## Scoping (로컬 프로젝트 source 경로를 workingDirectory로 / github→nil / 글로벌 뷰 보존)
## Risks / TODOs
## Notes for Reviewer (localWorkingDirectory 순수, 프로젝트 범위만 스코프, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
