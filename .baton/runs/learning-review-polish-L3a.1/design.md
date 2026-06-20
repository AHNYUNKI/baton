# Implementation Design — learning-review-polish-L3a.1

## Summary

L3a 학습 검토 뷰의 가독성·중복을 수정한다. 역할 카드 "왜" 패널을 `DisclosureGroup`(들여쓰기
유발)에서 **커스텀 접기(전체폭 좌측정렬)** 로 바꾸고, 순수 `displayExplanation`로 `## 학습 설명`
헤딩을 제거해 표시한다. 게이트 섹션은 체크포인트 역할의 **설명 재출력을 제거**하고(역할명 + 짧은
안내 + 버튼만) 역할 카드와의 중복을 없앤다. Swift 단독, `packages/*` 무변경(TS 회귀 0).

## Scope

### In Scope
- 순수 `displayExplanation(_ raw:) -> String`: 선두 `## 학습 설명` 헤딩 줄 제거 + 트림.
- ExecutionView: "왜" 패널 커스텀 접기(들여쓰기 제거·전체폭 좌측), 본문 = displayExplanation,
  줄바꿈 정상. 게이트 섹션 체크포인트 블록 설명 재출력 제거(안내+버튼만).
- 테스트(displayExplanation) + 수동 QA.

### Out of Scope
- 마크다운 풀 렌더(헤딩/리스트 스타일). TS/CLI 변경. 스트리밍(L3b/c).

## Proposed Architecture
```
BatonKit (순수)
  displayExplanation(_ raw: String) -> String
    선두 공백/빈 줄 무시 → 첫 줄이 "## 학습 설명"(트림 기준)이면 그 줄 제거 → 나머지 트림 반환.
    헤딩 없으면 원문 트림.

BatonApp/ExecutionView.swift
  TeamRunRoleRow "왜" 패널: DisclosureGroup 제거 →
    Button(toggle) { Label("왜", …) + chevron }   // @State isExplanationExpanded
    if expanded { Text(displayExplanation(explanation))
                    .frame(maxWidth:.infinity, alignment:.leading)
                    .fixedSize(horizontal:false, vertical:true) }   // 전체폭, 좌측, 줄바꿈
    배경/패딩은 패널 컨테이너에(들여쓰기 없음).
  게이트 canContinueCheckpoint 블록:
    역할명 + "위에서 강조된 ‘<역할명>’ 역할의 설명을 확인한 뒤 계속하세요." 안내(설명 본문 X)
    + 계속/거부 버튼(기존).
```

## File-Level Plan
| File | Change |
|---|---|
| `Sources/BatonKit/Org/TeamRunStatus.swift`(또는 신규 `Explanation.swift`) | `displayExplanation` 순수 |
| `Sources/BatonApp/ExecutionView.swift` | "왜" 커스텀 접기 + 게이트 설명 중복 제거 |
| `Tests/BatonKitTests/*` | displayExplanation 테스트 |

## Data Model Changes
없음(표시 로직만).

## API / CLI Changes
없음.

## Error Handling
- 헤딩 없는/빈 explanation → 원문 트림/미표시(graceful).

## Security / Safety
표시 변경만. 앱은 baton CLI만. credential/HTTP 없음. 기능/안전 불변.

## Test Plan
`test-plan.md`. swift test: displayExplanation(헤딩 제거/헤딩 없음/빈/선두 공백). View는 swift build
+ 수동 QA(왜 패널 좌측 전체폭·헤딩 없음, 게이트 설명 중복 없음). `git diff -- packages` 비어 있음.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~06.

## Non-Goals
마크다운 풀 렌더, TS 변경, 스트리밍.

## Review Checklist
- [ ] displayExplanation 순수·테스트(헤딩 제거). "왜" 패널 전체폭 좌측·들여쓰기 없음·헤딩 미노출.
- [ ] 게이트 섹션 설명 본문 중복 제거(안내+버튼만). 접기/펼치기·기존 게이트 보존. packages 무변경.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-review-polish
  -b baton/learning-review-polish-L3a-1 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**(`git diff -- packages`
  비어 있어야). 게이트: `swift build` + `swift test`. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
