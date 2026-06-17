# Implementation Design

## Summary

대표 에이전트 로드맵 2단계. 개요 → 대표가 **TeamPlan**(자유 역할 + 담당 AI + 지침 초안)
생성 → 사용자 검토/수정/저장. core에 TeamPlan 스키마 + 플래너(대표 어댑터 호출 → 관대한
JSON 추출 + Zod 검증 + bounded 재시도 + 담당AI 클램프) + ProjectService.setTeamPlan,
CLI plan generate/show/set(봉투). GUI는 TeamPlanEditModel(편집/검증 테스트) + 얇은
편집 화면(paperclip/한국어). 생성은 opt-in 실제 AI(테스트는 mock). 실행은 v0.18.

## Scope

### In Scope
- core: TeamPlan/TeamRole 스키마, Project.teamPlan?/overview?(additive), planner
  (generateTeamPlan), ProjectService.setTeamPlan/getTeamPlan, CLI plan generate/show/set
- GUI: TeamPlanEditModel + BatonClient.generate/show/setTeamPlan + 개요/생성/편집 화면
- core(pnpm)+GUI(swift) 테스트, README/UX

### Out of Scope
- 실행/대표 런타임 디스패치(v0.18), 자유 역할 실행 엔진(v0.18), clone, 서버

## Proposed Architecture

```text
core (TS):
  TeamRole = { id, name, description, assignedAgentId, instructions }
  TeamPlan = { roles: TeamRole[] }   // 자유 역할; assignedAgentId ∈ project.agentIds
  Project += { overview?: string, teamPlan?: TeamPlan }

  planner.generateTeamPlan({ project, overview, leadAdapter, maxAttempts=2 }):
     attempt 1..max:
        prompt = buildPlanPrompt(overview, project.agentIds[, 이전 오류])
        out = await leadAdapter.run({cwd, prompt})        # 대표 = leadAgentId provider
        json = extractJson(out.stdout)                    # 관대(프로즈/```json 허용)
        parsed = TeamPlanSchema.safeParse(json)
        if ok: return clampAssignedAgents(parsed, project.agentIds)
        else: continue (교정)
     throw PlanGenerationError(마지막 오류)                # 상한 소진(bounded)

  ProjectService.setTeamPlan(id, plan)=검증 후 저장 / getTeamPlan(id)

  CLI:
    project plan generate <id> --overview "<t>"  → leadAdapter로 생성 → 저장 → 봉투
       (lead 미가용 preflight 안내+비정상 종료)
    project plan show <id> --json                → 저장 plan 봉투(kind 'team-plan')
    project plan set <id> (stdin|--file JSON)     → 검증 후 저장(편집 반영)

GUI (Swift):
  TeamPlanEditModel{ roles:[EditableRole] } : add/remove/edit/담당AI변경, isValid, toJSON
  BatonClient.generateTeamPlan(id, overview)/showTeamPlan(id)/setTeamPlan(id, plan)
  ProjectPlanView: 개요 입력 → 생성 → 역할 카드 편집(이름/설명/담당AI/지침 + 추가/삭제) → 저장
```

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/teamPlan.schema.ts`(신규) | TeamRole/TeamPlan + 검증 |
| `packages/schemas/src/project.schema.ts` | overview?/teamPlan? additive |
| `packages/core/src/projects/planner.ts`(신규) | buildPlanPrompt/extractJson/generateTeamPlan(재시도/클램프) |
| `packages/core/src/projects/ProjectService.ts` | setTeamPlan/getTeamPlan |
| `packages/cli/src/commands/project.ts` | plan generate/show/set + preflight(생성) |
| `packages/*/test/*` | schema/planner(mock)/service/CLI 테스트 |
| apps/macos `Sources/BatonKit/Forms/TeamPlanEditModel.swift`(신규) | 편집/검증/직렬화 |
| apps/macos `Sources/BatonKit/Contract/TeamPlan.swift`(신규) | Codable |
| apps/macos `Sources/BatonKit/Client/BatonClient.swift` | generate/show/setTeamPlan |
| apps/macos `Sources/BatonApp/ProjectPlanView.swift`(신규) | 개요/생성/편집 화면 |
| apps/macos `Tests/BatonKitTests/*` | TeamPlanEditModel/client 테스트 |
| `apps/macos/README.md`/`UX.md` | 흐름/수동 QA |

