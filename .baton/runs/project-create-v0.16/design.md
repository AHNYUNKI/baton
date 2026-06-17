# Implementation Design

## Summary

대표 에이전트 로드맵 1단계. **프로젝트 생성** 데이터 모델 + 위저드 골격을 만든다:
`Project` 확장(source local/github-참조 + agentIds + leadAgentId), AI 카탈로그(codex/
claude), `ProjectService.create`/CLI `project create`+`list --json`(v0.13 봉투, add
하위호환), 그리고 GUI 새 프로젝트 위저드(이름→소스→AI 다중선택+대표)·목록(paperclip·
한국어). 대표 계획/실행은 v0.17/0.18. 로직 테스트(core+BatonKit), View 수동 QA.

## Scope

### In Scope
- core: Project/AgentCatalog 스키마, ProjectService.create/list, CLI project create/
  list --json, add 하위호환
- GUI: ProjectFormModel(검증/argv) + BatonClient.createProject + 위저드/목록 View
- core(pnpm)+GUI(swift) 테스트, README/UX

### Out of Scope
- 대표 TeamPlan/역할 생성/지침(v0.17), 실행 연결(v0.18), GitHub clone, runs↔project,
  서버, AI 카탈로그 동적화

## Proposed Architecture

```text
core (TS):
  Project = { id, name, source:{kind:'local'|'github', value}, agentIds:[string],
              leadAgentId?:string, createdAt }
  AgentCatalog = [{id:'codex',name:'Codex'},{id:'claude',name:'Claude'}]  (정적, 확장가능)
  ProjectService.create({name,source,agentIds,leadAgentId?})
     ├─ validate(이름/소스 non-empty, agentIds⊆catalog & ≥1, lead∈agentIds|단일자동)
     └─ registry append → Project
  CLI: project create (argv) / project list --json(봉투 kind 'project-list') /
       project add <path> → create(local source) (하위호환)

GUI (Swift, BatonKit logic + thin views):
  ProjectFormModel{ name, sourceKind, sourceValue, agentIds, leadAgentId }
     isValid ; buildCreateArguments() -> ["project","create","--name",...]
  BatonClient.createProject(model) -> runs `project create` (argv 배열)
  NewProjectView(위저드) / ProjectsListView(목록)  ← paperclip 테마/한국어
```

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/project.schema.ts` | source/agentIds/leadAgentId로 확장 |
| `packages/schemas/src/agentCatalog.schema.ts`(신규) | AgentCatalog + 허용 검증 |
| `packages/schemas/src/index.ts` | re-export |
| `packages/core/src/projects/ProjectService.ts` | create(검증/저장), add→local 매핑, list |
| `packages/core/src/projects/agentCatalog.ts`(신규) | 정적 카탈로그 + isAllowedAgent |
| `packages/cli/src/commands/project.ts` | project create + list --json 봉투 + add 호환 |
| `packages/*/test/*` | schema/service/CLI 테스트(기존 add/list 갱신) |
| apps/macos `Sources/BatonKit/Forms/ProjectFormModel.swift`(신규) | 폼/검증/argv |
| apps/macos `Sources/BatonKit/Contract/Project*.swift`(신규) | Project/카탈로그 Codable |
| apps/macos `Sources/BatonKit/Client/BatonClient.swift` | createProject + listProjects |
| apps/macos `Sources/BatonApp/{NewProjectView,ProjectsListView}.swift`(신규) | 위저드/목록 |
| apps/macos `Tests/BatonKitTests/*` | ProjectFormModel/createProject 테스트 |
| `apps/macos/README.md`/`UX.md` | 새 프로젝트/소스/대표 + 수동 QA |

## Data Model Changes

```ts
ProjectSource = { kind: 'local' | 'github'; value: string }
Project = { id: string; name: string; source: ProjectSource;
            agentIds: string[]; leadAgentId?: string; createdAt: string }
AgentCatalogEntry = { id: string; name: string }   // v0.16: codex, claude
```
기존 `path` 필드는 `source`(local)로 일반화 — add/list 사용처 갱신. 저장 실데이터 없음.

## API / CLI Changes

```bash
baton project create --name "My App" --source-kind local --source /path \
  --agent codex --agent claude --lead claude
baton project create --name "Repo" --source-kind github --source https://github.com/x/y \
  --agent claude
baton project list [--json]      # 봉투 kind 'project-list'
baton project add <path>         # 하위호환(local source)
```
GUI: BatonClient.createProject/listProjects (봉투 디코드).

## Workflow / Safety

- GitHub = 참조만(URL 저장+형식 검증, clone 없음). 앱은 `baton` CLI만 호출.
- argv 배열(이름/소스 공백·특수문자 안전, 셸 결합 금지). credential/세션 토큰 무접근.
- 검증은 core+폼 양쪽. 잘못된 입력 거부.

## Error Handling
- create 검증 실패(빈 이름/소스, AI 0, lead 불일치) → 명확한 에러+비정상 종료.
- 중복 소스 → 정책대로(멱등 또는 거부) 명시. baton 미발견 → 기존 에러.

## Test Plan
`test-plan.md` 참조. core: schema/service/CLI(create/list 봉투/add 호환). GUI:
ProjectFormModel(argv/검증)/createProject. 수동 QA(위저드/목록). 이중 게이트, 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md`의 AC-01 ~ AC-16.

## Non-Goals
- 대표 계획/역할/실행, clone, runs↔project, 서버.

## Review Checklist
- [ ] Project 스키마 source/agents/lead, 카탈로그 검증, lead 규칙.
- [ ] create/list --json 봉투/add 하위호환, argv 배열.
- [ ] ProjectFormModel 검증/argv 테스트, View 얇음(한국어/paperclip).
- [ ] GitHub 참조만, credential/토큰/HTTP 없음. swift+TS 게이트 회귀 0.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리

- **`origin/main`에서 분기**: `git worktree add ../baton-project-create-v0.16
  -b baton/project-create-v0.16 origin/main`. `git merge-base --is-ancestor origin/main
  HEAD` 확인. **이 마일스톤은 core(TS) + GUI(Swift) 둘 다 건드린다.**
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` **그리고**
  `apps/macos/Baton`에서 `swift build && swift test`. 둘 다 통과.
- UI(SwiftUI)는 자동 테스트 불가 → 로직을 BatonKit/core에 모아 테스트, View 얇게 + 수동 QA.
- (참고: PR 머지 직후 worktree는 제거 예정 — 작업엔 영향 없음.)

### Goal

대표 에이전트 로드맵 1단계. 프로젝트 생성(데이터+위저드 골격): `Project` 확장(source
local/github-참조 + agentIds + leadAgentId), AI 카탈로그(codex/claude), `project create`
/`list --json`(v0.13 봉투, add 하위호환), GUI 새 프로젝트 위저드(이름→소스(로컬 폴더 피커
/GitHub URL)→AI 다중선택+대표)·목록(paperclip/한국어). **대표 계획/실행은 범위 밖.**

성공 기준은 "화면"이 아니라 **스키마/검증 정확 + create/list 계약 + 폼 argv 테스트 +
GitHub 참조만 + 안전 + 이중 게이트 회귀 0**.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/project-create-v0.16/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`, 그리고
   `.baton/runs/lead-agent-orchestration/vision.md`(큰 틀)
5. 기존 코드: `project.schema.ts`/`ProjectService`/`project.ts`, read API 봉투(v0.13),
   GUI의 `NewRunFormModel`/`BatonClient`/`BatonTheme`/한국어 패턴(v0.15)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify
- core 신규: `packages/schemas/src/agentCatalog.schema.ts`,
  `packages/core/src/projects/agentCatalog.ts`
- core 수정: `packages/schemas/src/project.schema.ts`(+index),
  `packages/core/src/projects/ProjectService.ts`, `packages/cli/src/commands/project.ts`,
  관련 테스트(기존 add/list 갱신)
- GUI 신규: `Sources/BatonKit/Forms/ProjectFormModel.swift`,
  `Sources/BatonKit/Contract/Project.swift`(+카탈로그),
  `Sources/BatonApp/{NewProjectView,ProjectsListView}.swift`,
  `Tests/BatonKitTests/{ProjectFormModelTests,...}.swift`
- GUI 수정: `Sources/BatonKit/Client/BatonClient.swift`(createProject/listProjects),
  `Sources/BatonApp/BatonApp.swift`(진입), `apps/macos/README.md`/`UX.md`

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용 입력).
- HTTP/소켓 서버, GitHub clone/네트워크 금지. 앱의 `.baton` 직접 변경 금지(CLI 경유).
- 런타임 의존성 추가 금지(zod/yaml). 대표 계획/실행 로직 추가 금지(v0.17/18).

### Step-by-Step Plan
1. 설계/태스크/vision 읽기.
2. core: Project 스키마 확장 + AgentCatalog + 검증 + 테스트(기존 add/list 갱신). (task-P01)
3. core: ProjectService.create/list + CLI project create/list --json(봉투)/add 호환 +
   테스트. (task-P02)
4. GUI: Project/카탈로그 Codable + ProjectFormModel(검증/buildCreateArguments) +
   BatonClient.createProject/listProjects + 테스트. (task-P03)
5. GUI: NewProjectView(위저드: 이름→소스(로컬 폴더 피커/GitHub URL)→AI 다중선택+대표)
   + ProjectsListView(목록) + 앱 진입. paperclip/한국어, View 얇게. (task-P04)
6. README/UX 갱신(수동 QA 체크리스트), 보안 회귀, 전체 게이트(TS+swift) 회귀 0, 자체
   diff 리뷰, 최종 요약. (task-P05)

### Test / Gate Commands
```bash
corepack pnpm install
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
cd apps/macos/Baton && swift build && swift test
```
명령 미실행/실패는 정직히 보고(UI는 수동 QA 명시).

### Acceptance Criteria
`.baton/runs/project-create-v0.16/acceptance-criteria.md` AC-01~16 전부 충족.
특히: 검증/lead 규칙(AC-03), create/list 봉투(AC-06/07), add 호환(AC-08), 폼 argv
테스트(AC-09), GitHub 참조만(AC-14), 이중 게이트 회귀 0(AC-15).

### Constraints
- strict TS/ESM(.js) · Swift 6 concurrency 준수. 런타임 의존성 zod/yaml만.
- GitHub 참조만(clone 금지). 앱은 `baton` CLI만(안전 우회 금지). argv 배열.
- 로직 테스트 / View 수동 QA. `packages/*`는 core 작업만, GUI는 apps/macos.
- base = `origin/main`. **commit/push 하지 말 것**.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm + swift 게이트 결과)
## Tests (Passing TS/Swift / Failing / 수동 QA만(UI))
## Risks / TODOs (대표 계획/실행, clone 등)
## Notes for Reviewer (스키마/검증, create·list 봉투, 폼 argv, GitHub 참조만, 회귀 0)
```
명령 미실행/테스트 실패는 정직히 보고.
