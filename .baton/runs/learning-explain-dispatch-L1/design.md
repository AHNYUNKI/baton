# Implementation Design — learning-explain-dispatch-L1

## Summary

학습 전환 첫 단계. 각 역할이 작업과 함께 **"무엇을·왜"를 초보자용으로 설명**하도록
`buildRolePrompt`에 지시하고, 완료 시 그 설명을 순수 `extractExplanation`으로 뽑아
**`TeamRunRole.explanation`(선택 필드)** 에 저장한다. `plan run show`가 역할별 설명을 표시.
읽기전용/쓰기 모드 모두 stdout의 "## 학습 설명" 섹션 방식이라 파일 쓰기 불요. StubWorker가
합성 설명을 방출해 **무토큰 헤드리스 검증**. TS 단독, 회귀 0. (표시 고도화/라이브는 L2·L3.)

## Scope

### In Scope
- `buildRolePrompt`: 끝에 "## 학습 설명 (필수)" 지시(무엇을/왜/핵심 개념/대안·트레이드오프, 초보 한국어).
- 순수 `extractExplanation(stdout): string | undefined`(헤딩 섹션 추출, 부재 시 undefined).
- `TeamRunRole.explanation?`(선택) + 완료 시 저장(summary/usage 옆).
- `StubWorker` 합성 "## 학습 설명" 섹션(무토큰 검증).
- CLI `plan run show` 역할별 설명 표시.

### Out of Scope
- L2 학습 체크포인트(멈춤/질문/수정). L3 스트리밍·Swift 학습 뷰. 연습문제/퀴즈.
- 설명 파일(`docs/explanations/...`) 별도 산출(선택적 후속). Swift 변경.

## Proposed Architecture
```
buildRolePrompt: 기존 섹션 + 끝에
  "## 학습 설명 (필수)
   출력 맨 끝에 아래 형식의 한국어 설명을 붙이세요(초보 개발자 대상):
   ## 학습 설명
   - 무엇을 했나: …
   - 왜 이렇게 했나(결정 근거): …
   - 핵심 개념: …
   - 대안과 트레이드오프: …"

explanation.ts (순수):
  extractExplanation(stdout): string | undefined
    "## 학습 설명" 헤딩을 찾아 그 지점~(다음 동급 헤딩 전 또는 끝)까지 반환(트림).
    없으면 undefined. 여러 개면 마지막 것(출력 끝 규칙). 견고/순수.

TeamRunExecutor.executeFrom (완료 분기):
  const explanation = extractExplanation(result.stdout)
  replaceRole(..., { …, ...(summary?{summary}), ...(usage?{usage}),
                     ...(explanation === undefined ? {} : { explanation }) })

StubWorker: onOutput/stdout에 합성 "## 학습 설명\n- 무엇을 했나: (stub)…" 포함.

CLI plan run show: 역할 줄 아래 explanation 있으면 들여쓰기 표시(또는 "설명 있음" + 본문).
```
- read-only/write 무관하게 stdout 섹션 → 추출. 별도 파일·권한 불필요.

## File-Level Plan
| File | Change |
|---|---|
| `teamRuns/buildRolePrompt.ts` | "## 학습 설명" 지시 섹션 추가 |
| `teamRuns/explanation.ts`(신규) | `extractExplanation`(순수) |
| `schemas/teamRun.schema.ts` | `TeamRunRole.explanation?` |
| `teamRuns/TeamRunExecutor.ts` | 완료 시 explanation 추출·저장 |
| `workers/StubWorker.ts` | 합성 설명 섹션 |
| `core/src/index.ts` | export |
| `cli/commands/project.ts` | `plan run show` 설명 표시 |
| 각 `*.test.ts` | 프롬프트/추출/저장/stub/CLI |

## Data Model Changes
`TeamRunRole.explanation?: string`(선택). team-run 봉투 자동 통과. 그 외 불변.

## API / CLI Changes
없음(새 명령 X). `plan run show` 출력에 설명 추가(표시만). `--json`엔 role.explanation 포함(자동).

## Error Handling
- 워커가 설명 섹션 누락 → extractExplanation undefined → explanation 미저장(graceful).
- 다중/형식 변형 → 마지막 헤딩 기준, 트림. 추출 실패가 실행을 막지 않음.

## Security / Safety
설명은 출력 텍스트만(부수효과 없음). 승인 게이트·worktree·읽기전용·credential 정책 불변. stub 기본.

## Test Plan
`test-plan.md`. 순수 extractExplanation(정상/부재/다중/트림), buildRolePrompt 설명 지시 포함,
executor 완료 시 explanation 저장(stub 합성), schema 선택 필드, CLI show 표시. 회귀 0.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~08.

## Non-Goals
L2 체크포인트, L3 스트리밍/Swift, 연습문제, 설명 파일 산출.

