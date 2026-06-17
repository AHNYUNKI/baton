# Review — real-dispatch-v0.19.3

Reviewer: Claude Code (Design + Review). worktree `/Users/ahnyunki/app/baton-real-dispatch`
(branch `baton/real-dispatch-v0.19.3`, base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict
| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| 격리 | ✅ Swift / 기존 Run `cli/registry.ts` / `WorkerRegistry` **무변경** |
| 게이트 | ✅ `pnpm typecheck` / `test` **278 passed**(+9) / `build` 직접 재실행 통과 |
| 읽기 전용 강제 | ✅ codex read-only sandbox, claude plan, **쓰기 모드 throw 차단** |
| opt-in & 회귀 | ✅ 기본 stub, claude 기본 `--print` 보존(기존 Run 회귀 0) |

## Independent Verification (직접 재실행/정독)
- **ClaudeCodeAdapter**: `defaultArgs ["--print"]` 보존. `readOnly` → `stripDangerousPermissionArgs`
  (기존/`--dangerously-skip-permissions` 제거) 후 `--permission-mode plan` 강제. `outputFormat:"json"`
  → `--output-format json` + JSON 파싱(`result`→stdout, `usage`→metadata.usage). 파싱 실패 시
  원문 stdout 유지 + usage 생략(폴백). 옵션 미지정 시 현행 동작 그대로.
- **AgentWorkerRegistry**: `readOnly=true` 기본 + **`!readOnly && (codex||claude)` → throw**(쓰기
  모드 원천 차단). codex:true→`CodexExecAdapter({sandbox:"read-only"})`, claude:true→
  `ClaudeCodeAdapter({readOnly:true, outputFormat:"json"})`, 아니면 StubWorker.
- **CLI/project.ts**: start — dispatchConfig(flags)→**preflight 선차단**→executor→성공 시 config
  영속(`team-run-dispatch.json`). approve — 승인 시 config 재독→**preflight 재차단**→그 config로
  디스패치. 승인 게이트/worktree/타임아웃 유지. 플래그 없으면 stub.
- **dispatchConfig.ts**: start/approve가 별도 호출이라 provider/timeout 선택을 artifact로 영속·
  재적용 — 합리적. 승인 우회 없음(approve 경로에서만 실제 디스패치).
- 헬프(`codex/claude --help`)로 `--sandbox read-only`, `--permission-mode plan`,
  `--output-format json` 실재 확인(Codex 보고). codex usage는 포맷 미확정 → 추정 폴백 유지.
- 테스트: claude(읽기전용 기본/plan opt-in/json usage/파싱 실패 폴백/exit 매핑), 레지스트리
  (기본 stub/codex read-only/claude json), CLI(opt-in 실제 실행/start preflight 차단/approve
  preflight 차단/teamPlan 없음).

## Acceptance Criteria
AC-01~12 충족. 종단 실제 실행(실 CLI·인증)은 **수동 QA**(AC-QA) — 설계대로.

## Deviations / Notes
- 설계보다 강화된 안전: 쓰기 모드 **throw 차단**, claude 위험 권한 플래그 **strip**. 승인.
- `team-run-dispatch.json`으로 start↔approve 간 provider 선택 영속(설계 의도 충족, 추가 산출물).
- codex usage 파싱은 포맷 미확정으로 보류(추정 폴백) — 정직히 후속.

## Manual QA (사용자, 실 CLI·인증 필요)
`plan run start <pid> --claude --json` → `approve <teamRunId>` → `show`:
① worktree `git status` 비어 있음(파일 미수정), ② run 디렉터리 산출물/프롬프트/로그,
③ claude 토큰 실측 표시, ④ 미설치 시 preflight 오류.

## Follow-ups
- 쓰기 모드(worktree workspace-write) + diff 검토 게이트. Swift 모니터/조직도 라이브 점등.
- codex usage 정밀 파싱. 예산 게이트. 병렬/역할별 게이트. 스킬(v0.20).

## Reviewer Notes
- 커밋/푸시 없음(Codex). `CLAUDE.md`/`AGENTS.md`/`.baton/runs/**`/Swift 미수정.
- 머지 후 worktree 즉시 제거. TS 변경 → 머지 후 main dist 재빌드.
