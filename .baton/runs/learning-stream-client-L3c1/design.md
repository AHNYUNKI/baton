# Implementation Design — learning-stream-client-L3c1

## Summary

앱이 team-run `--stream` NDJSON을 소비하는 **데이터 층**을 만든다. `TeamRunStreamEvent`/
`TeamRunStreamItem` 계약 + `TeamRunStreamParser`(NDJSON 라인→item) + 스트리밍 클라이언트
(`streamTeamRunApprove/Continue/Start` → `AsyncThrowingStream<TeamRunStreamItem,Error>`) +
`TeamRunStreamModel`(순수 리듀서: 역할별 출력 누적/현재 역할/최종 TeamRun). 기존 `watch` 패턴
(runner.stream + 파서 + AsyncThrowingStream) 재사용. **헤드리스 테스트**(mock CommandRunner). Swift
단독, `packages/*` 무변경(TS 회귀 0). 라이브 터미널 페인·출력영역 재정리는 **L3c-2**.

## Scope

### In Scope
- `Contract/TeamRunStreamEvent.swift`: `TeamRunStreamEvent{type,roleId?,chunk?}`(Codable),
  `TeamRunStreamItem` enum(`.event`/`.final(TeamRun)`).
- `Client/TeamRunStreamParser.swift`: 라인 버퍼 → JsonEnvelope kind별 디코드(event→TeamRunStreamEvent,
  team-run→TeamRun) → `[TeamRunStreamItem]`. 부분 라인 버퍼링.
- `Client/BatonClient.swift`: `streamTeamRunApprove/Continue/Start`(+옵션) → AsyncThrowingStream.
- `Store/TeamRunStreamModel.swift`: 순수 리듀서.
- 테스트(BatonKit).

### Out of Scope
- ExecutionView 라이브 페인 + 출력 영역 재정리(L3c-2). TS 변경. claude stream-json usage.

## Proposed Architecture
```
Contract
  TeamRunStreamEvent: Codable { type: String; roleId: String?; chunk: String? }  // event 봉투 data
  enum TeamRunStreamItem: Sendable { case event(TeamRunStreamEvent); case final(TeamRun) }

Client/TeamRunStreamParser (struct, mutating)
  append(_ chunk) -> [TeamRunStreamItem] : 완전한 줄마다 JsonEnvelope 디코드
    kind=="event"  → .event(decode data as TeamRunStreamEvent)
    kind=="team-run" → .final(decode data as TeamRun)
    그 외/디코드 실패 → skip(관대)
  finish() -> [TeamRunStreamItem]

BatonClient (watch 패턴 재사용)
  streamTeamRunApprove(teamRunId, reject=false, note?) -> AsyncThrowingStream<TeamRunStreamItem,Error>
    args = ["project","plan","run","approve",id,(reject?--reject),(note?--note,note),"--stream","--json"]
  streamTeamRunContinue(teamRunId, reject=false, note?) -> … "continue" …
  streamTeamRunStart(projectId, options: StartTeamRunOptions) -> … "start" … + 기존 옵션 + --stream --json
  → runner.stream(args) 청크 → TeamRunStreamParser → continuation.yield(item) … finish.

Store/TeamRunStreamModel (순수, Equatable/Sendable)
  var outputByRole: [String:String]; var currentRoleId: String?; var final: TeamRun?
  mutating apply(_ item):
    .event(e): e.type=="teamRun.role.started" → currentRoleId=e.roleId
               e.type=="teamRun.role.output" && roleId,chunk → outputByRole[roleId, default:""] += chunk
               (completed 등은 표시용, 무시 가능)
    .final(t): final=t
  mutating reset()
```
- Swift 6: 값 타입 item, AsyncThrowingStream continuation/Task 캡처는 watch와 동일 안전 패턴.

## File-Level Plan
| File | Change |
|---|---|
| `Sources/BatonKit/Contract/TeamRunStreamEvent.swift`(신규) | 이벤트/아이템 계약 |
| `Sources/BatonKit/Client/TeamRunStreamParser.swift`(신규) | 라인→아이템 파서 |
| `Sources/BatonKit/Client/BatonClient.swift` | 스트리밍 메서드 3종 |
| `Sources/BatonKit/Store/TeamRunStreamModel.swift`(신규) | 순수 리듀서 |
| `Tests/BatonKitTests/*` | 디코드/파서/클라이언트/리듀서 |

## Data Model Changes
Swift 표현 계약(스트림 이벤트/아이템/리듀서)만 추가. TS/CLI 불변.

## API / CLI Changes
없음. 기존 `plan run approve/continue/start --stream --json` 사용.

## Error Handling
- 부분 라인 → 버퍼링(완전한 줄만). 디코드 실패/알 수 없는 kind → skip(관대). 스트림 에러 →
  watch와 동일 매핑(continuation.finish(throwing:)).

## Security / Safety
앱은 baton CLI만. credential/HTTP 없음. 실행 안전(승인/체크포인트/worktree/읽기전용)은 CLI 강제.

## Test Plan
`test-plan.md`. swift test: TeamRunStreamEvent 디코드, 파서(완전/부분 라인/event·final 혼합/관대),
클라이언트 스트림(mock CommandRunner 청크 yield → 아이템 시퀀스·인자), 리듀서(누적/current/final/reset).
`git diff -- packages` 비어 있음.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~08.

