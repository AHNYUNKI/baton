# Risks — context-relay-v0.19.1

| 위험 | 영향 | 완화 |
|---|---|---|
| 토큰 폭증 | 요약 미절단/전체 누적 시 비용 급증 | **보고 체인만**(O 깊이) + `summarizeWorkerResult` 강제 절단 + 산출물 **경로 참조**(내용 미첨부). 테스트로 절단 보장. |
| resume 시 컨텍스트 유실 | 재개 후 상위 요약 사라짐 | `summary`를 role에 **영속**(메모리 의존 금지). 영속 summary에서 upstream 구성. 테스트. |
| 보고 체인 사이클/깊이 | 무한루프/과도 | order.ts `hasCyclicAncestry` 패턴 재사용(방어), 깊이 경계. |
| 스키마 변경 회귀 | team-run/봉투 깨짐 | `summary` **선택 필드** 추가 → 회귀 0(테스트). |
| 무관 컨텍스트 혼입 | 다운스트림 혼란/토큰 낭비 | 릴레이를 **보고 체인 완료 상위로 한정**(형제·미완료 제외). 테스트로 형제 미포함 확인. |
| 범위 확장 압력 | 양방향/실제 디스패치로 번짐 | 본 마일스톤은 **릴레이만**(stub·headless). 실제 디스패치/Swift/dependsOn은 명시적 후속. |

## 비목표 (재확인)
실제 codex/claude 디스패치, Swift 모니터/라이브 점등, 명시적 `dependsOn`/형제·전역 누적 릴레이,
양방향 대화/상시 LLM 대표, 병렬.

## 후속 (로드맵)
- **실제 디스패치**: codex/claude opt-in(read-only/강화 승인) — 릴레이된 컨텍스트로 실제 작업.
- **Swift 모니터 + 조직도 라이브 점등**: team-run 상태/summary 시각화.
- 확장 릴레이: explicit dependsOn, 형제/선행 결과, (필요 시) 대표 요약 라우팅.
