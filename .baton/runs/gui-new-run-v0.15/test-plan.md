# Test Plan

게이트: **`swift test`**(apps/macos/Baton, 로직) + **루트 TS 게이트 불변**. UI는
`swift build` 컴파일 + **수동 QA**. 실제 `baton`은 주입형 fake CommandRunner로 mock.

## Swift Unit Tests (swift test)

### NewRunFormModel
- 기본 폼 → `buildOptions()`: 미설정 토글 nil, dryRun false.
- 각 토글/값 설정 → StartRunOptions에 정확 반영(useCodex/useClaude/useTest/
  testCommand/fixEnabled/maxFixAttempts).
- `isValid`: 빈/공백 요청 false, 정상 요청 true.
- maxFixAttempts: 빈값 nil, 값 정수.

### BatonClient.startRun argv
- 옵션 조합별 argv: `["run", req, ...]`에 --codex/--no-codex, --claude, --test,
  --test-command <c>, --fix, --max-fix-attempts <n>, --dry-run, --workflow/--project.
- 배열 인자(셸 결합 없음) 단언.

### RunsStore.startRun (주입형 client)
- startRun 호출 → client.startRun(request,options) 인자 전달 단언.
- 성공 후 load()/refresh 호출(목록 갱신) 단언.
- 실패(에러) → 전파/상태 표면화(크래시 없음).

### BatonLocation
- preference 경로 있으면 그 경로, 없으면 "baton".
- 공백/빈 preference → 기본.

## Build / Compile

- `swift build`: NewRunView/Settings 포함 앱 컴파일 성공.

## Manual QA Checklist (문서화, 자동 아님)

- "New Run" → 요청+토글 입력 → Start → 목록에 새 run(awaiting/실행) 표시.
- 빈 요청 시 Start 비활성.
- Settings에 baton 경로 입력 → 동작. 잘못된 경로 → 명확한 안내(크래시 없음).
- (워커 토글 조합) --codex/--claude/--test/--fix가 실제 `baton run`에 반영.

## Monorepo Isolation / Security

- `packages/*` 미수정, 루트 TS 게이트 193 회귀 0.
- Process 배열 인자, credential/세션 토큰/danger 문자열 부재, `.baton` 직접 쓰기 없음.

## Out of Scope (테스트 비대상)

- SwiftUI 화면 자동 테스트, 대시보드/전체 설정, .app 패키징, 실제 baton end-to-end.

## Gates

```bash
# Swift (apps/macos/Baton)
swift build && swift test
# TS (루트, 불변)
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
