# Request — learning-explain-dispatch-L1

## 배경 (방향 전환)

계산기 데모 성공 후 사용자 결정: 자율 코드생성("바이브코딩")은 학습이 안 됨 → Baton을
**"설명·검토형 학습 도구"** 로 재조준. 진짜 산출물 = **사용자의 이해**. 로드맵 L1→L2→L3 확정.
([[baton-learning-direction]], vision.md)

## 이 마일스톤 (L1)

**설명형 디스패치**: 각 역할이 코드/작업과 함께 **"무엇을·왜"를 초보자도 이해하게 설명**하도록
하고, 그 설명을 **1급 필드(`role.explanation`)로 추출·저장**한다. 이후 L2(학습 체크포인트)·
L3(스트리밍/Swift 뷰)에서 바로 표시할 토대.

## 범위

- `buildRolePrompt`에 학습 설명 지시(끝에 "## 학습 설명" 섹션: 무엇을/왜/핵심 개념/대안·트레이드오프).
- 순수 `extractExplanation(stdout)` → `TeamRunRole.explanation?`(선택) 저장(summary/usage 옆).
- StubWorker가 설명 섹션 방출(무토큰 헤드리스 검증). CLI `plan run show`에 설명 표시.
- TS 단독. Swift/스트리밍은 L3. 회귀 0.

## 결과물
`.baton/runs/learning-explain-dispatch-L1/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
