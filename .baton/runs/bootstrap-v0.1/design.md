# Implementation Design

## Summary

빈 레포 위에 strict TypeScript pnpm 모노레포를 부트스트랩한다. `@baton/schemas`
(Zod 타입), `@baton/core`(서비스 + 어댑터/포트), `@baton/cli`(얇은 디스패처) 3개
패키지를 만들고, 7개 CLI 명령과 그 골격(SQLite/이벤트/worktree/Codex 어댑터)을
구현한다. 모든 외부 부수효과는 주입 가능한 포트 뒤에 두어 Vitest로 mock 검증한다.

## Scope

### In Scope

- pnpm 워크스페이스 + 3 패키지 + strict TS(ESM/NodeNext) + Vitest 설정
- Zod 스키마 6종과 추론 타입
- `.baton` 워크스페이스 초기화, 아티팩트 저장, run 디렉터리 규약
- CLI 명령: `init`, `project add|list`, `agent list`, `workflow list`,
  `run <request> --dry-run`, `codex doctor`
- agent/workflow YAML 로딩(+ Zod 검증) 및 번들 예제
- SQLite 초기화 골격(인터페이스 + DDL 상수, 드라이버 미연결)
- EventLogger 골격, GitWorktreeManager 인터페이스/스킬레톤
- CodexExecAdapter 인터페이스/스킬레톤 + ProcessRunner 포트
- 단위/스모크 테스트 골격

### Out of Scope

- macOS SwiftUI 앱, 로컬 API 서버
- 실제 Codex 실행 연결, 실제 git worktree 실행, 실제 SQLite 드라이버 쿼리
- push / deploy / 패키지 설치 기능
- ESLint(후속), 승인 UI, 워크플로우 실행 엔진(실행은 dry-run 계획까지만)

## Proposed Architecture

```text
baton/
  package.json                 # 루트(private), workspaces 스크립트
  pnpm-workspace.yaml
  tsconfig.base.json           # strict, NodeNext, declaration
  tsconfig.json                # solution: references 3 packages
  vitest.config.ts             # 루트 vitest(workspace projects)
  .gitignore                   # node_modules, dist, .baton/runs/* 등

  packages/
    schemas/
      package.json             # @baton/schemas, deps: zod
      tsconfig.json
      src/
        index.ts
        project.schema.ts
        agentProfile.schema.ts
        workflow.schema.ts
        run.schema.ts
        artifact.schema.ts
        approval.schema.ts
      test/*.test.ts

    core/
      package.json             # @baton/core, deps: zod, yaml, @baton/schemas
      tsconfig.json
      src/
        index.ts
        config/paths.ts        # batonHome(), workspaceDir(), runDir()
        ports/
          ProcessRunner.ts     # 포트 + node:child_process 구현 + Mock 헬퍼
          Clock.ts             # 포트 + system clock + fixed clock
        db/
          DbClient.ts          # 인터페이스
          ddl.ts               # 테이블 DDL 상수
          openDatabase.ts      # skeleton 팩토리(드라이버 미연결)
        events/EventLogger.ts  # JSONL append, Clock 주입
        artifacts/ArtifactStore.ts
        projects/ProjectService.ts   # 레지스트리 JSON
        agents/loadAgentProfiles.ts  # yaml + zod
        workflows/loadWorkflows.ts   # yaml + zod
        runs/RunService.ts     # createRun(dryRun), 계획 step
        git/GitWorktreeManager.ts    # 인터페이스 + skeleton(ProcessRunner)
        workers/
          WorkerAdapter.ts     # 공통 워커 인터페이스
          codex/
            types.ts           # WorkerRunInput/Result
            CodexExecAdapter.ts# skeleton(ProcessRunner)
      test/*.test.ts

    cli/
      package.json             # @baton/cli, bin: baton, deps: @baton/core, @baton/schemas
      tsconfig.json
      src/
        main.ts                # 소형 디스패처(외부 파서 없음)
        commands/
          init.ts
          project.ts
          agent.ts
          workflow.ts
          run.ts
          doctor.ts
      test/*.test.ts

  examples/
    agents/{analyst,architect,implementer}.agent.yaml
    workflows/default.workflow.yaml
  docs/
    README.md (또는 루트 README.md)
```

### Layering 규칙

- `cli` → `core` → `schemas` 단방향 의존. `core`는 `cli`를 모름.
- 모든 외부 I/O(프로세스, 시계, DB)는 **포트 인터페이스**로 주입.
  기본 구현은 `core`가 제공, 테스트는 Mock 주입.
