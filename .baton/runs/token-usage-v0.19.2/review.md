# Review — token-usage-v0.19.2

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-token-usage`
(branch `baton/token-usage-v0.19.2`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 격리 | ✅ teamRuns/schema/cli만. Swift/실제 어댑터(Claude/Codex)/registry/StubWorker **무변경** |
| 게이트 | ✅ `pnpm typecheck` / `test` **269 passed**(+6) / `build` 직접 재실행 통과 |
| 정직성 | ✅ estimated 플래그 + "※ 추정치 포함" 표기, 구독 잔량 미제공(사유 명시) |
| 회귀 | ✅ `usage` 선택 필드 — team-run/Run/CLI 회귀 0 |

## Independent Verification (직접 재실행/정독)
- **usage.ts**(순수): `estimateTokens`(빈→0, ceil(len/4), heuristic 주석); `readOrEstimateUsage`
  — `metadata.usage`가 **정수≥0**(isRecord+isTokenCount 엄격 검증)이면 실측(estimated:false),
  아니면 prompt/stdout 추정(estimated:true); `aggregateTeamRunUsage` — assignedAgentId별
  input/output/total/roles + 총합 + anyEstimated(||=), usage 없는 role 제외.
- **schema**: `TeamRunRoleUsageSchema{inputTokens,outputTokens int≥0, estimated bool}` +
  `role.usage?`(선택) + 타입 export. 음수/비정수 거부.
- **TeamRunExecutor**: `invokeWorker`가 `{prompt,result}` 반환(프롬프트 1회 빌드·재사용 →
  릴레이 일관 + 추정 입력 정확). 완료(성공/실패) 시 `usage = readOrEstimateUsage(prompt, result)`
  를 role에 영속 + `teamRun.role.completed` payload에 usage. catch에서도 prompt 보존.
- **CLI**: `printTeamRunUsage`가 플랫폼별 표(정렬) + 총합 + anyEstimated 시 추정 주석. `--json`은
  team-run 봉투에 role.usage 자동 포함. show만 includeUsage:true.
- 테스트: usage 순수 5케이스(추정/실측 우선/불량 폴백/플랫폼별 집계/anyEstimated), 실행기
  (role.usage 영속·estimated·이벤트·resume 보존 line 216), CLI(usage 합산·show 일치).

## Acceptance Criteria
AC-01~10 충족. (실제 usage 파싱·구독 잔량·예산 게이트·USD·Swift는 후속 — 설계대로 범위 밖.)

## Deviations / Notes
- 없음. 추정/실측 구분, 플랫폼별 집계, resume 영속, 정직 표기를 설계대로 구현.
- 지금은 stub → usage 전부 estimated:true. 실제 디스패치가 켜지면 같은 필드에 실측 자동 반영.

## Follow-ups
- 실제 provider usage 파싱(어댑터가 metadata.usage 정규화) — 실제 디스패치 마일스톤.
- 예산 설정(플랫폼별 한도)+초과 게이트, USD 환산, Swift 모니터 사용량 표시.

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/Swift 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 → 머지 후 main에서 dist 재빌드.
