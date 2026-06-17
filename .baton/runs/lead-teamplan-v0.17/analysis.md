# Analysis

## User Request

대표가 개요를 받아 역할 생성 + 담당 AI 배정 + 지침 초안을 만들고, 사용자가 검토/수정/저장.
vision.md "구성(Compose)"의 계획 단계.

## Intent

v0.16에서 프로젝트(소스/AI/대표)를 세팅했다. v0.17은 그 위에서 **대표가 팀을 설계**한다 —
개요 → TeamPlan(역할/담당AI/지침). 핵심 가치는 *자동 생성*이 아니라 **AI 초안 + 사람
검토/수정**(human-in-the-loop)으로 신뢰 가능한 팀 구성을 만드는 것. 실행은 다음 단계.

## Current Repository Understanding (v0.16 / main 9d6dd26 기준)

- `Project`(v0.16): {id,name,source,agentIds[],leadAgentId?,createdAt}. agentIds=사용 AI,
  leadAgentId=대표. teamPlan/overview 없음.
- `ProjectService.create/list`(레지스트리 JSON, 중복 소스 처리). setTeamPlan 없음.
- 워커 어댑터(provider별): ClaudeCodeAdapter/CodexExecAdapter — `run(input)`로 호출,
  stdout 반환. 대표 호출에 재사용(대표 = leadAgentId provider).
- read API 봉투(v0.13): `{schemaVersion:1, kind, data}`. project-list 봉투(v0.16).
- GUI(v0.16): ProjectFormModel/위저드/목록, BatonClient.createProject, paperclip/한국어.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/teamPlan.schema.ts`(신규) | TeamPlan/TeamRole(자유 역할) |
| `packages/schemas/src/project.schema.ts` | teamPlan?/overview? additive |
| `packages/core/src/projects/planner.ts`(신규) | buildPlanPrompt + generateTeamPlan(어댑터/재시도/파싱/검증) |
| `packages/core/src/projects/ProjectService.ts` | setTeamPlan/getTeamPlan |
| `packages/cli/src/commands/project.ts` | plan generate/show/set |
| apps/macos `TeamPlanEditModel`/views/client | 편집 로직(테스트) + 화면 |

## Existing Behavior

대표 개념은 있으나(leadAgentId) 대표가 뭘 하지 않음. 역할/지침/계획 없음.

## Target Behavior

- `baton project plan generate <id> --overview "<개요>"` → 대표 어댑터 호출 → TeamPlan
  생성(역할/담당AI/지침) → 봉투 출력 + 프로젝트에 저장(overview 포함). opt-in 실제 AI.
- `baton project plan show <id> --json` → 저장된 TeamPlan.
- `baton project plan set <id>`(stdin/--file JSON) → 검증 후 저장(편집 반영).
- GUI: 프로젝트 상세 → 개요 입력 → "대표에게 맡기기"(생성) → TeamPlan 검토/편집(역할
  add/remove, 이름·설명·담당AI·지침 수정) → 저장.

## Constraints

- 생성 = 실제 대표 AI 호출(opt-in). 어댑터 미가용 시 명확한 에러. 테스트는 mock 어댑터.
- 파싱: 관대한 JSON 추출(프로즈+코드펜스 허용) + Zod 검증 + **bounded 재시도**(최대 N,
  무한 금지). 담당 AI ∈ project.agentIds 클램프/검증. 역할 id 중복/빈값 거부.
- 안전: 공식 CLI/SDK 경유, credential 무접근, argv 배열. 로직 테스트/View 수동 QA.

## Assumptions

### Safe
- TeamRole = {id, name, description, assignedAgentId, instructions}. 자유 역할(고정 enum 아님).
- 대표 어댑터 = project.leadAgentId의 provider 어댑터(없으면 단일 agent). Claude가 자연스러우나 provider-agnostic.
- overview는 프로젝트에 저장(재생성/편집 가능).

### Risky
- **AI 구조화 출력 신뢰성**: 모델이 스키마를 안 지킬 수 있음 → 관대한 추출 + Zod 검증 +
  교정 재시도(bounded). 그래도 실패 시 명확한 에러(부분 결과 강요 금지).
- **opt-in 실제 AI**: 생성은 실제 호출이라 CI/테스트에선 mock. 사용자 환경에 lead CLI 필요.
- **자유 역할 ↔ 실행(v0.18)**: v0.17은 계획 저장까지. 실행 엔진의 자유 역할 수용은 v0.18.

## Open Questions

(기본값 진행, 다르면 알려주세요.)
1. 생성 재시도 상한(기본 2). 2. 대표가 codex여도 plan 생성 허용(기본 허용, provider-agnostic).

## Risks

`risks.md` 참조: AI 출력 파싱/무한, opt-in 실제 AI, 담당AI 클램프, 저장/검증, 이중 게이트, 안전.

## Recommendation

`TeamPlan` 스키마 + 플래너(대표 어댑터 호출 → 관대한 JSON 추출 + Zod 검증 + bounded
재시도 + 담당AI 클램프)를 core에 두고, ProjectService에 setTeamPlan/getTeamPlan을 더한다.
CLI plan generate/show/set(봉투). GUI는 TeamPlanEditModel(편집/검증 테스트) + 얇은 편집
화면(개요→생성→검토/수정/저장). 실행은 v0.18. 상세는 `design.md`.