- provider 전용(Codex) 로직은 `workers/codex/` 안에만. `core`의 다른 모듈은
  `WorkerAdapter` 인터페이스에만 의존.

## File-Level Plan

| File | Change |
|---|---|
| `package.json` | 루트 private, scripts(build/test/typecheck/dev), devDeps(typescript, vitest, tsx, @types/node) |
| `pnpm-workspace.yaml` | `packages: [packages/*]` |
| `tsconfig.base.json` | strict, `module/moduleResolution: NodeNext`, ESM, declaration, composite |
| `tsconfig.json` | solution 파일, 3개 패키지 references |
| `vitest.config.ts` | workspace projects 또는 글롭 테스트 |
| `.gitignore` | node_modules, dist, `*.tsbuildinfo`, `.baton/runs/` 산출물 |
| `packages/schemas/src/*.schema.ts` | Zod 스키마 6종 + 추론 타입 export |
| `packages/schemas/src/index.ts` | 재export |
| `packages/core/src/config/paths.ts` | `$BATON_HOME` 인지 경로 해석 |
| `packages/core/src/ports/ProcessRunner.ts` | 포트 + 실제 구현 + createMockProcessRunner |
| `packages/core/src/ports/Clock.ts` | 포트 + systemClock + fixedClock |
| `packages/core/src/db/DbClient.ts` | 인터페이스 |
| `packages/core/src/db/ddl.ts` | 8개 테이블 DDL 상수 |
| `packages/core/src/db/openDatabase.ts` | skeleton 팩토리 |
| `packages/core/src/events/EventLogger.ts` | JSONL append |
| `packages/core/src/artifacts/ArtifactStore.ts` | run 디렉터리/파일 read·write |
| `packages/core/src/projects/ProjectService.ts` | 레지스트리 add/list |
| `packages/core/src/agents/loadAgentProfiles.ts` | yaml→zod 로더 |
| `packages/core/src/workflows/loadWorkflows.ts` | yaml→zod 로더 |
| `packages/core/src/runs/RunService.ts` | createRun(dryRun), 계획 step |
| `packages/core/src/git/GitWorktreeManager.ts` | 인터페이스 + skeleton |
| `packages/core/src/workers/WorkerAdapter.ts` | 공통 인터페이스 |
| `packages/core/src/workers/codex/{types,CodexExecAdapter}.ts` | 타입 + skeleton |
| `packages/core/src/index.ts` | 공개 API 재export |
| `packages/cli/src/main.ts` | 디스패처 + 사용법 + 종료 코드 |
| `packages/cli/src/commands/*.ts` | 6개 명령 핸들러(얇게) |
| `examples/agents/*.yaml`, `examples/workflows/*.yaml` | 예제 정의 |
| `docs/README.md` 또는 루트 `README.md` | 사용법 + v0.1 비목표/TODO |

## Data Model Changes

신규 Zod 스키마(영속/외부 데이터 형태의 단일 출처). 필드는 최소로 시작.

```ts
// project.schema.ts
Project = { id: string; name: string; path: string; createdAt: string }

// agentProfile.schema.ts
AgentRole = 'analyst'|'architect'|'implementer'|'tester'|'reviewer'|'fixer'|'release_writer'
AgentProfile = { id: string; role: AgentRole; name: string; provider: string;
                 model?: string; description?: string }

// workflow.schema.ts
WorkflowStepType = 'analyze'|'design'|'approve'|'implement'|'test'|'review'|'fix'|'finalize'
WorkflowStep = { id: string; name: string; type: WorkflowStepType; role: AgentRole }
Workflow = { id: string; name: string; steps: WorkflowStep[] }

// run.schema.ts
RunStatus = 'planned'|'running'|'completed'|'failed'|'cancelled'
RunStep = { id: string; type: WorkflowStepType; status: RunStatus }
Run = { id: string; request: string; workflowId: string; projectId?: string;
        status: RunStatus; dryRun: boolean; createdAt: string; steps: RunStep[] }

// artifact.schema.ts
ArtifactKind = 'request'|'analysis'|'design'|'tasks'|'test_result'|'review'|
               'final_summary'|'log'|'other'
Artifact = { runId: string; name: string; path: string; kind: ArtifactKind }

// approval.schema.ts
ApprovalStatus = 'pending'|'approved'|'rejected'
Approval = { runId: string; stepId: string; status: ApprovalStatus; createdAt: string }
```

