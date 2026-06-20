# Acceptance Criteria — learning-checkpoint-L2

학습 체크포인트가 완료되려면 아래 모두 충족. stub로 무토큰 헤드리스 검증.

## 스키마 (pnpm test)
- [ ] AC-01 `TeamRole.checkpoint?`(선택 boolean) 정의. 부재/true 수용.
- [ ] AC-02 `TeamRunStatus`에 `awaiting-checkpoint` 추가. team-run 봉투 round-trip.

## 플래너 (pnpm test)
- [ ] AC-03 `buildPlanPrompt`에 "검토 역할은 checkpoint:true 표시" 지시 + JSON 예시에 checkpoint 포함.

## 실행기 (pnpm test, stub)
- [ ] AC-04 `checkpoint=true` 역할이 **성공 완료**하면 다음으로 가기 전 status `awaiting-checkpoint`
  + pending approval(`checkpoint:<roleId>`)로 멈추고 outcome "awaiting-checkpoint" 반환.
- [ ] AC-05 `continueCheckpoint(continue)` → 해당 approval approved + resume으로 다음 역할 진행.
- [ ] AC-06 `continueCheckpoint(reject)` → 잔여 skipped + `cancelled`.
- [ ] AC-07 다중 체크포인트는 **각각** 멈춘다. continue 후 **같은 체크포인트에서 재멈춤 없음**(완료
  역할 terminal skip). 무한 루프 없음.
- [ ] AC-10 `checkpoint` 미지정 plan은 멈춤 없이 현행대로 진행(회귀 0). 실패 역할은 멈춤 없이 기존 정지.

## CLI (pnpm test)
- [ ] AC-08 `plan run continue <id> [--reject]`가 동작. `show`가 awaiting-checkpoint 시 현재 체크포인트
  역할의 설명(explanation)/출력 + 계속 안내를 표시.

## 안전 & 회귀
- [ ] AC-09 `checkpoint?`/`awaiting-checkpoint`는 추가 — 기존 Run/teamRuns/CLI 회귀 0. 루트 게이트 통과.
  continue 전 다음 역할 디스패치 없음. 승인 게이트·worktree·읽기전용·credential 정책 불변. Swift 미변경.

## 수동 (문서)
- [ ] (QA) checkpoint:true 역할 plan → start→approve→(awaiting-checkpoint 멈춤)→show(설명 확인)→
  continue→완료. stub 무토큰. 절차를 요약에 명시.
