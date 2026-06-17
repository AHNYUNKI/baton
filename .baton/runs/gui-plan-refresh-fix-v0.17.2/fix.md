# Fix — 대표 생성 후 TeamPlan 화면 자동 갱신 (v0.17.2 핫픽스)

## 증상
프로젝트 계획 화면에서 "대표에게 맡기기"(generate)를 누르면, 대표가 TeamPlan을 실제로
생성·저장하는데(확인됨) **화면에 역할이 즉시 안 뜸**. **재오픈하면 보임**.

## 진단 (확정)
- 생성/저장/표시 경로 정상(재오픈 시 5개 역할 표시, CLI `project plan show`로도 확인).
- `ProjectPlanView.runGenerate`의 `Task { … await client.generateTeamPlan … editModel = … }`
  에서 **await 이후 @State 갱신이 메인 액터에서 즉시 반영되지 않아** SwiftUI 리렌더가 안 됨.
  (save() 경로도 동일 패턴 — 동일 보강 필요.)

## 수정 (apps/macos/Baton/Sources/BatonApp/ProjectPlanView.swift)
await 이후 UI 상태 갱신을 메인 액터에서 수행하도록 보장:

```swift
private func runGenerate() {
    let trimmed = overview.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    isGenerating = true; errorMessage = nil; statusMessage = nil
    Task { @MainActor in                       // ← 메인 액터 보장
        do {
            let plan = try await client.generateTeamPlan(projectId: project.id, overview: trimmed)
            editModel = TeamPlanEditModel(agentIds: project.agentIds, plan: plan)
            statusMessage = "대표가 역할 초안을 만들고 저장했습니다."
            onSaved()
        } catch {
            errorMessage = error.localizedDescription
        }
        isGenerating = false
    }
}
```
- `save()`도 동일하게 `Task { @MainActor in … }` (또는 `await MainActor.run { … }`)로.
- 권장: `onSaved()`가 부모 새로고침으로 이 뷰를 교체/리셋한다면, 갱신된 plan이 사라지지
  않도록 순서/식별자 확인(editModel 갱신 후 onSaved, 또는 onSaved가 저장된 plan을 반영).

## 검증
- 수동 QA: 개요 입력 → "대표에게 맡기기" → (claude 호출 수십 초 후) **재오픈 없이** 역할
  목록 + "생성 중" 해제 + 상태 메시지 표시.
- `swift build`/`swift test` 통과. 루트 TS 회귀 0. packages/* 미수정.

## 추가 변경 — TeamPlan을 기본 한국어로 (core)
대표가 만드는 역할 `name`/`description`/`instructions`를 **기본 한국어**로 출력하도록
플래너 프롬프트를 수정한다.

- `packages/core/src/projects/planner.ts`의 `buildPlanPrompt`에 지시 추가:
  "역할 name/description/instructions는 **한국어**로 작성하라. 단 `id`는 짧은 영문
  슬러그(예: analysis-design), `assignedAgentId`는 제공된 AI id(codex/claude) 그대로."
- 스키마/검증/봉투/저장은 불변(언어만 한국어). 기존 영문 plan도 계속 parse 가능(호환).
- 테스트: buildPlanPrompt가 "한국어" 지시를 포함하는지 단언(프롬프트 문자열). 플래너
  로직 테스트는 mock이라 그대로 통과.

## Codex Handoff (작은 패치 — GUI 갱신 + 한국어 plan)
- base = `origin/main`(현재 `2b6a269`)에서 `git worktree add ../baton-gui-plan-refresh
  -b baton/gui-plan-refresh-v0.17.2 origin/main`.
- 변경 1(GUI): `ProjectPlanView.swift`의 runGenerate/save를 `Task { @MainActor in … }`로
  UI 갱신 보장. (선택) 진행/상태 명확화.
- 변경 2(core): `planner.ts`의 `buildPlanPrompt`에 "name/description/instructions 한국어,
  id 영문 슬러그, assignedAgentId는 그대로" 지시 추가 + 프롬프트 테스트.
- 게이트: `apps/macos/Baton` `swift build`+`swift test`, 루트 `pnpm typecheck/test/build`
  회귀 0. packages/*는 planner만. commit/push 금지. 머지 후 worktree 정리.

## Acceptance
- [ ] generate 완료 시 재오픈 없이 역할 목록 표시 + "생성 중" 해제 + 상태 메시지.
- [ ] save도 동일하게 즉시 반영.
- [ ] buildPlanPrompt가 한국어 출력을 지시(테스트). 새로 생성되는 plan의 name/설명/지침이
  한국어, id는 영문 슬러그, assignedAgentId는 codex/claude.
- [ ] swift build/test 통과, 루트 TS 회귀 0.

---
## Review: ✅ APPROVE (independently verified)
- base origin/main 후손, 변경 3파일(ProjectPlanView/planner.ts/planner.test.ts).
- generate/save가 `Task { @MainActor in … }`로 UI 갱신 보장(재오픈 없이 반영).
- planner buildPlanPrompt: "name/description/instructions 한국어, id 영문 슬러그,
  assignedAgentId 그대로" 지시 + 테스트.
- swift build/test 51, 루트 TS 218(회귀 0).