SQLite DDL 상수(`db/ddl.ts`)는 위 개념을 테이블로 정의하되 v0.1에서는 실행하지
않는다(드라이버 미연결): `projects, agent_profiles, workflows, runs, run_steps,
artifacts, events, approvals`.

## API / CLI Changes

신규 CLI(`baton`):

| Command | 동작 |
|---|---|
| `baton init` | cwd에 `.baton/`(config.json, runs/) 생성, idempotent |
| `baton project add <path>` | Baton 홈 레지스트리에 프로젝트 등록(경로 검증) |
| `baton project list` | 등록 프로젝트 출력 |
| `baton agent list` | 번들 예제 + 로컬 agent YAML 로드/검증 후 출력 |
| `baton workflow list` | 번들 예제 + 로컬 workflow YAML 로드/검증 후 출력 |
| `baton run <request> --dry-run` | runId 생성, request.md+run.json 기록, 계획 step 출력. 워커/worktree 미실행 |
| `baton codex doctor` | `codex` 가용/버전 점검(auth 미접근) |

공개 core API(`@baton/core` index): `ProjectService`, `RunService`,
`ArtifactStore`, `EventLogger`, `loadAgentProfiles`, `loadWorkflows`,
`GitWorktreeManager`, `CodexExecAdapter`, 포트들, `paths`.

## Workflow Changes

워크플로우 "실행 엔진"은 v0.1 범위 밖이다. 대신 `RunService`가 선택된 workflow의
step을 **계획(plan)** 으로 전개하고, dry-run에서는 계획만 기록/출력한다. 실제
step 실행(worker 호출 → 결과 아티팩트)은 후속 run에서 `WorkerAdapter`와
`GitWorktreeManager`를 연결해 구현한다.

## Error Handling

- 모든 로더/서비스는 **명확한 메시지로 throw**, silent 실패·에러 삼킴 금지.
- YAML: 파싱 실패와 스키마 검증 실패를 구분해 보고(파일 경로 포함).
- ProjectService: 존재하지 않는 경로 추가 시 에러, 중복은 멱등 처리.
- CLI: 알 수 없는 명령/누락 인자 → 사용법 출력 + 비정상 종료 코드(예: 1).
  예상된 사용자 오류와 내부 예외를 구분(메시지 vs 스택).
- 프로세스 실행 결과는 throw가 아니라 `WorkerRunResult`(success/exitCode)로 표현.

## Security Considerations

- **credential 무접근**: 코드에 `~/.codex/auth.json` 등 credential 경로 문자열을
  두지 않는다. doctor는 `codex --version`류만 ProcessRunner로 호출.
- **권한 기본값**: `danger-full-access`를 기본으로 설정하지 않는다. 어댑터 옵션의
  기본 sandbox는 `workspace-write` 의도(주석/타입으로 명시), 실제 실행은 skeleton.
- **git 격리**: WorktreeManager는 항상 `baton/<runId>` 브랜치 + 별도 worktree
  경로. base/main 브랜치 직접 수정 경로 없음. v0.1에서는 실행하지 않음.
- **프로세스 호출**: 셸 문자열 결합 금지. 항상 `(command, args[])` 형태로 전달해
  주입을 방지.
- **테스트 안전**: 네트워크/실제 로그인/실제 git/실제 DB 의존 금지.

## Test Plan

`test-plan.md` 참조. 요지: 모든 부수효과 포트를 mock, `$BATON_HOME`를 임시
디렉터리로 격리, dry-run에서 어댑터 호출 0회 단언, 빌드 산출물 `--help` 스모크로
ESM `.js` 확장자 회귀 방지. 게이트: `pnpm typecheck && pnpm test && pnpm build`.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-28 전부 충족.

## Codex Implementation Instructions

- 작업 순서는 `tasks.json`의 task-001 → task-012 의존성 순서를 따른다.
- 새 코드만 추가하고 기존 지침 파일(CLAUDE.md, AGENTS.md)은 수정하지 않는다.
- strict TS, ESM(NodeNext), 상대 임포트 `.js` 확장자, export 함수 명시적 반환 타입.
- 런타임 의존성은 `zod`, `yaml`만. SQLite 네이티브 드라이버를 추가하지 말 것.
- 각 task마다 테스트를 추가하고, 본인 diff를 자체 리뷰해 불필요한 변경 제거.

## Non-Goals

