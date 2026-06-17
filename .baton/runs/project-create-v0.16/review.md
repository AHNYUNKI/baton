# Review — project-create-v0.16

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-project-create-v0.16`(branch `baton/project-create-v0.16`,
base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손 |
| TS 게이트 | ✅ typecheck, **203 passed (36 files)** (v0.15 193→+10) |
| Swift 게이트 | ✅ `swift build` 성공, **45 tests passed** (v0.15 36→+9) |
| 스키마/검증 | ✅ source(local/github URL 검증)/agentIds≥1/lead 규칙 |
| 봉투/호환 | ✅ `project-list` 봉투, `add` 하위호환 |
| 안전 | ✅ GitHub 참조만, clone/네트워크/credential/HTTP 없음, argv 배열 |

## Independent Verification

- `pnpm typecheck/test`(203) + `swift build/test`(45) 직접 재실행 통과. 회귀 0.
- **스키마**: `ProjectSource.kind ∈ {local, github}`; github는 superRefine로 http(s)+
  hostname github.com URL 검증. `agentIds.min(1)`, `leadAgentId` optional. (AC-01/02)
- **lead 규칙**: `normalizeLeadAgentId` — agentIds 단일이면 자동 지정, 복수면 명시
  필요+검증(∈agentIds). (AC-03)
- **CLI**: `project create`(argv, 잘못된 입력 거부), `project list --json` →
  `makeEnvelope("project-list", projects)`, `project add <path>` 호환. (AC-06/07/08)
- **GUI**: `ProjectFormModel.buildCreateArguments()`가 `["project","create","--name",…,
  "--agent",id…,"--lead",…]` **배열**(셸 결합 없음). `BatonClient.createProject/
  listProjects`. (AC-09/10)
- **테스트**: core "creates projects with local and github sources" / "rejects invalid
  create input"; cli "creates projects and lists them as a JSON envelope" / "rejects
  invalid project create arguments"; GUI argv/폼 테스트(45 중).
- **안전**: clone/fetch/credential/세션 토큰/danger/HTTP 매치 0(유일한 github 문자열은
  NewProjectView의 URL placeholder). 앱은 `baton` CLI만, `.baton` 직접 변경 없음.

## Acceptance Criteria

AC-01 ~ AC-16 충족(UI(AC-11~13)는 swift build 컴파일 + README/UX 수동 QA 체크리스트 —
설계대로). 대표 계획/실행(v0.17/18)·clone은 범위 밖으로 미포함.

## Deviations / Notes (수용 가능)

1. `path` → `source` 일반화로 기존 add/list 테스트 의도적 갱신(저장 실데이터 없음).
2. github URL을 hostname github.com로 검증(설계의 "형식 검증"을 적절히 구체화). 참조만.

## Follow-ups
- v0.17 대표 TeamPlan(개요→역할/담당AI/지침 초안), v0.18 자유역할 엔진+실행 연결.
- runs↔project 연결, AI 카탈로그 동적화(`baton agents --json`), GitHub clone(원할 시).

## Reviewer Notes
- 커밋/푸시 없음. `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 미수정.
- 머지 후 이 worktree는 즉시 제거 예정(정리 방침).
