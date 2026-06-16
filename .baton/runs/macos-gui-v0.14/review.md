# Review — macos-gui-v0.14

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-macos-gui-v0.14`(branch `baton/macos-gui-v0.14`,
base `origin/main`). **결론: BLOCKED — Swift 게이트 검증 불가(환경: CLT 깨짐).
코드/TS는 양호. 머지 보류.**

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| TS 격리/회귀 | ✅ `apps/`만 추가, `packages/*` 무수정, **TS 193 passed**(회귀 0) |
| Swift 코드 정적 리뷰 | ✅ 계약/안전 양호(아래) |
| **`swift build` / `swift test`** | ❌ **검증 불가** — 머신 CLT 툴체인 깨짐(코드 무관) |

## Toolchain Block (환경, 코드 아님)

- `xcode-select -p` → `/Library/Developer/CommandLineTools`(전체 Xcode 없음).
- **최소 SwiftPM 패키지조차 동일 실패**: manifest 링크 단계에서
  `PackageDescription.Package.__allocating_init` undefined symbols(arm64) → CLT의
  PackageDescription 라이브러리 불일치(컴파일러 6.2.4 vs CLT SDK).
- 즉 `swift build`/`swift test`는 **이 환경에서 코드와 무관하게 불가**. 앱 코드 결함
  아님.
- 해결: 전체 Xcode 설치 또는 CLT 재설치(`xcode-select --install` / CLT 재설치) 후
  `swift build && swift test` 재실행 — sudo/설치 필요라 사용자 조치 영역.

## Static Review (컴파일 불가로 코드 정독)

- Swift 18파일 존재(Package, Contract×5, Client×3, Store, App×3, Tests×4).
- `BatonClient`: 모든 명령이 **argv 배열**(`["run","list","--json"]`,
  `["run","approve",runId]`, `["run","resume",id]`, `["run","clean",id]`,
  `["state","--json"]`) — 셸 결합 없음. `FileManager`/`.baton` 직접 쓰기 없음(공식
  `baton`만 호출) → 안전 우회 없음. `baton` 미발견/비정상 종료/빈 출력 → 명확한 에러
  case(크래시 없음).
- `JsonEnvelope`: `schemaVersion == 1` guard → 불일치 시 `unsupportedSchemaVersion`
  throw(크래시 없음). v0.13 계약 매핑.
- Contract/Store/NDJSONParser/Tests 파일 존재(BatonKit에 로직 집중, View 얇음 — 설계
  의도대로). **단, 컴파일·테스트 미검증이라 런타임 정확성은 보증 못 함.**

## Acceptance Criteria

- 충족 확인: AC-04/05/06/07/09/14(정적), AC-15(TS 회귀 0).
- **미검증(BLOCKED)**: AC-02(swift build), AC-03(swift test), 따라서 AC-08/10/11
  (테스트로 보장돼야 하나 실행 불가), AC-12/13/16(swift build 의존).

## Decision

지난 13개 마일스톤의 기준은 "게이트 통과 + 독립 검증"이다. v0.14는 **주 게이트
(swift build/test)를 환경 문제로 검증할 수 없으므로 머지 보류**한다(코드 결함 아님).
TS는 무관하게 안전(회귀 0)하므로 TS 제품에는 영향 없음.

### Options

1. **툴체인 수리 후 재검증(권장)**: 전체 Xcode 설치 또는 CLT 재설치 → `swift build &&
   swift test` 통과 확인 → 그때 커밋/PR. 환경 정상화가 근본 해결.
2. **정적 리뷰만으로 머지(주의)**: Swift 게이트 미검증임을 PR에 명시하고 병합. 기존
   품질 기준(게이트 통과)을 일부 완화하는 것이라 권장하지 않음.
3. **보류**: 툴체인 정상 환경(전체 Xcode 있는 머신/CI)에서 검증할 때까지 v0.14 대기.

## Reviewer Notes

- 커밋/푸시 없음 — 보류.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정, `packages/*` 미수정 확인.

---

## Update (toolchain fixed): REWORK — real compile error

전체 Xcode 26.5로 툴체인 정상화 후 `swift build` 재실행 → **환경 문제는 해소,
이번엔 실제 코드 오류**:

```
Sources/BatonKit/Client/BatonClient.swift:164:24: error: passing closure as a
'sending' parameter risks causing data races [#SendingClosureRisksDataRace]
  → AsyncThrowingStream { continuation in let task = Task { ... } } 가 mutable var
    'arguments'를 캡처(Swift 6 strict concurrency 위반).
```

- 단일 오류에서 컴파일 중단 → 그 이후 오류는 아직 미노출(이 줄 수정 후 추가 발생 가능).
- 환경 BLOCK은 해제, 이제 **코드 REWORK** 필요. Codex가 수정해야 함(분석/설계 에이전트는
  소스 미수정).

### Rework spec (Codex)
- `BatonClient.swift` watch 스트림: 클로저가 캡처하는 `arguments`를 **불변 복사**로
  만들어 data-race 경고 제거. 예: `let args = arguments` (또는 capture list
  `Task { [arguments] in ... }`, 혹은 함수 인자를 let 상수로). `runner.stream(arguments:)`
  호출도 그 상수 사용.
- 이후 `swift build`가 깨끗할 때까지 반복(AsyncThrowingStream/Process 스트리밍은 Swift 6
  concurrency 마찰 지점 — Sendable/MainActor/sending 경고가 추가로 날 수 있음).
- 게이트: `swift build` + `swift test` 통과 + 루트 TS 게이트 회귀 0.
- base 유지(`baton/macos-gui-v0.14`, origin/main). commit/push 금지.

---

## Final Verdict (rework + toolchain fixed): ✅ APPROVE

전체 Xcode 26.5 정상화 + Codex 재작업 후 직접 재검증:

| 항목 | 결과 |
|---|---|
| `swift build` | ✅ Build complete |
| `swift test` | ✅ **22 tests passed (0 failures)** |
| TS 회귀 | ✅ **193 passed**, `packages/*` 무수정 |
| watch data-race 수정 | ✅ `let streamArguments = arguments` + `Task { [runner, streamArguments] in … }` (불변 캡처) |
| NDJSON | ✅ envelope kind 검증 후 디코드 |
| 안전(정적) | ✅ argv 배열, `.baton` 미접근(공식 baton만), schemaVersion 불일치 throw |

AC-01~16 충족(UI(AC-12/13)는 `swift build` 컴파일 + README 수동 QA 체크리스트로 한정 —
설계대로). 환경 BLOCK 해소 + Swift 6 concurrency 결함 수정 완료. **머지 가능.**
