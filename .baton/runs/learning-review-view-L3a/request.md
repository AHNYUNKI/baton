# Request — learning-review-view-L3a

## 배경
학습 전환 L 시리즈. L1(설명형 디스패치)·L2(학습 체크포인트) 완료 — 단 **TS/CLI에만** 들어가서
Swift 앱은 아직 모름. 앱에서 L2 체크포인트로 멈추면 **continue 버튼이 없어 갇힘**.

## L3 분할 & 이 마일스톤(L3a)
- L3a(이번): **Swift 학습 검토 뷰** — 계약 따라잡기 + 앱 체크포인트 continue/reject + 설명 패널.
- L3b: TS 스트리밍 코어(stream-output 재활용). L3c: Swift 터미널 페인.
- L3a부터: 스트리밍 없이도 "설명·검토형" 앱 경험 완성(갇힘 해소 + 설명 표시).

## 현재 Swift 격차 (코드 확인)
- `TeamRunRole.explanation` 없음(L1). `teamRunStatusLabel`에 `awaiting-checkpoint` 없음(L2).
- `TeamRunMonitorModel.canContinueCheckpoint` 없음. `BatonClient.continueCheckpoint` 없음.
- CLI(`plan run continue/show`)는 이미 존재(L2) → 앱은 소비만.

## 범위
- BatonKit: `TeamRunRole.explanation?` 디코드, `awaiting-checkpoint` 라벨, MonitorModel
  `canContinueCheckpoint`(+체크포인트 역할 식별), `BatonClient.continueCheckpoint`. 순수/테스트.
- BatonApp: ExecutionView에 **역할별 설명 패널** + **체크포인트 continue/reject 버튼**.
- Swift 단독, packages 무변경(TS 회귀 0). 스트리밍은 L3b/c.

## 결과물
`.baton/runs/learning-review-view-L3a/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
