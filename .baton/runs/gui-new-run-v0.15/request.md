# Request

## Run

- runId: `gui-new-run-v0.15`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `macos-gui-v0.14` (PR #14, merged → main `168fbe6`)

## User Request

macOS 앱의 다음 슬라이스: **GUI에서 run을 생성**할 수 있게 한다. v0.14는 읽기 +
라이브 watch + approve/resume/clean까지 갖췄지만 **새 run을 시작할 UI가 없다**
(`BatonClient.startRun`은 있으나 앱에서 호출하는 화면이 없음). v0.15는 New Run 폼
(요청 + 워커 토글)·스토어 오케스트레이션·baton 실행 파일 경로 설정을 추가해 앱을
end-to-end로 "쓸 수 있게" 만든다.

## Scope (v0.15)

- `NewRunFormModel`(BatonKit, 테스트): 요청 + 워커 옵션 → `StartRunOptions`, 검증
- `RunsStore.startRun(request:options:)`: `client.startRun` 후 refresh(테스트)
- baton 실행 파일 **경로 설정**(앱 preference → `ProcessRunner(executable:)`), 해석 로직 테스트
- 얇은 SwiftUI: NewRun 시트(요청 + 토글 + Start) + "New Run" 진입 + 최소 Settings(경로)
- `swift test`(폼/스토어/경로 해석) + 수동 QA. README 갱신

## Out of Scope

- 대시보드, 전체 설정 화면(config 전체 편집), .app 패키징/서명, Xcode UI 테스트,
  CLI 표면 변경

## Constraints

- 통합은 v0.13 계약 + 기존 `baton` 명령만(HTTP 없음). 안전은 `baton` CLI 위임(승인
  게이트·격리 우회 금지). Process 배열 인자. credential 미취급.
- 로직은 BatonKit(테스트), View는 얇게(수동 QA). `packages/*`(TS) 미수정 → TS 회귀 0.
- 게이트: `swift build` + `swift test` + 루트 TS `pnpm typecheck/test/build` 회귀 0.
- base = `origin/main`(v0.1~v0.14).
