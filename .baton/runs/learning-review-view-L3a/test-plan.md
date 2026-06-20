# Test Plan — learning-review-view-L3a

게이트: **swift build/test** + **TS 회귀 0**(`git diff -- packages` 비어 있음). View는 swift build
컴파일 + 수동 QA. CommandRunner mock.

## Swift Unit (swift test)
### TeamRun 계약 디코딩
- 실제 CLI team-run JSON 픽스처: explanation 부재/존재, awaiting-checkpoint 상태, 추가 필드 무시.
- (선택) approvals 디코드.

### 순수 모델
- teamRunStatusLabel("awaiting-checkpoint") → 한국어 라벨.
- MonitorModel.canContinueCheckpoint(awaiting-checkpoint→true, 그 외 false).
- (선택) checkpointRoleId 식별.

### BatonClient (mock CommandRunner)
- continueCheckpoint: continue/reject 인자(`plan run continue <id> [--reject] [--note] --json`) + 봉투 디코드.

## Build / Manual QA
- swift build: ExecutionView 설명 패널/체크포인트 버튼 포함 컴파일.
- 수동 QA:
  - calc-demo checkpoint 역할 plan → 앱 실행 탭 → 그 역할 후 멈춤(검토 대기).
  - 설명(왜) 패널 표시 → 계속 버튼으로 진행 / 거부로 취소.
  - 기존 승인/diff 검토·조직도 점등 정상. 기존 기능 회귀 없음.

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 앱은 `baton` CLI만, credential 무접근.

## Out of Scope
- 스트리밍/터미널(L3b/c), 질문/수정(L2.1), SwiftUI 자동 UI 테스트.

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```
