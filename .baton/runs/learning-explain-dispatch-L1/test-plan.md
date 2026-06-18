# Test Plan — learning-explain-dispatch-L1

게이트: 루트 **pnpm typecheck/test/build**(회귀 0). stub로 무토큰 헤드리스 검증.

## Unit — extractExplanation (순수)
- "## 학습 설명" 섹션 정상 추출(트림).
- 부재 → undefined.
- 다중 → 마지막 섹션.
- 다음 동급(`## `) 헤딩에서 종료.
- 앞뒤 공백/빈 줄 처리.

## Unit — buildRolePrompt
- 출력에 "## 학습 설명" + 항목 키워드(무엇을/왜/핵심 개념/대안) + 한국어 지시 포함.
- 기존 섹션(Project/Role/Team Plan/Upstream/Artifacts) 보존.

## Unit — teamRun.schema
- explanation 부재/존재 수용. team-run 봉투 round-trip(회귀 0).

## Unit — TeamRunExecutor (mock runner + stub)
- stub run 완료 → role.explanation 저장(stub 합성 섹션 추출).
- 설명 없는 출력 → explanation 미저장(graceful).
- summary/usage 저장과 공존.

## Integration — CLI
- explanation 있는 team-run `show` → 설명 표시.
- 없으면 생략(graceful). `--json` → role.explanation 포함.

## Regression / Safety
- 기존 Run/teamRuns/CLI 테스트 회귀 0. 안전 정책 불변. Swift 미변경.

## Manual (헤드리스)
- stub run start→approve→show: "## 학습 설명" 표시(무토큰).

## Out of Scope
- L2 체크포인트, L3 스트리밍/Swift, 연습문제, 설명 파일 산출.

## Gates
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
