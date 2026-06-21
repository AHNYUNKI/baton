# Test Plan — learning-stream-client-L3c1

게이트: **swift build/test** + **TS 회귀 0**(`git diff -- packages` 비어 있음). mock CommandRunner.

## Swift Unit (swift test)
### TeamRunStreamEvent
- event 봉투 data 디코드(teamRun.role.output{roleId,chunk}/started/completed). 추가 필드 무시.

### TeamRunStreamParser
- 완전한 줄 다수 → 아이템 시퀀스. event·final 혼합.
- 부분 라인 → 다음 append와 합쳐 디코드.
- 알 수 없는 kind/디코드 실패 → skip. finish() 잔여.

### BatonClient 스트리밍 (mock CommandRunner stream 청크)
- streamTeamRunApprove/Continue/Start: 인자(--stream --json + reject/note/옵션) 정확.
- 청크 yield → AsyncThrowingStream가 event…→final 순서. 에러 매핑.

### TeamRunStreamModel (순수)
- output 누적(outputByRole), currentRoleId 갱신, final 설정, 알 수 없는 type 무시, reset.

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 뷰 미변경. 앱은 baton CLI만.

## Out of Scope
- ExecutionView 라이브 페인 + 출력 영역 재정리(L3c-2), TS 변경, SwiftUI 자동 UI 테스트.

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages
```
