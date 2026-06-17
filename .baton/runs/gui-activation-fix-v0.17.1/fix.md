# Fix — macOS 앱 키보드 입력 불가 (v0.17.1 핫픽스)

## 증상
새 프로젝트 위저드에서 이름 TextField에 **타이핑이 안 됨**(클릭은 됨).

## 진단 (확정)
- `BatonApp.swift` = `@main` + `WindowGroup`만, **활성화 정책/활성화 코드 없음**.
- SwiftPM `.executable`을 `swift run`으로 실행 → 앱이 regular GUI로 활성화되지 않아
  창이 **key window가 안 됨** → 마우스 이벤트는 받지만 **키보드 입력이 TextField에
  전달되지 않음**. (바인딩 정상: `@State form` + `$form.name`. 포커스 코드 없음.)

## 수정 (apps/macos/Baton/Sources/BatonApp/BatonApp.swift)
NSApplicationDelegateAdaptor로 앱을 regular 정책 + 활성화:

```swift
import SwiftUI
import AppKit

@main
struct BatonApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    var body: some Scene {
        WindowGroup { /* 기존 루트 뷰 */ }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}
```

(기존 BatonApp의 store 초기화 등은 그대로 유지. 위는 활성화만 추가.)

## 권장 보강 (선택)
- 이름 TextField에 `@FocusState` + `.focused(...)`로 위저드 진입 시 자동 포커스.
- `.textFieldStyle(.plain)`은 포커스 링이 없어 입력 가능 여부가 안 보임 → QA용으로
  기본 스타일 또는 시각적 포커스 표시 고려(디자인은 paperclip 유지).

## Codex Handoff (작은 패치)
- base = `origin/main`(현재 `fa4f19e`)에서 분기: `git worktree add
  ../baton-gui-activation-fix -b baton/gui-activation-fix-v0.17.1 origin/main`.
- 변경: `apps/macos/Baton/Sources/BatonApp/BatonApp.swift`에 위 활성화(AppDelegate).
  (선택) NewProjectView 이름 필드 `@FocusState` 자동 포커스.
- `apps/macos/Baton`에서 `swift build` 통과. 루트 TS 게이트 무영향(회귀 0).
- UI 입력은 자동 테스트 불가 → **수동 QA**: `swift run` 후 새 프로젝트 → 이름 타이핑 됨 확인.
- packages/* 미수정. commit/push 금지. 머지 후 worktree 즉시 정리.

## Acceptance
- [ ] `swift run` 후 앱이 최전면 활성화되고, 새 프로젝트 이름/소스 TextField에 타이핑 가능.
- [ ] swift build 통과, 루트 TS 회귀 0.

---

## Review: ✅ APPROVE (independently verified)
- base origin/main 후손, 변경 **2파일만**(BatonApp/NewProjectView), packages/* 무수정.
- 활성화: `@NSApplicationDelegateAdaptor` + `applicationDidFinishLaunching` →
  `setActivationPolicy(.regular)` + `activate(ignoringOtherApps:true)`. 자동 포커스
  `@FocusState`(name) + amber 포커스 링.
- `swift build` 성공, `swift test` 51 통과, 루트 TS 218(회귀 0).
- 실제 타이핑 가능 여부는 재실행 수동 QA로 최종 확인.
