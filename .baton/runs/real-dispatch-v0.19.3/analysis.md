# Analysis

## User Request
StubWorker를 실제 codex/claude로 교체(opt-in). **읽기 전용 첫 컷**: repo 파일 미수정, 분석·설계·
산출물만 생성. 승인 게이트·worktree 격리 유지. 실측 토큰 회수.

## Intent
Baton을 "데모"에서 "진짜로 일하는 도구"로. 단 첫 실제 실행은 **부작용 없는 읽기 전용**으로
안전하게 — 실제 호출/토큰/릴레이 루프를 검증한 뒤 쓰기를 별도 강화 게이트로 연다.

## Current Repository Understanding
- **AgentWorkerRegistry**(core/teamRuns): `createAgentWorkerRegistry({codex,claude,runner})` —
  codex:true→`new CodexExecAdapter({runner})`(sandbox 기본 **workspace-write**), claude:true→
  `new ClaudeCodeAdapter({runner})`(`--print`), 아니면 StubWorker. **TeamRun 전용** registry.
- **기존 Run** 은 `createWorkerRegistry`(cli/registry) 별도 사용 → 본 변경과 분리(회귀 격리).
- **CodexExecAdapter**: `sandbox: "workspace-write"|"read-only"`, `command`/`args` 주입 가능.
  read-only면 `["exec","--sandbox","read-only"]`. metadata.provider="codex". (usage 미수집.)
- **ClaudeCodeAdapter**: `args` 주입 가능(기본 `["--print"]`). stepType→analysis.md 등 산출물
  기록. metadata.provider="claude". (usage 미수집.)
- **TeamRunExecutor.invokeWorker**: `resolve(assignedAgentId).run({cwd:worktree, prompt, metadata,
  timeoutMs})`. usage는 `readOrEstimateUsage`(metadata.usage 있으면 실측, 없으면 추정).
- **CLI**: `createTeamRunExecutor`가 `createAgentWorkerRegistry()`(무인자)→전부 stub. 기존 run
  명령엔 `checkCodex`/`checkClaude` preflight(project.ts:404 부근)와 codex opt-in 패턴 존재(재사용).
- **안전 기준**(CLAUDE.md): 읽기 전용 기본, 사람 승인, danger-full-access 금지, credential 무접근,
  메인 브랜치 직접 변경 금지.

## Relevant Files
| File | Reason |
|---|---|
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts` | codex read-only sandbox, claude 읽기전용 옵션 주입 |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` | 읽기전용 권한 + (opt-in) JSON usage 파싱 |
| `packages/core/src/workers/codex/CodexExecAdapter.ts` | (필요 시) usage best-effort |
| `packages/cli/src/commands/project.ts` | `plan run start --codex/--claude` opt-in + preflight |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | (변경 최소) timeout 기본 등 |
| 각 `*.test.ts` | 레지스트리 wiring/어댑터 파싱/CLI 플래그·preflight |

## Existing Behavior
TeamRun 실행은 항상 StubWorker(아무 일 안 함). usage는 추정만.

## Target Behavior
`baton project plan run start <projectId> [--codex] [--claude]`:
- 플래그 없으면 **기존대로 stub**(회귀 0).
- `--codex`/`--claude` 주면 해당 플랫폼만 실제 어댑터로, **읽기 전용 강제**:
  - codex: `--sandbox read-only`,
  - claude: 비편집 권한(예: plan/read-only tool allowlist — 정확 플래그는 `claude --help`로 확인).
- 실행 전 **preflight**(CLI 존재/버전 확인) → 없으면 친절한 비영 오류.
- 승인 게이트(pre-dispatch) 통과 후에만 호출. worktree cwd. 타임아웃 기본 적용.
- claude는 `--output-format json`으로 **실측 usage**(input/output tokens) 회수 → metadata.usage →
  토큰 표가 실측으로. codex usage는 best-effort(없으면 추정 폴백, estimated:true).

## Constraints
- **읽기 전용 강제**(첫 컷): repo 파일 미수정. codex read-only, claude 비편집. 쓰기 모드 금지.
- **opt-in**: 기본 stub 유지(회귀 0). 기존 Run 경로(`createWorkerRegistry`) 불변.
- 승인 게이트·worktree 격리·base≠main·타임아웃 유지. credential 무접근. 네트워크는 AI CLI 자체만
  (Baton이 직접 HTTP 호출 안 함).
- claude 어댑터 변경은 **opt-in 옵션**으로(기존 `--print` 기본 동작 보존 → 기존 Run 회귀 0).
- 실제 codex/claude 종단 실행은 CLI·인증 필요 → **수동 QA**. 단위 테스트는 **주입 mock runner**로
  인자/파싱/플래그/preflight 검증(실제 CLI 불요).

## Assumptions
- claude 읽기전용 정확 플래그는 환경의 `claude --help`로 확정(후보: `--permission-mode plan`
  또는 read-only tool allowlist). 불확실하면 **가장 제한적**(편집 도구 차단)으로.
- claude `--output-format json`이 usage(input/output tokens) 제공 → 파싱. codex usage 포맷
  불확실 → best-effort, 없으면 추정.
- 읽기 전용이라 "구현" 역할도 실제 코드는 못 바꾸고 **계획/diff 텍스트**를 산출(첫 컷 의도).

## Open Questions
없음(범위·안전모드 확정). claude 정확 플래그/ codex usage 포맷은 구현 중 `--help`로 확인(불확실
하면 보수적으로 + 보고).

## Risks
- claude 읽기전용 플래그 오설정 시 의도치 않은 편집 → **가장 제한적 플래그 + 수동 QA로 확인** 필수.
- 실제 CLI 미설치/미인증 → preflight로 사전 차단(친절 오류).
- 긴 실행/행 → 타임아웃 기본. 무한 루프 없음(역할당 1회).
- 어댑터 기본 동작 변경 시 기존 Run 회귀 → **opt-in 옵션**으로만, 기본 보존.

## Recommendation
AgentWorkerRegistry에 **읽기 전용 프로파일**(codex read-only, claude 비편집+json usage) opt-in
주입 + CLI `--codex/--claude` 플래그 + preflight + 타임아웃. 기본 stub·기존 Run 불변. 단위 테스트는
mock runner로 인자/파싱/플래그/preflight, 종단은 수동 QA. 게이트 `pnpm typecheck/test/build` 회귀 0.