## Data Model Changes

```ts
TeamRole = { id: string, name: string, description: string,
             assignedAgentId: string, instructions: string }
TeamPlan = { roles: TeamRole[] }                  // roles 비빈, id 유일
Project += { overview?: string, teamPlan?: TeamPlan }
```
모두 additive(기존 프로젝트 호환). assignedAgentId ∈ project.agentIds 검증.

## API / CLI Changes

```bash
baton project plan generate <id> --overview "<개요>"   # 대표 생성(opt-in 실제 AI) + 저장
baton project plan show <id> [--json]                  # 봉투 kind 'team-plan'
baton project plan set <id> [--file plan.json]         # stdin/파일 → 검증 후 저장
```

## Error Handling
- 생성 파싱/검증 실패 → bounded 재시도 → 상한 소진 시 명확한 에러(throw).
- lead 어댑터 미가용 → preflight 안내 + 비정상 종료(생성 전 차단).
- set 잘못된 JSON/검증 위반 → 거부+비정상 종료. baton 미발견 → 기존 에러.

## Security Considerations
- 생성은 대표(공식 CLI/SDK) 호출만. credential/세션 토큰 무접근. 네트워크 없음(어댑터 외).
- JSON 추출은 파싱만(eval 금지). 담당AI 클램프로 임의 값 차단. argv 배열/stdin·파일.
- 재시도 bounded(무한 금지). plan 생성은 읽기 분석(파일 변경 아님; 실행은 v0.18).

## Test Plan
`test-plan.md` 참조. planner는 mock 어댑터로 결정적(성공/프로즈+JSON/재시도/상한 에러),
schema/service/CLI/GUI 편집·argv. 실제 AI 없음. 이중 게이트 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~16.

## Non-Goals
- 실행/디스패치, 자유 역할 실행 엔진(v0.18), clone, 서버.

## Review Checklist
- [ ] TeamPlan 스키마(자유 역할/담당AI∈agentIds), Project additive.
- [ ] 플래너 관대 추출+검증+**bounded 재시도**(상한 호출), 담당AI 클램프, mock 테스트.
- [ ] setTeamPlan 검증 저장, CLI generate/show/set 봉투/preflight.
- [ ] TeamPlanEditModel 편집/검증 테스트, View 얇음(한국어/paperclip).
- [ ] credential/토큰/HTTP/무한 없음, 이중 게이트 회귀 0.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-lead-teamplan-v0.17
  -b baton/lead-teamplan-v0.17 origin/main`. `git merge-base --is-ancestor origin/main
  HEAD` 확인. **core(TS) + GUI(Swift) 둘 다.**
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` + `apps/macos/Baton`
  `swift build && swift test`. 둘 다 통과.
- 로직(스키마/플래너/서비스/EditModel)은 테스트, View 얇게 + 수동 QA. (머지 후 worktree 제거 예정.)

### Goal
대표가 개요로 TeamPlan(자유 역할 + 담당 AI + 지침 초안)을 생성하고 사용자가 검토/수정/
저장. core 플래너(대표 어댑터 호출 → 관대한 JSON 추출 + Zod 검증 + **bounded 재시도** +
담당AI 클램프) + ProjectService.setTeamPlan + CLI plan generate/show/set(봉투). GUI
TeamPlanEditModel(편집/검증) + 얇은 화면(개요→생성→편집→저장). 생성은 opt-in 실제 AI,
테스트는 mock. **실행은 범위 밖(v0.18).**