## Non-Goals
뷰(L3c-2), TS 변경, claude stream-json usage.

## Review Checklist
- [ ] TeamRunStreamEvent/Item 디코드, 파서(부분 라인/혼합/관대), 스트리밍 클라이언트 인자/스트림,
  리듀서 누적/final 테스트. packages 무변경(TS 회귀 0). Swift 6 concurrency.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-stream-client
  -b baton/learning-stream-client-L3c1 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **Swift(GUI) 단독** — `apps/macos/Baton`만. **`packages/*`(TS) 수정 금지**(`git diff -- packages`
  비어 있어야). 게이트: `swift build` + `swift test`. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
앱이 team-run `--stream` NDJSON을 소비하는 데이터 층: `TeamRunStreamEvent`/`TeamRunStreamItem` +
`TeamRunStreamParser` + 스트리밍 클라이언트(`streamTeamRunApprove/Continue/Start`) +
`TeamRunStreamModel`(순수 리듀서). 기존 `watch` 패턴 재사용. **헤드리스 테스트**(mock CommandRunner).
**뷰 변경 없음(L3c-2).** TS 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/learning-stream-client-L3c1/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 Swift: `Client/NDJSONParser.swift`(라인 버퍼 패턴), `Client/BatonClient.swift`(watch:
   runner.stream+파서+AsyncThrowingStream, mapRunnerError; approveTeamRun/continueCheckpoint/
   startTeamRun 인자 패턴), `Contract/JsonEnvelope.swift`, `Contract/TeamRun.swift`,
   `Client/CommandRunner.swift`(stream + mock). CLI 봉투: `--stream`이 `event`(data
   teamRun.role.*{roleId,chunk}) + 마지막 `team-run` 봉투. `baton project plan run --help` 확인.
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 apps/macos/Baton)
- `Sources/BatonKit/Contract/TeamRunStreamEvent.swift`: `TeamRunStreamEvent: Codable, Equatable,
  Sendable { type: String; roleId: String?; chunk: String? }`; `enum TeamRunStreamItem: Equatable,
  Sendable { case event(TeamRunStreamEvent); case final(TeamRun) }`.
- `Sources/BatonKit/Client/TeamRunStreamParser.swift`: `struct TeamRunStreamParser` —
  `mutating func append(_ chunk: String) -> [TeamRunStreamItem]`(완전한 줄마다 JsonEnvelope 디코드:
  kind "event"→.event(TeamRunStreamEvent), "team-run"→.final(TeamRun), 그 외/실패 skip), `finish()`.
  부분 라인 버퍼링(NDJSONParser 패턴).
- `Sources/BatonKit/Client/BatonClient.swift`: `streamTeamRunApprove(teamRunId, reject=false,
  note: String?=nil)`, `streamTeamRunContinue(teamRunId, reject=false, note: String?=nil)`,
  `streamTeamRunStart(projectId, options: StartTeamRunOptions)` → `AsyncThrowingStream<
  TeamRunStreamItem, Error>`. 인자에 `--stream --json`. runner.stream + TeamRunStreamParser, watch와
  동일한 continuation/Task/onTermination/mapRunnerError 패턴.
- `Sources/BatonKit/Store/TeamRunStreamModel.swift`: 순수 리듀서(설계의 apply/reset).
- `Tests/BatonKitTests/{TeamRunStreamEventTests, TeamRunStreamParserTests, BatonClientStreamTests,
  TeamRunStreamModelTests}.swift`.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **`packages/*`(TS) 금지.** **ExecutionView 등 뷰
  변경 금지(L3c-2).** 기존 NDJSONParser/watch/비스트림 client 동작 변경 금지(회귀 0).

### Step-by-Step Plan
1. 설계 + NDJSONParser/watch/BatonClient/JsonEnvelope 읽기. `plan run --help` 확인.
2. TeamRunStreamEvent/Item + 디코드 테스트.
3. TeamRunStreamParser(부분 라인/혼합/관대) + 테스트.
4. BatonClient 스트리밍 3종(watch 패턴) + 테스트(mock CommandRunner 청크 yield).
5. TeamRunStreamModel(순수) + 테스트.
6. 게이트(swift build/test + `git diff -- packages` 비어 있음) + 자체 리뷰 + 요약(뷰는 L3c-2 명시).

### Test / Gate Commands
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```

### Acceptance Criteria
`.baton/runs/learning-stream-client-L3c1/acceptance-criteria.md` AC-01~08.

### Constraints
- Swift 6 concurrency(Sendable, 스트림 안전). 로직 BatonKit 테스트. `packages/*` 미수정(TS 회귀 0).
  뷰 변경 없음. base=`origin/main`. commit/push 금지. 식별자 영어/한국어 메시지.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: swift build/test + git diff -- packages)
## Tests (Passing swift / Failing)
## Stream Layer (이벤트/파서/스트리밍 클라이언트/리듀서)
## Risks / TODOs (ExecutionView 라이브 페인 + 출력영역 재정리 = L3c-2)
## Notes for Reviewer (watch 패턴 재사용, mock stream 테스트, 뷰 미변경, TS 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
