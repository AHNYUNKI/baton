# Acceptance Criteria — learning-explain-dispatch-L1

설명형 디스패치(L1)가 완료되려면 아래 모두 충족. stub로 무토큰 헤드리스 검증.

## 프롬프트 (pnpm test)
- [ ] AC-01 `buildRolePrompt` 출력에 "## 학습 설명" 지시와 항목(무엇을/왜/핵심 개념/대안·트레이드오프),
  초보 개발자용 한국어 요구가 포함된다. 기존 섹션 보존.

## 추출 (pnpm test, 순수)
- [ ] AC-02 `extractExplanation(stdout)`가 "## 학습 설명" 섹션을 추출(다음 동급 헤딩 전/끝까지, 트림).
  부재 → undefined. 다중 → 마지막. 단위 테스트.

## 스키마 & 저장 (pnpm test)
- [ ] AC-03 `TeamRunRole.explanation?`(선택) 정의.
- [ ] AC-04 역할 완료 시 `extractExplanation(result.stdout)` 결과를 role.explanation에 저장(summary/
  usage 옆). 추출 실패 시 미저장(graceful).
- [ ] AC-05 StubWorker가 합성 "## 학습 설명" 섹션을 방출해, **무토큰** stub run에서도 explanation이
  저장됨을 확인할 수 있다.

## CLI (pnpm test)
- [ ] AC-06 `plan run show`가 역할별 explanation을 표시한다(있을 때). `--json`엔 role.explanation 포함.

## 안전 & 회귀
- [ ] AC-07 `explanation`은 선택 필드 — team-run/readApi 봉투, 기존 Run/teamRuns/CLI 회귀 0.
- [ ] AC-08 루트 `pnpm typecheck/test/build` 통과. 안전 정책(승인 게이트·worktree·읽기전용·
  credential) 불변. Swift 미변경.

## 수동 (문서)
- [ ] (QA) stub run → `plan run show`에 "## 학습 설명" 표시(무토큰). 실제 디스패치 시 역할이 "왜"를
  설명하는지 — 절차를 요약에 명시.