성공 기준은 "AI가 팀 짜줌"이 아니라 **구조화 출력의 견고한 파싱/검증 + bounded 재시도 +
사람 검토/수정 + 안전 + 이중 게이트 회귀 0**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/lead-teamplan-v0.17/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`, `lead-agent-orchestration/vision.md`
5. 기존: Project/ProjectService(v0.16), 워커 어댑터(Claude/Codex `run`), read API 봉투,
   GUI ProjectFormModel/BatonClient/테마(v0.16), fix 루프의 bounded 패턴(v0.9)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify
- core 신규: `packages/schemas/src/teamPlan.schema.ts`, `packages/core/src/projects/planner.ts`
- core 수정: `project.schema.ts`(+index), `ProjectService.ts`(setTeamPlan/getTeamPlan),
  `packages/cli/src/commands/project.ts`(plan generate/show/set), 테스트
- GUI 신규: `Sources/BatonKit/Contract/TeamPlan.swift`,
  `Sources/BatonKit/Forms/TeamPlanEditModel.swift`,
  `Sources/BatonApp/ProjectPlanView.swift`, `Tests/BatonKitTests/{TeamPlanEditModelTests,
  BatonClientPlanTests}.swift`
- GUI 수정: `Sources/BatonKit/Client/BatonClient.swift`, `Sources/BatonApp/*`(진입),
  `apps/macos/README.md`/`UX.md`

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용).
- HTTP/소켓 서버, clone/네트워크 금지. 실행/디스패치 로직 금지(v0.18). 런타임 의존성 추가 금지.

### Step-by-Step Plan
1. 설계/태스크/vision 읽기. fix 루프(bounded) 패턴 참고.
2. core: TeamPlan/TeamRole 스키마 + Project additive(overview/teamPlan) + 검증(담당AI∈
   agentIds) + 테스트. (task-L01)
3. core: planner — buildPlanPrompt(개요+agentIds+스키마 지시), extractJson(관대),
   generateTeamPlan(어댑터 주입, bounded 재시도(기본 2), 검증, 담당AI 클램프) + mock 테스트
   (성공/프로즈+JSON/재시도/상한 에러). (task-L02)
4. core: ProjectService.setTeamPlan/getTeamPlan + CLI plan generate(생성+저장+봉투,
   lead preflight)/show --json/set(stdin·--file) + 테스트. (task-L03)
5. GUI: TeamPlan Codable + TeamPlanEditModel(add/remove/edit/담당AI변경/검증/직렬화) +
   BatonClient.generate/show/setTeamPlan + 테스트. (task-L04)
6. GUI: ProjectPlanView(개요→생성→역할 편집→저장) + 진입 + README/UX + 보안 회귀 +
   전체 게이트(TS+swift) 회귀 0 + 자체 리뷰 + 최종 요약. (task-L05)

### Test / Gate Commands
```bash
corepack pnpm install
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
cd apps/macos/Baton && swift build && swift test
```
명령 미실행/실패는 정직히 보고(UI 수동 QA, 실제 AI 미호출 명시).

### Acceptance Criteria
`.baton/runs/lead-teamplan-v0.17/acceptance-criteria.md` AC-01~16. 특히: 관대 파싱+검증
(AC-04), bounded 재시도 상한(AC-05), 담당AI 클램프(AC-06), mock 결정적(AC-07), setTeamPlan
검증(AC-08), CLI 봉투/preflight(AC-09/10), EditModel 테스트(AC-11), 이중 게이트(AC-15).

### Constraints
- strict TS/ESM(.js) · Swift 6 concurrency. 런타임 의존성 zod/yaml만.
- 생성=opt-in 실제 AI(테스트 mock). 파싱은 eval 금지, bounded 재시도. 담당AI 클램프.
- 공식 CLI/SDK만, credential/세션 토큰 무접근, argv 배열/stdin·파일. 실행 로직 금지.
- core는 packages/, GUI는 apps/macos. base=`origin/main`. **commit/push 금지**.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm + swift 게이트)
## Tests (Passing TS/Swift / Failing / 수동 QA만(UI), 실제 AI 미호출)
## Risks / TODOs (실행 v0.18 등)
## Notes for Reviewer (관대 파싱·bounded 재시도·담당AI 클램프, setTeamPlan 검증, 봉투, 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
