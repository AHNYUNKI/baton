# Analysis

## User Request

v0.3(실제 Codex 연결) 위에 **ClaudeCode 어댑터**를 연결해 analysis/design/review
역할을 실제 Claude로 실행한다. v0.3에서 검증된 opt-in + 프리플라이트 + configurable
+ mock 패턴을 그대로 ClaudeCodeAdapter에 적용하고, step 타입별 산출물(analysis.md/
design.md/review.md)을 아티팩트로 남겨 Baton의 역할 기반 파이프라인을 완성한다.

## Intent

Baton의 핵심 비전("역할 기반 AI 워커 오케스트레이션")을 실제로 완성하는 단계.
지금까지: Stub(v0.2) → 실제 Codex 구현(v0.3). 이제 분석/설계/리뷰를 실제 Claude로
연결하면 `analyze → design → implement → review`가 모두 실제 워커로 동작한다.
가치의 핵심은 "실제 Claude 실행"보다 *읽기 전용·opt-in·격리된 안전한 연결*이다.

## Current Repository Understanding (v0.3 / PR #3 기준)

- `packages/core/src/workers/codex/CodexExecAdapter.ts` — configurable command/args,
  **프롬프트 stdin 전달**, 프롬프트 아티팩트(`steps/<stepId>.prompt.md`),
  exit→success. v0.4 ClaudeCodeAdapter의 직접 템플릿.
- `packages/core/src/ports/ProcessRunner.ts` — `run(command,args,{cwd,input,timeoutMs})`.
  stdin(`input`) 지원(v0.3).
- `packages/cli/src/registry.ts` — `createDefaultWorkerRegistry`(전부 Stub),
  `createCodexWorkerRegistry`(implementer/fixer만 Codex). v0.4에서 통합 필요.
- `packages/cli/src/commands/doctor.ts` — `checkCodex(runner)` →
  `{available} | {available:false, reason:'not-installed'|'error'}`. ClaudeCode용
  `checkClaude` 동형 추가.
- `packages/cli/src/commands/run.ts` — `--codex` opt-in + `preflightCodex` →
  실패 시 run/worktree 미생성. `--claude` 동형 추가.
- `packages/core/src/runs/RunExecutor.ts` (L256-269) — worker 호출 시 metadata로
  `{runId, stepId, runDirectory}` 전달. **`stepType`/`role` 미포함** → 추가 필요.
- WorkerRunInput.metadata로 어댑터가 컨텍스트 수신. WorkerRunResult.artifacts/metadata 존재.

## Relevant Files

| File | Reason |
|---|---|
| `packages/core/src/runs/RunExecutor.ts` | metadata에 `stepType`/`role` 추가 |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts`(신규) | 읽기 전용 claude 호출 + 출력 아티팩트 |
| `packages/core/src/index.ts` | 신규 export |
| `packages/cli/src/registry.ts` | 통합 `createWorkerRegistry({codex,claude,runner})` |
| `packages/cli/src/commands/doctor.ts` | `checkClaude` + `claude doctor` |
| `packages/cli/src/commands/run.ts` | `--claude` opt-in + 프리플라이트 + 조합 |

## Existing Behavior

`baton run --codex`는 implement/fix를 실제 Codex로 실행하나, analysis/design/review는
StubWorker로 무해 완료된다(실제 산출물 없음). `claude` 가용성 점검/실행 경로 없음.

## Target Behavior

- `baton run "<req>" --claude` → 프리플라이트 `claude --version` 후 analyst/architect/
  reviewer 역할을 실제 `ClaudeCodeAdapter`로 실행. analyze step → `analysis.md`,
  design step → `design.md`, review step → `review.md` 아티팩트 생성. 읽기 전용.
- `baton run "<req>" --codex --claude` → 두 워커 조합(분석/설계=Claude, 구현=Codex).
- 플래그 없으면 기존대로 전부 Stub(회귀 없음).
- 프리플라이트 실패(claude 미설치) → 안내 + 비정상 종료, run/worktree 미생성.
- `baton claude doctor` → 미설치/오류/가용 구분(세션 토큰 무접근).

## Constraints

- 실제 실행 opt-in(`--claude`), 기본 Stub.
- analysis/design/review 읽기 전용: 파일 변경/위험 플래그 금지(비변경 print 모드).
- 어댑터 cwd=worktreePath(격리), base/main 미접근.
- Codex credential 및 **Claude Code 세션 토큰** 무접근. `danger-full-access` 금지.
- worker 실패/timeout은 success:false 상태로(throw 금지).
- 모든 I/O 포트 주입, 실제 claude/codex/git 미실행 테스트(mock).

## Assumptions

### Safe

- ClaudeCodeAdapter는 CodexExecAdapter와 동형(configurable + stdin + 아티팩트).
- analyst/architect/reviewer만 Claude 대상. 나머지는 Stub/Codex.
- 출력 아티팩트명은 stepType으로 결정(analyze/design/review → md).

### Risky

- **claude CLI 인터페이스**: `claude`를 비대화형 print/읽기 전용으로 호출한다고
  가정한다. 실제 플래그가 다르면 어댑터 command/args를 **구성 가능**하게 두어
  조정하고 doctor가 가용성 검증을 담당한다. 기본 args는 **비변경(읽기 전용)**이어야
  하며 어떤 write/danger 플래그도 포함하지 않는다.
- **출력 매핑**: 캡처한 stdout을 stepType별 아티팩트로 기록한다. 해당 stepType이
  없으면 로그만 남긴다.
- **읽기 전용 보장**: 코드 레벨에서 기본 args에 write/danger 플래그 부재를 테스트로
  단언한다(런타임 실제 동작은 mock).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 활성화를 `--claude` 플래그로 둘지(기본 그렇게). `--codex`와 독립·조합 가능.
2. Claude 대상 역할을 analyst/architect/reviewer로 둘지(기본 그렇게).

## Risks

`risks.md` 참조. 핵심: 기본값 실수 실행, claude CLI 인터페이스 가정 오류,
읽기 전용 위반(파일 변경), 세션 토큰 접근 회귀, 프리플라이트 누락, 레지스트리
통합 회귀.

## Recommendation

CodexExecAdapter 패턴을 그대로 ClaudeCodeAdapter에 적용한다(configurable + stdin +
출력 아티팩트). 레지스트리를 `createWorkerRegistry({codex,claude})`로 통합해
조합을 단순화하고, `--claude` 프리플라이트로 가용성을 사전 검증한다. 읽기 전용
기본 args와 세션 토큰 무접근을 테스트로 고정한다. RunExecutor metadata에
`stepType`/`role`을 추가해 어댑터가 산출물명을 결정한다. 상세는 `design.md`.
