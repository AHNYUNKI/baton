# Request — gui-execution-monitor-v0.19.5

## 사용자 요청

순서 **1 = Swift 실행 모니터 + 조직도 라이브 점등**. 지금까지 백엔드로만 가능했던 실행 흐름을
macOS 앱 화면으로 끌어올린다. 사용자가 처음부터 원한 "조직도가 살아 움직이는" 그림.

## 핵심 사실 (TS 변경 불필요)

CLI가 이미 제공:
- `project plan run start <pid> [--codex --claude --write --base --timeout-ms] --json` → `team-run`
- `... approve/reject <id>`, `... review <id> --accept|--reject`, `... show <id> --json`(team-run),
  `... list <pid> --json`(team-run-list), `baton watch`(NDJSON 이벤트).
- `OrgChartModel.buildOrgChart(project, teamPlan?, statusByRole?)` 가 **이미 statusByRole 지원**.

→ Swift는 이를 **소비**만 하면 됨. **packages/* 변경 없음**(TS 회귀 0).

## 범위

- BatonKit: `TeamRun` 계약(Codable) + 봉투(team-run/team-run-list), BatonClient 메서드,
  순수 `teamRunStatusByRole`(roleId→status), 모니터 모델(선택/액션 가용성) — 테스트.
- BatonApp: 실행 탭(placeholder→**모니터**: 역할 라이브 상태·승인·diff 검토·토큰·이벤트),
  조직도 탭 **라이브 점등**(statusByRole 주입). watch 갱신.
- 안전: 기존처럼 `baton` CLI만 호출. 실제/쓰기 디스패치의 안전(읽기전용 기본·게이트·격리)은
  CLI가 강제 — 앱은 우회하지 않음.

## 결과물
`.baton/runs/gui-execution-monitor-v0.19.5/` analysis/design/tasks/risks/acceptance/test-plan.
구현 Codex. 본 에이전트는 분석·설계만.
