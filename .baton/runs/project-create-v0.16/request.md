# Request

## Run

- runId: `project-create-v0.16`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `gui-new-run-v0.15` (PR #15, merged → main `56e3cbc`)
- vision: `.baton/runs/lead-agent-orchestration/vision.md`

## User Request

대표 에이전트 오케스트레이션 로드맵의 1단계. **프로젝트를 생성**하고, **작업 소스**
(로컬 경로 또는 GitHub 링크=참조만)와 **사용할 AI 에이전트 다중선택**, 복수일 때
**대표(Lead) 에이전트 지정**까지 한다. 데이터 모델 + 생성 위저드 골격.

(이번엔 대표의 역할 생성/계획·실행은 범위 밖 — v0.17/v0.18.)

## Scope (v0.16)

- core(TS): `Project` 스키마 확장 — `{ id, name, source: {kind: local|github, value},
  agentIds: string[], leadAgentId?, createdAt }`. AI 에이전트 카탈로그(codex/claude).
  `ProjectService.create`/`list`, CLI `project create` + `project list --json`(v0.13 봉투).
  기존 `project add <path>`는 로컬 소스로 매핑해 하위호환.
- GUI(Swift): `ProjectFormModel`(검증/argv, BatonKit 테스트) + BatonClient.createProject.
  **새 프로젝트 위저드**(이름 → 소스(로컬 폴더 피커/GitHub URL) → AI 다중선택 + 대표
  지정 → 생성) + 프로젝트 목록. paperclip 디자인 + 한국어.
- 양쪽 게이트(TS pnpm + swift), 테스트, 문서.

## Out of Scope

- 대표의 역할 생성/TeamPlan/지침(v0.17), 실행 연결(v0.18), GitHub clone(참조만),
  runs↔project 연결, 서버.

## Constraints

- GitHub 소스 = **참조만**(clone 없음, URL 저장/검증).
- 검증: 이름 non-empty, 소스 non-empty, AI ≥1, leadAgentId ∈ agentIds(복수 시 필수,
  단일 시 자동/옵션). 잘못된 입력 거부.
- 안전: 앱은 `baton` CLI 경유, credential 무접근. argv 배열. Process 셸 결합 금지.
- 로직 BatonKit 테스트 / View 수동 QA. `swift build/test` + 루트 TS 회귀 0.
- base = `origin/main`. worktree는 머지 직후 정리.
