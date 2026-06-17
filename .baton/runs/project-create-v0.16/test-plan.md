# Test Plan

게이트: core는 **pnpm typecheck/test**, GUI는 **swift build/test**(로직) + 수동 QA(View).
실제 baton은 주입형 fake CommandRunner로 mock. 모든 FS 임시 디렉터리. 네트워크/clone 없음.

## Core (TS) — Vitest

### schema (Project, AgentCatalog)
- 유효 Project(local/github source, agentIds, lead) parse, 추론 타입.
- 무효: 빈 이름/소스, 빈 agentIds, 카탈로그 밖 id, lead ∉ agentIds → safeParse 실패.
- AgentCatalog: codex/claude 포함, 허용 검증 함수(존재/비존재).

### ProjectService.create / list
- create: 검증 통과 → 저장 + 반환(id 결정적/uuid). 단일 AI → lead 자동.
- create: 빈 이름/소스/AI 0개/lead 불일치 → 명확한 에러(미저장).
- create: 중복 소스 → 정책대로(멱등 또는 거부) 단언.
- list: 저장된 프로젝트 반환, 빈 상태.
- add(path) 하위호환: 로컬 소스 프로젝트 생성.

### CLI project create / list
- `project create` argv 파싱(--name/--source-kind/--source/--agent 반복/--lead),
  잘못된 값/누락 → 사용법+비정상 종료.
- `project list --json` → 봉투 `{schemaVersion:1, kind:'project-list', data}` 파싱.
- `project add <path>` 하위호환.

## GUI (Swift) — swift test

### ProjectFormModel
- 기본/각 필드 → buildCreateArguments() argv 정확(배열, 셸 결합 없음).
- isValid: 빈 이름/소스/AI 0개 → false. 복수 AI + lead 미지정 → false. 단일 AI → lead 자동.
- source kind(local/github) 반영.

### BatonClient.createProject
- argv 배열로 `project create` 호출, mock 결과 반환.
- 실패(비정상 종료) → 명확한 에러(크래시 없음).

## Build / Manual QA
- `swift build`: 위저드/목록 View 컴파일.
- 수동 QA: 새 프로젝트 생성(로컬/GitHub) → 목록 표시, 빈 입력 비활성, 잘못된 baton 경로 안내.

## Security / Isolation
- grep: credential/세션 토큰/danger/HTTP/clone(네트워크) 매치 0.
- argv 배열(셸 평가 없음). 앱이 `.baton` 직접 변경 없음.
- `packages/*` 외 영향 없음, 루트 TS 게이트 회귀 0.

## Out of Scope (테스트 비대상)
- 대표 TeamPlan/역할 생성/실행(v0.17/18), GitHub clone, runs↔project 연결, 서버.

## Gates

```bash
# core
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
# GUI
cd apps/macos/Baton && swift build && swift test
```
