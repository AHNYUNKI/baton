# Review — learning-stream-client-L3c1

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-stream-client`
(branch `baton/learning-stream-client-L3c1`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base / 격리 | ✅ BatonKit만, **BatonApp(뷰)·`packages/*` 무변경**(TS 회귀 0) |
| Swift 게이트 | ✅ `swift build` + `swift test` **100 tests passed**(+13) |

## Independent Verification (직접 재실행/정독)
- **TeamRunStreamEvent/Item**: `{type,roleId?,chunk?}` 디코드 + `.event/.final` enum. 추가 필드 무시.
- **TeamRunStreamParser**: 버퍼 라인 분할(`firstIndex("\n")`, NDJSONParser 패턴) → kind "event"→.event,
  "team-run"→.final, 알 수 없는 kind/실패 skip. 테스트: 순서/부분 라인 버퍼링/skip.
- **BatonClient**: `streamTeamRunStart/Approve/Continue` → `project plan run start|approve|continue
  … --stream --json` (+reject/note/옵션) + `AsyncThrowingStream<TeamRunStreamItem>`(watch 패턴:
  runner.stream+parser+continuation+mapRunnerError). 테스트: argv + 아이템 디코드 + 에러 매핑.
- **TeamRunStreamModel**(순수): outputByRole 누적, currentRoleId 추적, final 설정, reset. 테스트.
- 기존 watch/비스트림 client 동작 보존.

## Acceptance Criteria
AC-01~08 충족. 뷰(라이브 페인)·출력영역 재정리는 L3c-2 — 설계대로 범위 밖.

## Deviations / Notes
- 없음. watch 패턴 재사용으로 검증된 길. mock CommandRunner stream으로 헤드리스 검증.

## Follow-ups
- **L3c-2**: ExecutionView 라이브 터미널 페인(이 스트림/리듀서 소비) + **역할 출력 영역 재정리**
  (summary/stub 노이즈 + 라이브 + "왜" 설명 일관 배치, 보류 메모). claude stream-json usage 후속.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/`packages/*`/BatonApp 미수정.
- 머지 후 worktree 즉시 제거. TS 미변경이라 dist 재빌드 불필요.
