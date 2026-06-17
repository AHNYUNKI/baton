# Request

## Run

- runId: `app-shell-org-v0.18`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: main `823a3e5`(v0.17.2 머지 후)
- vision: `.baton/runs/lead-agent-orchestration/vision.md`

## User Request

Paperclip식 **앱 셸(좌측 사이드바 IA)** + **AI 조직도**를 구현한다. 사이드바 그룹
(액션/작업/프로젝트/에이전트/계정), 프로젝트는 개요·계획·조직도·실행 탭, 조직도는
대표(👑)를 정점으로 TeamPlan 역할들이 담당 AI·상태를 달고 배치되는 트리. (실행 엔진은
v0.19, 스킬은 v0.20.)

## Scope (v0.18) — Swift(GUI) 단독, TS 변경 없음

- **네비게이션 모델**(BatonKit): 사이드바 섹션 + 선택된 프로젝트 + 프로젝트 탭
  (개요/계획/조직도/실행) 상태. 순수 로직, 테스트.
- **조직도 모델**(BatonKit): `buildOrgChart(project, teamPlan[, statusByRole]) → {대표, 역할
  노드[role,담당AI,상태]}`. 순수, 테스트.
- **사이드바 셸 View**: 액션(새 실행·대시보드·받은 함) / 작업(실행) / 프로젝트(목록) /
  에이전트(AI + 대표 👑) / 계정. 본문 라우팅.
- **프로젝트 상세 탭**: 개요·계획(기존)·**조직도**(신규 OrgChartView)·실행(placeholder).
- **받은 함**: 승인 대기(run) 목록(기존 데이터 재사용).
- paperclip/한국어. 기존 화면(프로젝트/계획/새 실행) 보존.

## Out of Scope

- 실행 엔진/디스패치(v0.19) — "실행" 탭은 placeholder. 스킬(v0.20). 멀티 워크스페이스/
  검색 고도화/모바일. TS 코어 변경(데이터는 기존 CLI에서 읽음).

## Constraints

- 데이터는 기존 CLI(`project list --json`, `project plan show`, `run list`/`state`)에서만.
  새 CLI/코어 변경 없음 → 루트 TS 게이트 회귀 0.
- 로직(네비/조직도 모델) `swift test`, View 수동 QA. 앱은 `baton` CLI만, credential 무접근.
- base = `origin/main`. 머지 후 worktree 즉시 정리.
