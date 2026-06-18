# Test Plan — gui-project-cwd-v0.19.6

게이트: **swift build/test** + **TS 회귀 0**(`git diff -- packages` 비어 있음). 뷰는 swift build
컴파일 + 수동 QA.

## Swift Unit (swift test)
### localWorkingDirectory(for:)
- local 소스 + 유효 경로 → `URL(fileURLWithPath:)`.
- github 소스 → nil.
- 빈/공백 source.value → nil.

## Build / Manual QA
- `swift build`: ProjectDetailView 스코프 client 배선 포함 컴파일.
- 수동 QA:
  - calc-demo(로컬) 프로젝트 선택 → 실행 탭에 CLI로 만든 team-run 표시.
  - 승인/실행/조직도 점등이 그 프로젝트 저장소 기준으로 동작.
  - 글로벌 뷰(대시보드/프로젝트 목록) 정상(회귀 없음).

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 앱은 `baton` CLI만, credential 무접근.

## Out of Scope
- TS 변경, github 클론, cwd 설정 UI, SwiftUI 자동 UI 테스트.

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```
