# Acceptance Criteria — learning-review-view-L3a

Swift 학습 검토 뷰가 완료되려면 아래 모두 충족. 로직은 swift test, View는 swift build + 수동 QA.

## 계약 (swift test)
- [ ] AC-01 `TeamRunRole`이 `explanation: String?`를 디코드한다(부재/존재 모두 관대).
- [ ] AC-02 실제 CLI team-run JSON 픽스처 디코드: `awaiting-checkpoint` 상태, explanation, 추가 필드
  무시. (선택) approvals 디코드.

## 순수 모델 (swift test)
- [ ] AC-03 `teamRunStatusLabel("awaiting-checkpoint")`가 한국어 라벨("검토 대기"/"체크포인트 검토")을
  반환한다.
- [ ] AC-04 `TeamRunMonitorModel.canContinueCheckpoint`가 status == awaiting-checkpoint일 때 true.
- [ ] AC-05 (선택) `checkpointRoleId`가 pending `checkpoint:<roleId>`(또는 최근 완료 역할)를 식별한다.

## 클라이언트 (swift test, mock CommandRunner)
- [ ] AC-06 `continueCheckpoint(teamRunId, reject, note)`가 올바른 인자(`project plan run continue
  <id> [--reject] [--note ...] --json`)를 만들고 team-run 봉투를 디코드한다.

## 뷰 (manual QA)
- [ ] AC-07 역할 카드가 `explanation`(왜) 패널을 표시한다(있을 때).
- [ ] AC-08 status awaiting-checkpoint일 때 **계속/거부 버튼**이 노출되고 `continueCheckpoint`를 호출한다.
  현재 체크포인트 역할 설명을 강조.
- [ ] AC-09 기존 게이트(canApprove 승인/거부, canReview diff accept/reject)·화면 보존(회귀 없음).
  조직도 점등이 awaiting-checkpoint도 반영.

## 안전 & 게이트
- [ ] AC-10 `packages/*` 미수정(`git diff -- packages` 비어 있음, TS 회귀 0). 앱은 `baton` CLI만,
  credential 무접근. `swift build` + `swift test` 통과. 한국어/paperclip. README/UX 갱신.

## 수동 QA (문서)
- [ ] (QA) calc-demo에서 checkpoint 역할 plan → 앱 실행 탭에서 멈춤(검토 대기) → 설명 패널 확인 →
  계속 버튼으로 진행 → 완료. 절차를 요약에 명시.