- 실제 Codex 실행/로그인 연결, 실제 git worktree 실행, 실제 SQLite 쿼리.
- 워크플로우 실행 엔진(계획까지만), 승인 흐름 UI.
- ESLint/prettier 설정, CI 파이프라인, 릴리스 자동화.
- 과도한 어댑터/제네릭 추상화(필요한 인터페이스만).

## Review Checklist

- [ ] 의존 방향 cli→core→schemas 단방향 유지, core가 cli/Codex에 직접 결합 안 함.
- [ ] 모든 외부 I/O가 포트 뒤에 있고 테스트에서 mock 됨.
- [ ] dry-run에서 worker/worktree 호출 0회.
- [ ] credential 경로/`danger-full-access` 기본값/main 직접 수정 경로 부재.
- [ ] 상대 임포트 `.js` 확장자, `tsc -b` 빌드/실행 정상.
- [ ] YAML 로더가 Zod 검증 수행, 실패 시 명확한 에러.
- [ ] 런타임 의존성 zod/yaml로 한정, 네이티브 의존 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### Goal

빈 레포 `/Users/ahnyunki/app/baton` 위에 Baton v0.1 MVP를 부트스트랩한다.
결과물: strict TypeScript pnpm 모노레포(`@baton/schemas`, `@baton/core`,
`@baton/cli`) + 7개 CLI 명령(`init`, `project add|list`, `agent list`,
`workflow list`, `run <request> --dry-run`, `codex doctor`)과 그 골격
(Zod 스키마, 아티팩트 저장, SQLite/이벤트/worktree/Codex 어댑터 skeleton, 테스트).

기능 완성도가 아니라 **경계의 정확함과 테스트 가능성**이 성공 기준이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/bootstrap-v0.1/design.md`
3. `.baton/runs/bootstrap-v0.1/tasks.json`
4. `.baton/runs/bootstrap-v0.1/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 레포 컨벤션
6. `AGENTS.md`

충돌이 있으면 추측하지 말고 멈추고 보고할 것.

### Files to Create

루트:
- `package.json`(private, workspaces 스크립트), `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`,
  `README.md`

`packages/schemas/`:
- `package.json`, `tsconfig.json`,
  `src/index.ts`, `src/project.schema.ts`, `src/agentProfile.schema.ts`,
  `src/workflow.schema.ts`, `src/run.schema.ts`, `src/artifact.schema.ts`,
  `src/approval.schema.ts`, `test/*.test.ts`

`packages/core/`:
- `package.json`, `tsconfig.json`, `src/index.ts`,
  `src/config/paths.ts`,
  `src/ports/ProcessRunner.ts`, `src/ports/Clock.ts`,
  `src/db/DbClient.ts`, `src/db/ddl.ts`, `src/db/openDatabase.ts`,
  `src/events/EventLogger.ts`, `src/artifacts/ArtifactStore.ts`,
  `src/projects/ProjectService.ts`,
  `src/agents/loadAgentProfiles.ts`, `src/workflows/loadWorkflows.ts`,
  `src/runs/RunService.ts`, `src/git/GitWorktreeManager.ts`,
  `src/workers/WorkerAdapter.ts`, `src/workers/codex/types.ts`,
  `src/workers/codex/CodexExecAdapter.ts`, `test/*.test.ts`

`packages/cli/`:
- `package.json`(bin: `baton`), `tsconfig.json`,
  `src/main.ts`, `src/commands/{init,project,agent,workflow,run,doctor}.ts`,
  `test/*.test.ts`

