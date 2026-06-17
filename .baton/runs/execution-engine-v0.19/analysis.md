# Analysis

## User Request
확정 TeamPlan을 실제 실행. 대표가 역할별 AI에 위임 → 진행 → 조직도 라이브 점등.
첫 컷은 **오케스트레이션 골격**(계층 순서 순차 실행 + 승인 게이트 + 라이브 점등, StubWorker,
worktree 격리).

## Intent
"보여주는 도구"에서 "일하는 도구"로. 안전하게(stub·게이트·격리) 전 루프를 먼저 세우고,
이후 실제 AI 디스패치/병렬/수정 루프를 얹는다.

## Current Repository Understanding (실행 인프라)

- **Run/RunExecutor** (`packages/core/src/runs/`): `Run`은 `workflowId`에 묶이고 `steps[]`
  (각 = `WorkflowStep` 인스턴스, `role ∈ AgentRole`, `type ∈ WorkflowStepType`)를 순차 실행.
  worktree 생성, 승인 게이트(`ApprovalPolicy` + `approve` step), fix 루프(옵션), `events.jsonl`,
  아티팩트, `RunStore`(원자 저장). 워커는 `workerRegistry.resolve(role)`로 해석.
- **WorkerRegistry/Adapter**: `register(role: AgentRole, adapter)` / `resolve(role)`. Adapter =
  `run({cwd,prompt,timeoutMs?,metadata?}) -> {success,exitCode,stdout,stderr,durationMs,artifacts,metadata?}`.
  `createWorkerRegistry`(cli/registry.ts)가 codex/claude/test/stub을 **AgentRole별**로 등록.
- **AgentRole** (agentProfile.schema): analyst/architect/implementer/tester/reviewer/fixer/
  release_writer (고정 enum).
- **TeamPlan** (teamPlan.schema): `roles[{id,name,description,assignedAgentId,instructions,
  reportsTo?}]`. assignedAgentId ∈ project.agentIds(codex/claude). **AgentRole과 무관.**
- **ProjectService**: `get`, `list`, `getTeamPlan`, `setTeamPlan`, `leadAgentId`. 프로젝트에
  teamPlan 영속.
- **read API** (readApi.schema): kinds run-list/run-detail/state/project-list/team-plan/event.
  `baton watch` NDJSON. **team-run 종류 없음.**
- **CLI**: `baton project plan generate/show/set`. **실행 명령 없음.**
- **재사용 포트**: `GitWorktreeManager`, `EventLogger`, `ArtifactStore`, `Clock`,
  `ProcessRunner`, `StubWorker`, `CodexExecAdapter`, `ClaudeCodeAdapter`, `ApprovalSchema`.
- **Swift**: `OrgChartModel.buildOrgChart(project, teamPlan?, statusByRole?)`가 **이미
  statusByRole 인자를 지원** → team-run 역할 상태만 주입하면 라이브 점등 가능.

## Relevant Files
| File | Reason |
|---|---|
| `packages/schemas/src/teamRun.schema.ts`(신규) | TeamRun/Role 상태 스키마 |
| `packages/schemas/src/readApi.schema.ts` | team-run / team-run-list 봉투 |
| `packages/core/src/teamRuns/TeamRunExecutor.ts`(신규) | 순차 계층 실행 + 게이트 |
| `packages/core/src/teamRuns/TeamRunStore.ts`(신규) | 원자 영속(RunStore 패턴) |
| `packages/core/src/teamRuns/order.ts`(신규) | reportsTo → 실행 순서(위상) |
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts`(신규) | agentId(codex/claude)→adapter |
| `packages/core/src/teamRuns/buildRolePrompt.ts`(신규) | 역할 지침→프롬프트 |
| `packages/cli/src/commands/project.ts` | `plan run start/approve/reject/show/list` |
| `packages/core/src/projects/ProjectService.ts` | teamPlan 읽기(재사용) |
| (v0.19.1) Swift Contract/Client/ExecutionView/OrgChart | 모니터 + 라이브 점등 |

## Existing Behavior
TeamPlan은 생성·조회·수정만 가능. 실행 불가. 조직도 상태는 정적(`planned`).

## Target Behavior
`baton project plan run <projectId>` → 계층 순서로 TeamRun 생성, worktree 격리,
**승인 대기**(pre-dispatch 게이트). 승인 시 역할을 **순차** 디스패치(StubWorker 기본) →
각 역할 running→completed/failed, 이벤트/아티팩트 기록 → 전체 completed. 실패 시 정지(잔여
skipped). 조직도는 역할 상태로 라이브 점등(v0.19.1).

## Constraints
- **안전 기본**: pre-dispatch 승인 게이트(사람 승인 전 디스패치 금지), worktree 격리(main 금지),
  **StubWorker 기본**(실제 파일 변경/외부 CLI 없음 — 골격 검증), bounded 순차(무한 루프 없음),
  credential 무접근. base ≠ main 강제.
- **재사용**: Run에 결합하지 말 것. 포트(worktree/events/artifacts/clock/worker)만 재사용.
- **하위호환**: 기존 Run 파이프라인/명령/테스트 회귀 0. team-run은 별도 종류.
- UI/CLI 한국어 라벨, 식별자/필드/플래그 영어.

## Assumptions
- 안전: 확정 TeamPlan이 있는 프로젝트만 실행. teamPlan 없음 → 친절한 오류.
- 안전: 실행 순서 = reportsTo 위상(대표 직속 root tier 먼저, 그 자식 순). 사이클은
  normalizeHierarchy로 이미 차단됨(대표 직속). 동일 tier 형제는 plan 순서대로 **순차**.
- 위험(낮음): StubWorker라 실제 산출물은 없음 — 골격 점등/게이트/순서 검증이 목표. 실제
  디스패치는 v0.19.x.

## Open Questions
없음(범위는 AskUserQuestion으로 확정). 게이트 입도(pre-dispatch 단일 vs 역할별)는 **단일
pre-dispatch**로 시작(골격 최소). 역할별 게이트는 후속.

## Risks
- 신규 실행 경로지만 **별도 TeamRun**이라 기존 Run 회귀 위험 낮음.
- 순서 위상 정렬·상태 전이의 정확성 → 순수 함수(order/상태머신)로 테스트.
- worktree 격리·정리 누락 시 폴더 적체 → 생성/정리 책임 명시(실패·취소 시도 정리 경로).

## Recommendation
포트 재사용형 `TeamRun`/`TeamRunExecutor` 신설. v0.19는 코어+CLI+readAPI(headless,
StubWorker, 단일 게이트, 순차, worktree). v0.19.1에서 Swift 모니터 + 조직도 라이브 점등.
게이트는 `pnpm typecheck/test/build`(코어), v0.19.1에서 swift도.
