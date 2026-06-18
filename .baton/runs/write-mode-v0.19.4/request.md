# Request — write-mode-v0.19.4

## 사용자 요청

순서 **2 → 1 → 3** 중 **2 = 쓰기 모드**. AI가 worktree 안에서 **실제 파일을 작성/수정**하게
하고, diff 검토 게이트로 통제.

## 사용자 결정 (AskUserQuestion: "diff 게이트")

**"둘 다: 시작 전 + 끝 뒤"**:
- 시작 전: 기존 **pre-dispatch 승인**(이미 있음).
- 끝난 뒤: 실행 완료 후 **누적 diff 검토 게이트** → 사람이 accept/reject.
- 중간 멈춤 없음. 모든 변경은 **worktree 격리**(승인 전 main·머지 없음).

## 현재 상태 (v0.19.3)

- 읽기 전용 디스패치만 구현. `AgentWorkerRegistry`는 `!readOnly && (codex||claude)`면 **throw**로
  쓰기 차단(placeholder). 이번에 쓰기 경로를 **정식 구현**.
- codex `--sandbox workspace-write`, claude `--permission-mode acceptEdits`(편집 허용, 단 cwd=
  worktree 한정). 둘 다 어댑터/플래그 존재.
- `WorktreeManager`: create/remove/list. **diff 캡처 메서드 추가 필요**.

## 범위 (쓰기 첫 컷)

opt-in `--write`(+ `--codex/--claude`)일 때만 쓰기. 기본은 여전히 읽기 전용/stub. 실행 후
**awaiting-review** 상태 + 누적 diff(아티팩트+요약) → `plan run review --accept/--reject`.
**자동 머지·푸시·되돌림 없음**(사람이 통제). headless TS. Swift는 다음(순서 1).

## 결과물
`.baton/runs/write-mode-v0.19.4/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