예제:
- `examples/agents/{analyst,architect,implementer}.agent.yaml`,
  `examples/workflows/default.workflow.yaml`

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/bootstrap-v0.1/*` (분석/설계 아티팩트) 수정 금지 — 읽기 전용 입력.
- 네이티브 SQLite 드라이버(better-sqlite3 등) 추가 금지.
- ESLint/prettier/CI 설정 생성 금지(v0.1 비목표).
- 실제 Codex 실행/실제 git worktree 실행 코드 작성 금지(skeleton만).

### Step-by-Step Implementation Plan

1. `.baton/runs/bootstrap-v0.1/`의 design/tasks/analysis/acceptance/test-plan 먼저 읽기.
2. 루트 스캐폴딩: pnpm 워크스페이스, `tsconfig.base.json`(strict, NodeNext, ESM,
   composite, declaration), solution `tsconfig.json`(3 references), `vitest.config.ts`,
   `.gitignore`, 루트 `package.json` 스크립트(build=`tsc -b`, typecheck=`tsc -b --noEmit`,
   test=`vitest run`, dev=tsx). (task-001)
3. `@baton/schemas`: Zod 스키마 6종 + 추론 타입 + index 재export + 단위 테스트. (task-002)
4. `@baton/core` 기반: `config/paths.ts`(`$BATON_HOME` 지원), `ArtifactStore`. (task-003)
5. `db` 골격: `DbClient` 인터페이스, `ddl.ts`(8 테이블), `openDatabase` skeleton
   (드라이버 미연결, throw 안 함) + 테스트. (task-004)
6. `ports`: `ProcessRunner`(인터페이스 + node:child_process 구현 + createMock),
   `Clock`(system + fixed). (task-005에 포함)
7. `EventLogger`(Clock 주입, JSONL append) + 테스트. (task-005)
8. `ProjectService`(레지스트리 JSON, 경로 검증, 멱등 add) + 테스트. (task-006)
9. agent/workflow YAML 로더(`yaml.parse` → Zod 검증, 명확한 에러) + 예제 YAML
   + 테스트. (task-007)
10. `GitWorktreeManager`(인터페이스 + ProcessRunner 기반 skeleton, `git worktree add
    <path> -b baton/<runId> <base>` 인자 배열) + 테스트(호출 인자 단언, 실제 실행 없음). (task-008)
11. `WorkerAdapter` + `workers/codex/{types,CodexExecAdapter}`(ProcessRunner로
    stdout/stderr/exitCode/duration 캡처, timeout 지원, auth 무접근) + 테스트(mock). (task-009)
12. `RunService.createRun(dryRun)`: runId 생성, `request.md`+`run.json`(status
    `planned`) 기록, 계획 step 반환, dry-run에서 worker/worktree 미호출 + 테스트
    (mock 호출 0회 단언). (task-010)
13. `@baton/cli`: `main.ts` 소형 디스패처(외부 파서 없음) + 6개 명령 핸들러(얇게:
    파싱→core 호출→출력→종료코드) + 테스트. (task-011)
14. 루트 `README.md`(명령 사용법 + v0.1 비목표/후속 TODO: ESLint, 실제 SQLite,
    실제 Codex 실행) + 스크립트 정리 + 빌드 산출물 `--help` 스모크. (task-012)
15. 전체 게이트 실행, 자체 diff 리뷰, 불필요한 변경 제거, 최종 요약 작성.

### Test Commands

```bash
pnpm install        # 의존성 설치(런타임: zod, yaml만)
pnpm typecheck      # tsc -b --noEmit (strict)
pnpm test           # vitest run
pnpm build          # tsc -b
node packages/cli/dist/main.js --help   # ESM 해상도 스모크
```

명령이 없거나 실패하면 성공으로 위장하지 말고 "미실행/실패"로 보고할 것.

### Acceptance Criteria

`.baton/runs/bootstrap-v0.1/acceptance-criteria.md`의 AC-01 ~ AC-28 전부 충족.
특히: dry-run에서 worker/worktree 호출 0회(AC-16), credential 무접근(AC-23),
`danger-full-access` 기본값 부재(AC-24), 상대 임포트 `.js` + 빌드 실행 정상(AC-05).

### Constraints

- TypeScript strict, ESM(NodeNext), 상대 임포트 `.js` 확장자, export 함수 명시 반환 타입.
- 런타임 의존성은 `zod`, `yaml`만. 네이티브 의존 금지.
- CLI는 얇게, 비즈니스 로직은 `core`. provider 로직은 `workers/codex/` 안에만.
- 모든 외부 I/O는 포트(ProcessRunner/Clock/DbClient)로 주입, 테스트에서 mock.
- `~/.codex/auth.json`/credential 접근 금지. `danger-full-access` 기본값 금지.
- main 직접 수정 경로 금지. push/deploy/패키지 설치 기능 미구현.
- 작업은 새 브랜치/worktree에서. **commit/push 하지 말 것**(명시 요청 전까지).
- 과도한 추상화 금지 — 필요한 인터페이스만.

### Expected Final Summary Format

```md
## Summary
- 무엇이 / 왜 바뀌었는지

## Changed Files
| File | Change |
|---|---|

## Commands Run
| Command | Result |
|---|---|

## Tests
- Passing:
- Failing:
- Not run:

## Risks / TODOs
- 남은 우려(실제 SQLite 드라이버, 실제 Codex 실행, ESLint 등)

## Notes for Reviewer
- 리뷰어가 집중 확인할 부분(포트 경계, dry-run 무부수효과, 보안 단언)
```

명령 미실행/테스트 실패는 정직하게 보고할 것.
