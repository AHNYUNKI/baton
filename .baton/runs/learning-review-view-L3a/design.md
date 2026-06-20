# Implementation Design — learning-review-view-L3a

## Summary

Swift 앱을 L1(설명)·L2(체크포인트)에 맞춰 따라잡고, **학습 검토 UI**를 추가한다. 역할 카드에
`explanation`(왜) 패널을 표시하고, `awaiting-checkpoint` 상태에서 **계속/거부 버튼**(continueCheckpoint)
을 노출한다. 데이터는 기존 `baton` CLI(show/list/continue)에서만 — **packages/* 무변경(TS 회귀 0)**.
스트리밍 없이도 "설명·검토형 학습 도구"의 앱 경험이 완성된다(체크포인트 갇힘 해소 + 설명 표시).
스트리밍/터미널 페인은 L3b/c.

## Scope

### In Scope
- BatonKit: `TeamRunRole.explanation?` 디코드; `teamRunStatusLabel`에 `awaiting-checkpoint`;
  `TeamRunMonitorModel.canContinueCheckpoint`(+ 체크포인트 역할 식별); `BatonClient.continueCheckpoint`.
  순수/테스트.
- BatonApp: `ExecutionView` 역할별 설명 패널 + 체크포인트 계속/거부 버튼.
- README/UX + 수동 QA.

### Out of Scope
- TS/CLI 변경. 실시간 스트리밍·터미널 페인(L3b/c). 질문/수정(L2.1). diff 전체 뷰어.

## Proposed Architecture
```
BatonKit
  Contract/TeamRun.swift: TeamRunRole에 explanation: String? (관대 디코드).
    (선택) Approval Codable + TeamRun.approvals? → 체크포인트 역할 식별용.
  Org/TeamRunStatus.swift: teamRunStatusLabel "awaiting-checkpoint" → "검토 대기"(또는 "체크포인트 검토").
  Store/TeamRunMonitorModel.swift:
    canContinueCheckpoint: current?.status == "awaiting-checkpoint"
    (선택) checkpointRoleId: approvals의 pending checkpoint:<roleId> 또는 최근 완료 역할.
  Client/BatonClient.swift:
    continueCheckpoint(teamRunId, reject: Bool, note: String?) -> TeamRun
      ["project","plan","run","continue",id,(--reject)?,(--note,note)?,"--json"]  (team-run 봉투)

BatonApp/ExecutionView.swift
  역할 카드: 상태/담당AI/summary/usage + explanation 있으면 "왜" 패널(접기/펼치기).
  게이트 액션: canApprove→승인/거부, canReview→diff accept/reject,
              canContinueCheckpoint→계속/거부(continueCheckpoint) + 체크포인트 역할 설명 강조.
```
- 조직도 점등(statusByRole)은 awaiting-checkpoint도 기존 경로로 반영. 갱신 watch/새로고침 재사용.

## File-Level Plan
| File | Change |
|---|---|
| `Sources/BatonKit/Contract/TeamRun.swift` | `TeamRunRole.explanation?` (+선택 approvals) |
| `Sources/BatonKit/Org/TeamRunStatus.swift` | `awaiting-checkpoint` 라벨 |
| `Sources/BatonKit/Store/TeamRunMonitorModel.swift` | `canContinueCheckpoint`(+roleId) |
| `Sources/BatonKit/Client/BatonClient.swift` | `continueCheckpoint` |
| `Sources/BatonApp/ExecutionView.swift` | 설명 패널 + 체크포인트 버튼 |
| `Tests/BatonKitTests/*` | 디코드/라벨/모니터/클라이언트 |
| `apps/macos/README.md`/`UX.md` | 학습 검토 뷰 + 수동 QA |

## Data Model Changes
Swift 표현 계약(`TeamRunRole.explanation?` 등)만 추가. TS/스키마/CLI 불변.

## API / CLI Changes
없음. 기존 `plan run continue/show/list` 사용.

## Error Handling
- explanation/approvals 부재 → optional 관대(미표시). continue 부적합 상태 → CLI 오류를 메시지로.
- 봉투 추가 필드 무시(관대 디코드).

## Security / Safety
앱은 `baton` CLI만. `.baton` 직접 변경/credential 무접근. 안전(승인/worktree/읽기전용)은 CLI 강제.

## Test Plan
`test-plan.md`. swift test: TeamRunRole explanation 디코드(부재/존재), awaiting-checkpoint 라벨,
MonitorModel canContinueCheckpoint(+roleId), BatonClient continueCheckpoint 인자/봉투. View는
swift build + 수동 QA(체크포인트 멈춤→설명 검토→계속). `git diff -- packages` 비어 있음.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~10.

## Non-Goals
스트리밍/터미널(L3b/c), 질문/수정(L2.1), TS 변경.

## Review Checklist
- [ ] TeamRunRole.explanation 디코드, awaiting-checkpoint 라벨, canContinueCheckpoint,
  continueCheckpoint 인자/봉투 테스트.
- [ ] ExecutionView 설명 패널 + 체크포인트 계속/거부 버튼. 기존 화면 보존. packages 무변경(TS 회귀 0).

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-review-view
  -b baton/learning-review-view-L3a origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**(`git diff -- packages`
  비어 있어야). 게이트: `apps/macos/Baton`에서 `swift build` + `swift test`. 머지 후 worktree 제거.
  **commit/push 금지**.

### Goal
Swift 앱을 L1(explanation)·L2(awaiting-checkpoint/continue)에 맞춰 따라잡고, 역할 설명 패널 +
체크포인트 계속/거부 버튼을 추가. 데이터는 기존 CLI(show/list/continue)만. **TS 변경 0.** 성공
기준은 화면이 아니라 **계약/순수 모델/클라이언트 테스트 + 기존 화면 보존 + TS 회귀 0 + 한국어**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/learning-review-view-L3a/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 Swift: `Contract/TeamRun.swift`, `Org/TeamRunStatus.swift`(teamRunStatusLabel),
   `Store/TeamRunMonitorModel.swift`(canApprove/canReview 패턴), `Client/BatonClient.swift`
   (approveTeamRun/reviewTeamRun 패턴, decodeJSON), `ExecutionView.swift`(게이트 액션 렌더).
   CLI 봉투: `plan run continue <id> [--reject] --json`(team-run), team-run에 explanation/
   awaiting-checkpoint 포함. `baton project plan run --help`로 인자 확인.
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- `Sources/BatonKit/Contract/TeamRun.swift`: `TeamRunRole`에 `explanation: String?`(관대 디코드,
  init 갱신). (선택) `Approval` Codable + `TeamRun.approvals: [Approval]?` — 체크포인트 역할 식별용.
- `Sources/BatonKit/Org/TeamRunStatus.swift`: `teamRunStatusLabel`에 `"awaiting-checkpoint"` →
  "검토 대기"(또는 "체크포인트 검토").
- `Sources/BatonKit/Store/TeamRunMonitorModel.swift`: `canContinueCheckpoint`(current?.status ==
  "awaiting-checkpoint"). (선택) `checkpointRoleId`(approvals의 pending `checkpoint:<roleId>` 또는
  최근 완료 역할).
- `Sources/BatonKit/Client/BatonClient.swift`: `continueCheckpoint(teamRunId, reject: Bool = false,
  note: String? = nil) -> TeamRun` — `["project","plan","run","continue",id,(reject ? "--reject")
  ,( note? "--note",note),"--json"]`, expectedKind "team-run". approve/review 패턴 재사용.
- `Sources/BatonApp/ExecutionView.swift`: 역할 카드에 explanation "왜" 패널(있을 때, 접기/펼치기).
  게이트 액션에 `canContinueCheckpoint`면 **계속/거부** 버튼(continueCheckpoint) + 체크포인트 역할
  설명 강조. 기존 canApprove/canReview 유지.
- `apps/macos/README.md`/`UX.md` 갱신.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **`packages/*`(TS) 금지.** credential/HTTP 금지.
  기존 화면/동작 삭제·변경 금지(보존).

### Step-by-Step Plan
1. 설계 + 기존 Contract/Status/Monitor/Client/ExecutionView 읽기. `plan run --help` 확인.
2. TeamRunRole.explanation 디코드 + 테스트(부재/존재, 실제 CLI JSON 픽스처).
3. awaiting-checkpoint 라벨 + 테스트.
4. MonitorModel canContinueCheckpoint(+roleId) + 테스트.
5. BatonClient continueCheckpoint + 테스트(mock CommandRunner: 인자/봉투).
6. ExecutionView 설명 패널 + 체크포인트 버튼. README/UX.
7. 게이트(swift build/test + `git diff -- packages` 비어 있음) + 자체 리뷰 + 요약(수동 QA·TS 무변경).

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```

### Acceptance Criteria
`.baton/runs/learning-review-view-L3a/acceptance-criteria.md` AC-01~10.

### Constraints
- Swift 6. 로직 BatonKit(테스트), View 수동 QA. paperclip/한국어. `packages/*` 미수정(TS 회귀 0).
  앱은 baton CLI만. base=`origin/main`. commit/push 금지.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + git diff -- packages)
## Tests (Passing swift / 수동 QA만(UI))
## Learning Review (explanation 패널 / awaiting-checkpoint 계속·거부 / continueCheckpoint)
## Risks / TODOs (스트리밍 L3b·터미널 L3c, 질문/수정 L2.1)
## Notes for Reviewer (계약 explanation·라벨·canContinueCheckpoint·continueCheckpoint, 기존 화면 보존, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
