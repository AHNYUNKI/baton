# Request — execution-engine-v0.19

## 사용자 요청 (의도)

확정된 TeamPlan(대표 + 계층형 역할, 각 역할에 담당 AI·지침·reportsTo)을 **실제로 실행**한다.
대표가 역할별 AI에 위임하며 프로젝트가 진행되고, 조직도가 **라이브로 점등**된다.

## 사용자 결정 (AskUserQuestion: "v0.19 첫 컷")

**"오케스트레이션 골격 먼저 (권장)"** 선택:
- TeamPlan 역할을 **계층 순서대로 실행하는 상태머신** + **승인 게이트** + **조직도 라이브 점등**을
  먼저 완성.
- 실제 일꾼은 기존 워커(**StubWorker로 시작** → 실제 codex/claude 호출은 다음 단계).
- **worktree 격리 유지**. 낮은 위험으로 전체 루프(위임→실행→승인→다음)를 먼저 검증.

## 핵심 격차 (왜 신규 작업인가)

기존 `Run`/`RunExecutor`는 **고정 `Workflow`**(역할 ∈ `AgentRole` enum)에 묶여 실행된다.
TeamPlan 역할은 **자유형**(id/이름/지침 + assignedAgentId=codex|claude + reportsTo)이라
`AgentRole`도 `WorkflowStepType`도 아니다 → **TeamPlan을 실행하는 경로가 아예 없다.**

## 아키텍처 판단 (설계 에이전트 결정, 리뷰 대상)

기존 `Run`에 욱여넣지 않고 **포트(worktree/events/artifacts/clock/worker)를 재사용하는 얇은
전용 `TeamRun` + `TeamRunExecutor`** 를 신설. 2단계 전달:
- **v0.19**: 코어 엔진 + read API + CLI(headless, StubWorker) — `pnpm`만으로 전 루프 검증.
- **v0.19.1**: Swift 실행 모니터 + 조직도 라이브 점등(`buildOrgChart(statusByRole:)` 활용).

## 결과물

`.baton/runs/execution-engine-v0.19/` analysis/design/tasks/risks/acceptance/test-plan.
구현은 Codex. 본 에이전트는 분석·설계만.
