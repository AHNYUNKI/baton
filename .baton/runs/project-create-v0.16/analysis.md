# Analysis

## User Request

대표 에이전트 모델의 1단계: 프로젝트 생성 + 소스(로컬/GitHub 참조) + 사용 AI 다중선택
+ 대표 지정. 데이터 + 위저드 골격. (계획/실행은 후속.)

## Intent

vision.md의 "구성(Compose)" 레이어 중 **대표 계획 직전까지** — 프로젝트와 팀(어떤 AI를
쓸지 + 대표)을 세팅하는 골격을 만든다. 가치의 핵심은 v0.17(대표 TeamPlan)·v0.18(실행)이
얹힐 **데이터 모델 + 생성 UX**를 작고 견고하게 확립하는 것. 무리한 자동화 없이.

## Current Repository Understanding (v0.15 / main 56e3cbc 기준)

- `packages/schemas/src/project.schema.ts` — `Project = {id, name, path, createdAt}`(빈약).
- `packages/core/src/projects/ProjectService.ts` — `add(path)`(레지스트리 JSON, id=path
  해시), `list()`. 실제 저장된 프로젝트는 사실상 없음(테스트 데이터뿐) → 스키마 확장 안전.
- `packages/cli/src/commands/project.ts` — `project add <path>` / `project list`.
- read API(v0.13): `{schemaVersion:1, kind, data}` 봉투 — `project list --json`도 동일 봉투로.
- GUI(v0.15): BatonClient(subprocess + 봉투 디코드), RunsStore, paperclip 테마/한국어,
  NewRunFormModel 패턴. 프로젝트 개념/화면은 아직 없음.
- "AI 에이전트" = provider(Codex/Claude). 기존 `agent list`(역할 프로파일 YAML)와는 별개.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/project.schema.ts` | source/agentIds/leadAgentId로 확장 |
| `packages/schemas/src/agentCatalog.schema.ts`(신규) | AI 에이전트 카탈로그(codex/claude) |
| `packages/core/src/projects/ProjectService.ts` | `create(...)` 추가, add는 로컬 소스 매핑 |
| `packages/core/src/projects/agentCatalog.ts`(신규) | 허용 AI id 정의 + 검증 |
| `packages/cli/src/commands/project.ts` | `project create` + `list --json` 봉투 |
| apps/macos `ProjectFormModel`/views | 위저드 + 목록(BatonKit 로직 테스트, View 수동 QA) |

## Existing Behavior

`project add <path>`로 경로만 등록(빈약). AI 선택/대표/소스 종류/생성 위저드 없음.

## Target Behavior

- `baton project create --name N --source-kind local|github --source V --agent codex
  --agent claude --lead claude` → 검증 후 레지스트리에 Project 저장. `project list
  --json` → 봉투(kind `project-list`)로 목록. `project add <path>`는 로컬 소스 프로젝트
  생성(하위호환).
- GUI: "새 프로젝트" → 이름 → 소스(로컬 폴더 피커 또는 GitHub URL) → AI 다중선택 +
  (복수 시) 대표 라디오 → 생성. 생성된 프로젝트가 목록에 표시.

## Constraints

- GitHub = 참조만(URL 저장/형식 검증, clone 없음).
- 검증: 이름/소스 non-empty, AI ≥1, leadAgentId ∈ agentIds(복수 필수/단일 자동).
- 봉투/스키마는 Zod. 잘못된 입력 명확히 거부. argv 배열(셸 결합 금지).
- 로직 BatonKit·core 테스트, View 수동 QA. TS 회귀 0, swift build/test.

## Assumptions

### Safe

- AI 카탈로그는 v0.16 정적(codex, claude). 확장 가능(cursor 등 후속).
- 레지스트리 저장 위치/형식은 기존 ProjectService 방식 재사용(JSON).
- 단일 AI면 lead = 그 AI 자동; 복수면 사용자 지정 필수.

### Risky

- **스키마 확장(하위호환)**: `path` → `source` 일반화. 기존 add/list 테스트는 의도적
   갱신(저장된 실데이터 없음). 신규 필드는 가능하면 안전 기본값.
- **AI 카탈로그 단일 출처**: v0.16은 core가 허용 id를 검증, GUI는 동일 정적 목록 표시.
   완전 단일화(`baton agents --json`)는 후속 — 지금은 작게.
- **프로젝트↔런 연결 미정**: v0.16은 프로젝트를 독립 엔티티로만(런 연결은 v0.18 실행).

## Open Questions

(기본값 진행, 다르면 알려주세요.)

1. AI 카탈로그 v0.16 = {codex, claude} 정적(기본).
2. `project add <path>` 하위호환 유지(로컬 소스 매핑) vs 폐기. 기본 **유지**.

## Risks

`risks.md` 참조: 스키마 하위호환, 카탈로그 이중 정의, GitHub 검증, 위저드 검증,
TS/Swift 이중 게이트, 안전.

## Recommendation

`Project`를 source(local/github)+agentIds+leadAgentId로 확장하고 AI 카탈로그(codex/
claude)를 core에 두어 검증한다. `project create`/`list --json`(봉투) + add 하위호환.
GUI는 `ProjectFormModel`(검증/argv 테스트) + 얇은 위저드/목록(paperclip·한국어). 계획/
실행은 v0.17/0.18로 미룬다. 상세는 `design.md`.