## Review Checklist
- [ ] buildRolePrompt 설명 지시(무엇을/왜/핵심개념/대안). extractExplanation 순수·테스트(부재 graceful).
- [ ] `explanation?` 선택 필드 → 회귀 0. 완료 시 저장. stub 합성으로 무토큰 검증. show 표시.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-explain-dispatch
  -b baton/learning-explain-dispatch-L1 origin/main`. 시작 전 `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(core/schemas/cli). **Swift 변경 금지**(L3). 게이트: 루트
  `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0. 머지 후 worktree 제거. **commit/push 금지**.

### Goal
각 역할이 작업과 함께 **"무엇을·왜"를 초보자용으로 설명**하게 하고(buildRolePrompt), 완료 시 그
설명을 순수 `extractExplanation`으로 뽑아 **`TeamRunRole.explanation`(선택)** 에 저장, `plan run
show`에 표시. read-only/write 모두 stdout "## 학습 설명" 섹션 방식. StubWorker가 합성 설명을
방출해 무토큰 검증. 회귀 0.

성공 기준: extractExplanation 순수 테스트(정상/부재/다중/트림), buildRolePrompt에 설명 지시 포함,
executor가 완료 시 explanation 저장(stub 합성으로 확인), `explanation?` 선택 필드 회귀 0, show 표시.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/learning-explain-dispatch-L1/design.md`
3. `.../tasks.json`, `analysis.md`, `acceptance-criteria.md`, `test-plan.md`
4. 기존 코드: `teamRuns/buildRolePrompt.ts`(섹션 배열), `teamRuns/summarizeResult.ts`(순수 패턴),
   `teamRuns/TeamRunExecutor.ts`(완료 시 summary/usage 저장 라인 ~286-289), `teamRun.schema.ts`,
   `workers/StubWorker.ts`, `commands/project.ts`(printTeamRunResult).
5. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create / Modify (전부 TS)
- `teamRuns/buildRolePrompt.ts`: 섹션 배열 끝(Artifacts 뒤)에 "## 학습 설명 (필수)" 지시 추가 —
  워커에게 "출력 맨 끝에 `## 학습 설명` 헤딩으로 무엇을 했나/왜 이렇게(결정 근거)/핵심 개념/대안과
  트레이드오프를 **초보 개발자용 한국어**로 쓰라". upstream/기존 섹션 보존.
- `teamRuns/explanation.ts`(신규): `export function extractExplanation(stdout: string): string |
  undefined` — "## 학습 설명" 헤딩 탐색 → 그 지점부터 다음 동급(`## `) 헤딩 전 또는 끝까지 트림 반환.
  여러 개면 마지막. 없으면 undefined. 순수.
- `schemas/teamRun.schema.ts`: `TeamRunRoleSchema`에 `explanation: z.string().optional()` + 타입.
- `teamRuns/TeamRunExecutor.ts`: 완료 분기에서 `const explanation = extractExplanation(result.
  stdout)`; `replaceRole`에 `...(explanation === undefined ? {} : { explanation })` 포함(summary/
  usage 저장과 동일 지점). `core/src/index.ts` export.
- `workers/StubWorker.ts`: stdout에 합성 "## 학습 설명" 섹션 포함(무토큰 검증). (onOutput 있으면 함께.)
- `cli/commands/project.ts`: `printTeamRunResult`에서 역할별 `explanation` 있으면 들여써 표시
  (텍스트). `--json`은 role.explanation 자동 포함.
- 테스트: extractExplanation(정상/부재/다중/공백), buildRolePrompt 설명 지시 문자열 포함, executor
  완료 시 explanation 저장(stub), schema explanation 수용/부재, CLI show 설명 표시.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`. **Swift(`apps/macos/**`) 금지.** 기존 Run/teamRuns
  동작 변경 금지(회귀 0). 승인 게이트/worktree/읽기전용/credential 정책 불변.

### Step-by-Step Plan
1. 설계 + buildRolePrompt/summarizeResult/executor 읽기.
2. `explanation.ts` extractExplanation + 테스트.
3. buildRolePrompt 설명 지시 + 테스트.
4. teamRun.schema explanation? + 테스트.
5. executor 완료 시 저장 + StubWorker 합성 + 테스트(stub 경로).
6. CLI show 표시 + 테스트. 게이트 + 자체 리뷰 + 요약.

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
# 헤드리스: stub run → show 에 "## 학습 설명" 표시 확인(무토큰)
```

### Acceptance Criteria
`.baton/runs/learning-explain-dispatch-L1/acceptance-criteria.md` AC-01~08.

### Constraints
- 설명 stdout 섹션 방식(read-only/write 공통). `explanation?` 선택 필드 회귀 0. 안전 정책 불변.
- 순수 추출 함수. base=`origin/main`. commit/push 금지. UI/CLI 한국어, 식별자 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing)
## Explanation Flow (프롬프트 지시 → 워커 "## 학습 설명" → extractExplanation → role.explanation → show)
## Safety (선택 필드 회귀 0, 안전 정책 불변, stub 무토큰)
## Risks / TODOs (L2 체크포인트·L3 스트리밍/Swift 후속, 형식 미준수 graceful)
## Notes for Reviewer (순수 extractExplanation, 완료 시 저장, stub 합성)
```
명령 미실행/테스트 실패는 정직히 보고.
