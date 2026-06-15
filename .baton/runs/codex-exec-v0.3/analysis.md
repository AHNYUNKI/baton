# Analysis

## User Request

v0.2 실행 엔진 위에 **실제 Codex 실행**을 안전하게 연결한다. `implement`/`fix`
역할을 실제 `CodexExecAdapter`로 디스패치하되, opt-in 플래그·프리플라이트 점검·
승인 게이트·worktree 격리로 안전을 보장하고, 실행 후 worktree 정리 경로를 제공한다.

## Intent

Baton이 처음으로 **실제 코드 변경 작업**을 외부 워커(Codex)에게 위임해 수행한다.
가치의 핵심은 "실제 실행"보다 *안전하게 실제 실행*이다: 기본은 무해(Stub),
명시적 opt-in으로만 실제 실행, 실행 전 가용성 확인, 인간 승인 후에만, 격리된
worktree 안에서, 비파괴 sandbox로. 실패와 정리까지 결정적으로 다룬다.

## Current Repository Understanding (v0.2 / PR #2 기준)

- `packages/core/src/workers/codex/CodexExecAdapter.ts` — 이미 ProcessRunner로
  `codex exec --sandbox <sandbox> <prompt>` 호출. 프롬프트를 **argv로 전달**.
  exitCode===0 → success. `artifacts: []`. 기본 sandbox `workspace-write`.
- `packages/core/src/ports/ProcessRunner.ts` — `run(command, args, options)` →
  `{stdout, stderr, exitCode, durationMs}`. **stdin 입력 미지원.** mock 헬퍼 있음.
- `packages/cli/src/registry.ts` — `createDefaultWorkerRegistry()`가 **모든 역할**
  (analyst…release_writer)에 `StubWorker` 등록. `stubRoles` 노출.
- `packages/cli/src/commands/doctor.ts` — `codex --version` 실행, 0이면 가용 출력.
  미설치/오류 구분 없음(둘 다 "unavailable").
- `packages/core/src/runs/RunExecutor.ts` — 게이트 후 `worker.run({cwd:
  worktreePath, prompt, timeoutMs})`. 실패는 상태로. worktree는 start에서 1회 생성,
  정리 경로 없음.
- `packages/core/src/git/GitWorktreeManager.ts` — `createWorktree`/`removeWorktree`
  /`list` 존재(removeWorktree 이미 있음 → clean에 재사용).

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/ports/ProcessRunner.ts` | stdin(`input`) 지원 추가 |
| `packages/core/src/workers/codex/CodexExecAdapter.ts` | 프롬프트 stdin 전달, 아티팩트, 견고화 |
| `packages/cli/src/registry.ts` | `--codex` 시 implementer/fixer에 실제 어댑터 |
| `packages/cli/src/commands/doctor.ts` | 미설치 vs 오류 구분, 안내 |
| `packages/cli/src/commands/run.ts` | `--codex` 플래그, 프리플라이트, `run clean` |
| `packages/core/src/runs/RunExecutor.ts` 또는 RunStore | clean(worktree 제거) 경로 |
| `.gitignore` | 네거티브 패턴 수정 |

## Existing Behavior

`baton run "<request>"`는 worktree를 만들고 StubWorker로 모든 step을 무해하게
완료(또는 implement에서 승인 게이트 대기). 실제 Codex는 호출되지 않음. `codex
doctor`는 가용/비가용만 보고. worktree 정리 명령 없음.

## Target Behavior

- `baton run "<request>" --codex` → 프리플라이트 `codex --version` 점검 후, 실제
  `CodexExecAdapter`를 implementer/fixer에 등록해 실행. implement step은 승인
  게이트 후 worktree 안에서 실제 codex 실행. 프롬프트는 stdin 전달 + 아티팩트 기록.
- `baton run "<request>"`(플래그 없음) → 기존대로 StubWorker(회귀 없음).
- 프리플라이트 실패(codex 미설치) → 명확한 안내 + 비정상 종료, **worktree/run
  미생성**.
- `baton run clean <runId>` → run의 worktree 제거(기본은 보존, 명시 정리).
- `baton codex doctor` → 미설치/오류/가용을 구분해 보고(auth 무접근).

## Constraints

- 실제 실행 opt-in(`--codex`), 기본 Stub. sandbox `workspace-write`,
  `danger-full-access` 금지. credential 무접근.
- 실행은 승인 게이트(implement/fix) + worktree 격리 안에서만.
- worker 실패/timeout은 throw 아닌 success:false 상태로.
- 모든 I/O 포트 주입, 테스트는 mock(실제 codex/git 미실행).

## Assumptions

### Safe

- `removeWorktree`가 이미 존재 → `run clean`은 이를 재사용.
- 프롬프트 stdin 전달이 argv보다 안전(길이/인용). ProcessRunner에 `input` 추가.
- implementer/fixer만 실제 어댑터 대상. 나머지 역할은 Stub 유지(어댑터 미존재).

### Risky

- **codex CLI 인터페이스**: `codex exec`가 프롬프트를 stdin으로 받는다고 가정한다.
  실제 플래그가 다르면 어댑터의 command/args를 **구성 가능**하게 두어 조정한다
  (`CodexExecAdapterOptions`에 args 빌더/프롬프트 전달 방식 옵션). doctor가 가용성
  검증을 담당.
- **프리플라이트 위치**: CLI 레이어에서 수행(코어 엔진은 provider-agnostic 유지).
- **clean 안전성**: clean은 worktree 디렉터리만 제거하고 base/main 브랜치/워킹트리는
  절대 건드리지 않는다. 종료된 run에 대해서만 허용(진행 중이면 거부).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 실제 실행 활성화를 플래그(`--codex`)로 둘지 vs 설정/환경변수. 기본: **플래그**.
2. `run clean`이 run.json은 남기고 worktree만 지울지. 기본: **worktree만 제거**,
   run 기록 보존(상태에 cleaned 표시).

## Risks

`risks.md` 참조. 핵심: 기본값이 실수로 실제 실행됨, codex CLI 인터페이스 가정
오류, 프리플라이트 누락으로 무의미한 worktree 생성, clean이 잘못된 경로 제거,
대용량 프롬프트 argv 한계, auth 접근 회귀.

## Recommendation

코어 엔진은 그대로 두고(provider-agnostic), CLI에서 `--codex` opt-in으로 실제
어댑터를 주입한다. ProcessRunner에 stdin을 추가해 프롬프트를 안전하게 전달하고,
어댑터의 codex 호출 방식을 구성 가능하게 만들어 CLI 인터페이스 변화에 대비한다.
프리플라이트 doctor로 가용성을 사전 검증하고, `run clean`으로 worktree 수명주기를
완성한다. 모든 경로는 mock으로 검증하며 실제 codex/git은 테스트하지 않는다.
상세는 `design.md`.
