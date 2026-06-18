# Request — gui-project-cwd-v0.19.6

## 배경 (테스트 중 발견한 갭)

end-to-end 테스트(계산기) 중 발견: team-run은 **`baton` 실행 cwd**(`<project>/.baton/runs/`)에
저장되는데, macOS 앱은 `BatonClient(executable:)`만 쓰고 **`workingDirectory`를 프로젝트 경로로
설정하지 않는다**(nil). 결과:
- 앱이 CLI로 만든 프로젝트의 team-run을 **못 본다**(앱 프로세스 cwd에서 baton 실행).
- 앱에서 실행 시작 시 **엉뚱한 디렉터리**에서 작업.

→ "로컬 우선 · 프로젝트마다 별도 git 저장소" 모델이 GUI에서 제대로 동작하려면, 앱이 로컬
프로젝트의 `source.value`를 baton의 workingDirectory로 넘겨야 한다.

## 사용자 결정

순서: **이 cwd 갭을 먼저 수정** → 그 다음 GUI에서 실제 AI 쓰기 실행 → 조직도 라이브 점등 확인.

## 핵심 사실

- `BatonClient.init(executable:, workingDirectory:URL?, timeoutSeconds:)` + ProcessRunner
  `currentDirectoryURL`가 **이미 존재**. 인프라 OK — 앱이 안 넘길 뿐.
- `ProjectDetailView`/`ExecutionView`/`ProjectPlanView`는 `let client: BatonClient`를 주입받아
  team-run/plan/watch에 사용(현재 글로벌 client). 글로벌 뷰(프로젝트 목록/대시보드)는 그대로.
- 프로젝트 메타(project list/create)는 batonHome 전역 → cwd 무관. team-run/plan 실행만 cwd 의존.

## 범위

로컬 프로젝트 진입 시 **source 경로로 스코프된 BatonClient**를 만들어 프로젝트 범위 작업
(plan generate/run·team-run·watch)에 사용. github 소스(참조 전용, 로컬 없음)는 스코프 없음(기본).
Swift 단독, packages 무변경(TS 회귀 0).

## 결과물
`.baton/runs/gui-project-cwd-v0.19.6/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
