# Request — org-hierarchy-v0.18.3

## 사용자 요청 (원문 의도)

조직도를 Paperclip 실제 화면(첨부 1번)처럼 **진짜 계층 트리**로 만들 것.
대표(CEO) → 매니저급(CTO/CMO 등) → 실무(엔지니어) 의 다단계 구조이며,
각 노드는 **가로형 카드**(원형 역할 아이콘 + 상태 점 + 직함 + 부제 + 담당 AI),
연결선은 **직각(elbow)** 형태, 캔버스는 패닝 가능.

현재 구현(첨부 2번)은 대표 아래 모든 역할이 **1단계 평면 그리드**로만 나열되어
계층이 없음 → 1번과 본질적으로 다름.

## 핵심 사실 (왜 단순 뷰 수정이 아닌가)

현재 `TeamPlan`은 평면이다: `roles:[{id,name,description,assignedAgentId,instructions}]`
+ 단일 `leadAgentId`. "누가 누구에게 보고하는가" 정보가 없어 다단계 트리를 그릴 데이터가
존재하지 않는다. 따라서 데이터 모델(스키마)에 보고구조를 추가해야 한다.

## 사용자 결정

- AskUserQuestion("조직도 범위") → **"진짜 계층 트리 (권장)"** 선택.
  - TeamPlan에 보고구조 추가, 플래너가 계층 생성, OrgChartModel이 트리 빌드,
    뷰는 다단계 elbow 트리 + 가로형 노드 카드.
  - 기존 평면 plan은 1단계로 표시(하위호환).
  - 대표 위임이 계층을 타므로 v0.19(실행)와 자연 연결.

## 결과물

`.baton/runs/org-hierarchy-v0.18.3/` 의 analysis/design/tasks/risks/acceptance/test-plan.
구현은 Codex(핸드오프 참조). 본 에이전트는 분석·설계만.