학습 검토 뷰 가독성·중복 수정: (1) 역할 카드 "왜" 패널을 DisclosureGroup→커스텀 접기(전체폭
좌측정렬)로 바꾸고 순수 `displayExplanation`로 `## 학습 설명` 헤딩 제거, (2) 게이트 섹션 체크포인트
블록의 설명 재출력 제거(역할명+안내+버튼만). 데이터/기능 불변, TS 회귀 0.

### Source of Truth
1. 이 Handoff
2. `.baton/runs/learning-review-polish-L3a.1/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 Swift: `ExecutionView.swift`(TeamRunRoleRow ~637–653줄 DisclosureGroup "왜",
   게이트 canContinueCheckpoint ~231–254줄 explanation 재출력, nonEmpty/trimmedExplanation),
   `Org/TeamRunStatus.swift`(순수 함수 위치 패턴).
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- 순수: `displayExplanation(_ raw: String) -> String`를 `Sources/BatonKit/Org/TeamRunStatus.swift`
  (또는 신규 `Sources/BatonKit/Org/Explanation.swift`)에 추가 — 선두 빈 줄 무시 후 첫 줄이
  `## 학습 설명`(트림 기준)이면 제거, 나머지 트림 반환. 헤딩 없으면 원문 트림.
  + `Tests/BatonKitTests/ExplanationDisplayTests.swift`.
- `Sources/BatonApp/ExecutionView.swift`:
  - `TeamRunRoleRow` "왜" 패널: `DisclosureGroup` 제거 → `@State isExplanationExpanded` Button 토글
    (라벨 "왜" + chevron) + 펼침 시 `Text(displayExplanation(explanation))`를
    `.frame(maxWidth:.infinity, alignment:.leading).fixedSize(horizontal:false, vertical:true)`로
    전체폭 좌측·줄바꿈. 배경/패딩은 패널 컨테이너(들여쓰기 없이).
  - 게이트 `canContinueCheckpoint` 블록: 체크포인트 역할 **설명 본문 재출력 제거**. 역할명 +
    "위에서 강조된 ‘<역할명>’ 역할의 설명을 확인한 뒤 계속하세요." 안내 + 기존 계속/거부 버튼만.
- (선택) `apps/macos/UX.md` 한 줄.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **`packages/*`(TS) 금지.** 기존 게이트(승인/diff
  검토/체크포인트 버튼) 동작·기타 화면 변경 금지(보존).

### Step-by-Step Plan
1. 설계 + ExecutionView 해당 부분 읽기.
2. `displayExplanation` + 테스트.
3. "왜" 패널 커스텀 접기(전체폭 좌측, 헤딩 제거) 적용.
4. 게이트 섹션 설명 중복 제거(안내+버튼).
5. 게이트(swift build/test + `git diff -- packages` 비어 있음) + 자체 리뷰 + 요약.

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```

### Acceptance Criteria
`.baton/runs/learning-review-polish-L3a.1/acceptance-criteria.md` AC-01~06.

### Constraints
- Swift 6. 순수 displayExplanation BatonKit 테스트, View 수동 QA. `packages/*` 미수정(TS 회귀 0).
  기존 기능/안전 불변. base=`origin/main`. commit/push 금지. 한국어/paperclip.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + git diff -- packages)
## Tests (Passing swift / 수동 QA만(UI))
## Fixes (왜 패널 전체폭 좌측·헤딩 제거 / 게이트 설명 중복 제거)
## Risks / TODOs (마크다운 풀 렌더 비범위, 스트리밍 L3b/c)
## Notes for Reviewer (displayExplanation 순수, DisclosureGroup→커스텀 접기, 게이트 중복 제거, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
