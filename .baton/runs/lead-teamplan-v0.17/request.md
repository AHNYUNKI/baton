# Request

## Run

- runId: `lead-teamplan-v0.17`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `project-create-v0.16` (PR #16, merged → main `9d6dd26`)
- vision: `.baton/runs/lead-agent-orchestration/vision.md`

## User Request

대표 에이전트 로드맵 2단계(구성/Compose의 계획). 사용자가 **대표에게 프로젝트 개요를
설명**하면, 대표가 ① 프로젝트에 맞는 **역할들을 생성**하고 ② 각 역할에 **담당 AI를
배정**하고 ③ 역할별 **지침 초안**을 작성한다. 사용자는 그 **TeamPlan을 검토 후
수락/수정**(역할 추가·삭제·수정, 담당 AI 변경, 지침 편집)하고 저장한다.

(실제 실행/디스패치는 v0.18.)

## Scope (v0.17)

- core(TS): `TeamPlan`/`TeamRole` 스키마(자유 역할), `Project.teamPlan?`/`overview?`(additive).
  플래너: 대표 어댑터 호출 → 출력에서 JSON 추출 → 검증, **bounded 재시도**, 담당 AI ∈
  project.agentIds 보장. `ProjectService.setTeamPlan/getTeamPlan`. CLI `project plan
  generate/show/set`(봉투 kind 'team-plan'). 생성은 opt-in 실제 AI(테스트는 mock).
- GUI(Swift): `TeamPlanEditModel`(역할 add/remove/edit/담당AI 변경/검증, BatonKit 테스트) +
  BatonClient.generate/show/setTeamPlan. 개요 입력 → 생성 → TeamPlan 편집/저장 화면.
  paperclip/한국어, View 얇게.
- 양쪽 게이트(TS+swift), 테스트, 문서.

## Out of Scope

- 실행/대표 런타임 디스패치(v0.18), 자유 역할 실행 엔진(v0.18), GitHub clone, 서버.

## Constraints

- 생성은 대표(leadAgentId)의 provider 어댑터로 **실제 AI 호출**(opt-in) — 미가용 시 명확한
  안내. 자동화 테스트는 주입형 adapter mock(실제 AI/네트워크 금지).
- AI 출력 파싱은 **관대한 JSON 추출 + Zod 검증 + bounded 재시도**(무한 루프 금지).
  담당 AI는 project.agentIds로 클램프/검증.
- 안전: 공식 CLI 경유, credential/세션 토큰 무접근, argv 배열. 로직 테스트/View 수동 QA.
- base = `origin/main`. 머지 후 worktree 즉시 정리. TS 회귀 0 + swift build/test.
