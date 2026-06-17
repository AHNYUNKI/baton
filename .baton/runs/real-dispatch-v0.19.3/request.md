# Request — real-dispatch-v0.19.3

## 사용자 요청

실제 디스패치 설계. 지금까지 StubWorker(가짜)였던 워커 자리를 **실제 codex/claude**로 바꿔
대표가 역할별 AI를 진짜로 실행하게 한다.

## 사용자 결정 (AskUserQuestion: "쓰기 권한")

**"읽기 전용 먼저 (권장)"** — 첫 컷은 AI가 **repo 파일을 수정하지 않음**:
- codex → `--sandbox read-only`
- claude → 비편집(읽기/plan) 모드
- AI는 분석·설계·산출물(파일)을 **run 디렉터리**에 남기되 repo 코드는 안 건드림.
- 실제 AI 호출·실측 토큰·릴레이를 **안전하게** 검증. 진짜 쓰기는 후속(강화 게이트와 함께).
- worktree 격리는 어느 경우든 유지.

## 어댑터 현실 (코드 확인)

- `CodexExecAdapter`: `sandbox: "workspace-write"|"read-only"` 지원, **기본 workspace-write(위험)**.
  → TeamRun 디스패치는 **read-only 명시 강제** 필요.
- `ClaudeCodeAdapter`: `--print` 하드코딩. 읽기 전용·실측 usage엔 권한 플래그/출력 포맷 옵션
  추가 필요(기존 Run 경로 회귀 없도록 **opt-in 옵션**으로).
- TeamRun은 `createAgentWorkerRegistry`(core/teamRuns) 사용, 기존 Run은 `createWorkerRegistry`
  (cli/registry) 사용 → **분리되어 있어 기존 Run 회귀 없이** 디스패치만 손볼 수 있음.

## 범위 (첫 컷)

opt-in 플래그로 실제 호출(기본은 여전히 stub), **읽기 전용 강제**, 승인 게이트·worktree 격리·
타임아웃·preflight(CLI 존재 확인) + 실측 토큰 회수(claude). headless TS. 쓰기 모드/Swift/병렬/
fix 루프는 후속.

## 결과물
`.baton/runs/real-dispatch-v0.19.3/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
