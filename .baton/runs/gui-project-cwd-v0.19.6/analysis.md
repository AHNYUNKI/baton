# Analysis

## User Request
앱이 로컬 프로젝트의 source 경로를 baton workingDirectory로 사용해, team-run/plan/watch가 올바른
저장소에서 실행되도록 수정. 그래야 GUI 모니터·조직도 점등이 실제 동작.

## Intent
로컬 우선·프로젝트별 별도 저장소 모델을 GUI에서 정상화. (테스트 중 발견한 갭 수정.)

## Current Repository Understanding
- `BatonClient.init(executable:, workingDirectory:URL?, timeoutSeconds:)` 존재 → ProcessRunner가
  `process.currentDirectoryURL = workingDirectory`. **인프라 완비.**
- `BatonApp`: 글로벌 `BatonClient(executable: BatonLocation.resolve(preference:))`(workingDirectory
  nil) 생성. `batonExecutablePreference` 보유.
- `ProjectDetailView(client:)` → 같은 client를 `ExecutionView`/`ProjectPlanView`에 전달. team-run
  (start/approve/reject/review/show/list)·plan generate·watch에 사용 → **글로벌 cwd(버그)**.
- 프로젝트 메타(list/create/get/setTeamPlan)는 batonHome 전역 → cwd 무관(스코프돼도 정상).
- 실행/plan-gen cwd = 프로젝트 저장소여야: 플래너 projectCwd = source.value, team-run worktree
  repoRoot = context.cwd. 둘 다 source.value로 맞추면 정합.

## Relevant Files
| File | Reason |
|---|---|
| `Sources/BatonKit/Settings/ProjectWorkingDirectory.swift`(신규/순수) | `localWorkingDirectory(for:Project)->URL?` |
| `Sources/BatonApp/BatonApp.swift` | 프로젝트 뷰에 executable preference(또는 client 팩토리) 전달 |
| `Sources/BatonApp/RootView.swift` 또는 ProjectDetailView 생성부 | 스코프 client 주입 경로 |
| `Sources/BatonApp/ProjectDetailView.swift` | source 경로로 스코프 client 구성→자식 전달 |
| `Tests/BatonKitTests/ProjectWorkingDirectoryTests.swift` | local→URL / github→nil |

## Existing Behavior
프로젝트 뷰가 글로벌 client(cwd 없음) 사용 → CLI로 만든 프로젝트 run을 못 봄, 실행이 엉뚱한 cwd.

## Target Behavior
로컬 프로젝트 진입 시 `BatonClient(executable: resolve(preference), workingDirectory:
localWorkingDirectory(for: project))`로 스코프된 client를 만들어 ProjectDetailView/ExecutionView/
ProjectPlanView가 사용 → team-run/plan/watch가 `source.value`에서 실행·조회. github 소스는
workingDirectory nil(기본). 글로벌 뷰(목록/대시보드)는 기존 글로벌 client 유지.

## Constraints
- Swift 단독, `packages/*` 무변경(TS 회귀 0). 앱은 `baton` CLI만, credential 무접근.
- 순수 로직(localWorkingDirectory)은 BatonKit 테스트, 뷰 배선은 수동 QA.
- 기존 글로벌 동작/화면 보존(회귀 0). Swift 6 concurrency.

## Assumptions
- 로컬 source.value = 프로젝트 git 저장소 경로(존재·git repo 가정; 아니면 baton이 오류 — 정상).
- github 소스는 실행 비대상(참조 전용) → 스코프 불필요.

## Risks
- 경로 미존재/비-git → baton 오류(친절히 표면화). 스코프 자체는 무해.
- 글로벌 vs 스코프 client 혼선 → 프로젝트 범위 작업만 스코프, 글로벌은 그대로(명확히 분리).

## Recommendation
순수 `localWorkingDirectory(for:)` + ProjectDetailView에서 스코프 client 구성(자식 전달). preference
는 BatonApp에서 전달. Swift 단독, packages 무변경. 게이트 swift build/test + `git diff -- packages`
비어 있음.
