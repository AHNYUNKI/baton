# Request

## Run

- runId: `macos-gui-v0.14`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `read-api-v0.13` (PR #13, merged → main `976f8f8`)

## User Request

Baton의 **네이티브 SwiftUI macOS 앱**을 만들기 시작한다. 앱은 v0.13에서 확정한 통합
계약(버전드 `--json` 스냅샷 + `baton watch` NDJSON + run/approve/resume/clean/config
명령)을 통해 `baton` CLI와 통신한다(HTTP 서버 없음, subprocess). v0.14는 **검증 가능한
첫 슬라이스**: 계약 모델 + 클라이언트 + 스토어(전부 `swift test`로 게이트) + 얇은 화면
(RunsList / RunDetail + 승인 액션).

## Toolchain Reality

- Swift 6.2 사용 가능(SwiftPM `swift build`/`swift test`). **전체 Xcode/xcodebuild 부재**
  → SwiftUI **화면/.app은 자동 게이트 불가, 수동 QA**. 따라서 로직(모델/클라이언트/
  스토어)을 테스트 가능 레이어로 최대화하고 View는 얇게 유지한다.

## Scope (v0.14)

- `apps/macos/Baton/`(SwiftPM 패키지): Package.swift, 앱 타깃 + 테스트 타깃
- v0.13 계약과 1:1 매칭되는 **Codable 모델**(JsonEnvelope schemaVersion 1, RunSummary,
  RunDetail, State, WatchEvent)
- `BatonClient`: `baton` subprocess 호출(읽기 `--json`/쓰기 명령), 봉투 디코드, `baton
  watch` NDJSON 스트림 파싱 — 주입형 CommandRunner로 테스트 가능
- `RunsStore`(ObservableObject): 스냅샷 로드 + WatchEvent 리듀서
- 얇은 SwiftUI: RunsList(사이드바) + RunDetail(steps/approvals/artifacts + approve/
  reject/resume) — 수동 QA
- `swift test`(모델/클라이언트/스토어) + 앱 실행 안내 문서

## Out of Scope

- 완전한 앱(설정/대시보드/새 run 폼은 후속 슬라이스), .app 패키징/서명/배포, Xcode
  프로젝트, HTTP 서버, 앱이 `.baton`를 직접 파일 변경(반드시 CLI 경유)

## Constraints

- 통합은 **v0.13 계약만**(schemaVersion 1 봉투, watch NDJSON). HTTP 서버 미도입.
- 앱은 Baton 안전(승인 게이트·worktree 격리)을 **우회하지 않음** — 공식 `baton` 호출.
  credential/세션 토큰 미취급.
- **TS 모노레포 불간섭**: `packages/*` 미수정, 기존 TS 게이트 회귀 0. Swift는 `apps/`에 별도.
- 검증: `swift build` + `swift test`(로직), UI는 수동 QA. base = `origin/main`(v0.1~v0.13).
