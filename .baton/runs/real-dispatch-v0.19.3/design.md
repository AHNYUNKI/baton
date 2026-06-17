# Implementation Design — real-dispatch-v0.19.3

## Summary

TeamRun 실행의 워커를 StubWorker → **실제 codex/claude**로 교체(opt-in). 첫 컷은 **읽기 전용**:
codex `--sandbox read-only`, claude 비편집(읽기/plan) 모드라 **repo 파일을 수정하지 않고**
분석·설계·산출물만 만든다. 기본은 여전히 stub(회귀 0). 승인 게이트·worktree 격리·base≠main·
타임아웃·preflight를 유지/추가하고, claude는 `--output-format json`으로 **실측 토큰**을 회수해
토큰 표가 추정→실측으로 전환된다. 쓰기 모드·병렬·fix 루프·Swift는 후속. headless TS.

## Scope

### In Scope
- `createAgentWorkerRegistry`에 **읽기 전용 실제 어댑터** 옵션(codex read-only / claude 비편집).
- `ClaudeCodeAdapter` opt-in 옵션: 읽기전용 권한 플래그 + JSON 출력 파싱(usage+결과 텍스트).
  기존 `--print` 기본 동작 **보존**(기존 Run 회귀 0).
- CLI `plan run start --codex/--claude` opt-in + **preflight**(CLI 존재 확인) + 타임아웃.
- (codex) usage best-effort, 없으면 추정 폴백.
- 단위 테스트(mock runner): 인자/플래그/파싱/preflight/회귀. 종단 실행은 수동 QA.

### Out of Scope
- **쓰기 모드**(workspace-write) — 명시적 후속(강화 게이트와 함께).
- 병렬, 역할별 게이트, fix 루프, 재위임, Swift 모니터.
- Baton 자체 HTTP/네트워크(인증·호출은 AI CLI 자체가 수행).

## Proposed Architecture

### 읽기 전용 프로파일 — AgentWorkerRegistry (core/teamRuns)
```ts
createAgentWorkerRegistry({ codex?, claude?, runner?, readOnly = true }):
  codex:  readOnly ? new CodexExecAdapter({ runner, sandbox: "read-only" })
                   : (※ 쓰기 모드는 후속 — 이번엔 read-only 고정)
  claude: new ClaudeCodeAdapter({ runner, readOnly: true, outputFormat: "json" })
  (codex/claude false면 StubWorker — 기본)
```
- **read-only는 이번 컷에서 사실상 강제**(write 분기 미구현). codex sandbox를 명시적으로
  read-only로 생성(어댑터 기본 workspace-write를 덮어씀).

### ClaudeCodeAdapter (opt-in 옵션 추가, 기본 보존)
```ts
ClaudeCodeAdapterOptions += {
  readOnly?: boolean;          // true면 비편집 권한 플래그 추가
  outputFormat?: "text"|"json" // "json"이면 usage 파싱 + 결과 텍스트 추출
}
```
- `readOnly`: claude 비편집 플래그 부착. **정확 플래그는 `claude --help`로 확인**(후보:
  `--permission-mode plan`, 또는 읽기 전용 tool allowlist `--allowedTools ...`). 불확실하면
  **가장 제한적**(편집/실행 도구 차단)으로. 목표: 파일 수정 불가.
- `outputFormat:"json"`: `--output-format json`으로 실행 → stdout JSON 파싱:
  - `result`(텍스트) → WorkerRunResult.stdout(릴레이/요약/산출물용),
  - `usage`(input/output tokens) → `metadata.usage = { inputTokens, outputTokens }`(실측).
  - 파싱 실패 시 원문 stdout 유지 + usage 생략(추정 폴백). 안전한 폴백.
- 기본(옵션 미지정)은 현행 `--print` 평문 — **기존 Run 경로 불변**.

### CodexExecAdapter
- 기존 `sandbox:"read-only"` 경로 사용(코드 변경 거의 없음). usage는 가능하면 파싱(best-effort);
  포맷 불확실 → 미수집(executor가 추정 폴백, estimated:true). (codex usage 파싱은 후속 확정.)

### CLI — plan run start (project.ts)
```
baton project plan run start <projectId> [--codex] [--claude] [--base <b>] [--timeout-ms <n>] [--json]
```
- 플래그 없음 → `createAgentWorkerRegistry()`(stub) — **현행 동일**.
- `--codex`/`--claude` → 해당 플랫폼 실제(읽기 전용) 어댑터. runner 주입.
- **preflight**: 켠 플랫폼마다 `checkCodex`/`checkClaude`(기존 함수 재사용)로 CLI 존재/실행 가능
  확인 → 실패 시 친절한 비영 오류("codex CLI를 찾을 수 없습니다 ...")로 **디스패치 전 중단**.
- 타임아웃: `--timeout-ms` 또는 합리적 기본(예: 실 호출 대비 충분히 큰 값) → executor.timeoutMs.
- 승인 흐름 불변: start→awaiting-approval, approve→실제 디스패치.

### 안전 (다중 방어)
1. **읽기 전용 강제**: codex read-only sandbox, claude 비편집. repo 파일 미수정.
2. **opt-in**: 기본 stub. 플래그 줘야 실제 호출.
3. **pre-dispatch 승인 게이트**(기존): 승인 전 호출 없음.
4. **worktree 격리 + base≠main**(기존): 메인 직접 변경 불가.
5. **preflight**: 미설치/미인증 사전 차단.
6. **타임아웃**: 행 방지. 역할당 1회(무한 루프 없음).
7. **credential 무접근**: 인증은 codex/claude CLI 자체. Baton은 auth 파일 미접근, 직접 HTTP 없음.

## File-Level Plan
| File | Change |
|---|---|
| `packages/core/src/teamRuns/AgentWorkerRegistry.ts` | read-only 프로파일(codex read-only, claude readOnly+json) |
| `packages/core/src/workers/claude/ClaudeCodeAdapter.ts` | opt-in readOnly/outputFormat + JSON usage 파싱(기본 보존) |
| `packages/core/src/workers/codex/CodexExecAdapter.ts` | (best-effort) usage; 대개 변경 최소 |
| `packages/cli/src/commands/project.ts` | `--codex/--claude/--timeout-ms` + preflight |
| `packages/core/src/teamRuns/TeamRunExecutor.ts` | (선택) 기본 timeout 상수 |
| 각 `*.test.ts` | wiring/파싱/플래그/preflight/회귀 |

## Data Model Changes
없음. (usage는 v0.19.2 필드 재사용 — 이제 claude가 실측을 채움.) 스키마 불변.

## API / CLI Changes
`plan run start`에 `--codex/--claude/--timeout-ms` 플래그 추가(기본 동작 불변). read API 불변.

## Error Handling
- CLI 미설치/실행 불가 → preflight 친절 오류, 디스패치 전 중단.
- claude JSON 파싱 실패 → 원문 유지 + usage 생략(추정 폴백). 크래시 없음.
- 어댑터 실행 실패(비영 exit/throw) → 역할 failed + reason, 잔여 skipped(기존 골격).
- 타임아웃 초과 → 실패 처리(reason 기록).

## Security Considerations
- 읽기 전용(파일 미수정) + opt-in + 승인 게이트 + worktree 격리 + base≠main + preflight + 타임아웃.
- **danger/full-access 금지, 쓰기 모드 미구현.** credential/auth 파일 무접근, Baton 직접 HTTP 없음.
- claude 읽기전용 플래그는 안전 핵심 → 정확 플래그 확인 + 수동 QA로 "파일 미수정" 검증 필수.

## Test Plan
`test-plan.md`. mock runner로: 레지스트리가 codex read-only sandbox/claude 읽기전용+json 인자
구성, claude JSON→usage/텍스트 파싱(+실패 폴백), CLI 플래그→실제 어댑터 선택·preflight 분기,
기본(플래그 없음)→stub, 기존 Run/claude 기본 동작 회귀 0. 종단 실제 실행은 수동 QA.

## Acceptance Criteria
`acceptance-criteria.md` AC-01~12.

## Non-Goals
쓰기 모드, 병렬/역할별 게이트/fix 루프/재위임, Swift, Baton 직접 네트워크.

## Review Checklist
- [ ] 기본(플래그 없음) stub 유지, 기존 Run/claude 기본 동작 회귀 0.
- [ ] `--codex`→read-only sandbox, `--claude`→비편집+json. 인자 검증 테스트.
- [ ] claude JSON usage 파싱(실측) + 파싱 실패 폴백. 토큰 표 실측 전환.
- [ ] preflight 미설치 차단, 승인 게이트/worktree/base≠main/타임아웃 유지.
- [ ] 쓰기 모드 미구현(읽기 전용). credential/HTTP 없음. 수동 QA로 파일 미수정 확인 안내.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base / 언어 / 안전 / 정리
- **`origin/main`에서 분기**: `git worktree add ../baton-real-dispatch
  -b baton/real-dispatch-v0.19.3 origin/main`. 시작 전
  `git merge-base --is-ancestor origin/main HEAD`.
- **TypeScript 전용**(core/cli). **Swift 변경 금지.**
- **읽기 전용 첫 컷**: codex `--sandbox read-only`, claude 비편집. **쓰기(workspace-write) 모드
  구현·노출 금지.** 기본은 **stub 유지**(플래그 없으면 현행 동일).
- **기존 Run 경로(`cli/registry.ts`의 `createWorkerRegistry`, `ClaudeCodeAdapter` 기본 `--print`)
  동작 변경 금지** — claude 어댑터 변경은 **opt-in 옵션**으로만.
- 게이트: 루트 `corepack pnpm typecheck && pnpm test && pnpm build` 회귀 0.
- 종단 실제 실행(실 codex/claude)은 수동 QA — 단위 테스트는 **주입 mock runner**로.
- 머지 후 worktree 즉시 제거. **commit/push 금지**.

### Goal
TeamRun 디스패치를 stub→실제 codex/claude(opt-in)로. **읽기 전용 강제**(repo 파일 미수정):
codex `--sandbox read-only`, claude 비편집 권한 + `--output-format json`으로 실측 usage 회수.
승인 게이트·worktree 격리·base≠main·타임아웃·preflight 유지/추가. 기본 stub·기존 Run 불변.

성공 기준: mock runner로 (1) 레지스트리가 codex read-only/claude 읽기전용+json 인자를 구성,
(2) claude JSON→usage/텍스트 파싱(+실패 폴백), (3) CLI 플래그→실제 어댑터·preflight 분기,
(4) 플래그 없음→stub, (5) 기존 Run/claude 기본 동작·전체 테스트 회귀 0.

### Source of Truth (우선순위)
1. 이 Handoff
2. `.baton/runs/real-dispatch-v0.19.3/design.md`
3. `.../tasks.json`
4. `.../analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 코드: `teamRuns/AgentWorkerRegistry.ts`, `workers/codex/CodexExecAdapter.ts`
   (sandbox 옵션), `workers/claude/ClaudeCodeAdapter.ts`, `ports/ProcessRunner.ts`,
   `teamRuns/TeamRunExecutor.ts`(invokeWorker/usage), `teamRuns/usage.ts`,
   `commands/project.ts`(plan run + checkCodex/checkClaude preflight 패턴), `cli/registry.ts`.
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고. **claude 읽기전용 정확 플래그/`--output-format json` usage
필드/codex usage 포맷은 `codex --help`·`claude --help`로 확인**하고, 불확실하면 가장 제한적(안전)
쪽으로 + 보고.

### Files to Create / Modify (전부 TS)
- `teamRuns/AgentWorkerRegistry.ts`: `createAgentWorkerRegistry({codex,claude,runner,readOnly=true})`
  — codex:true→`new CodexExecAdapter({runner, sandbox:"read-only"})`, claude:true→
  `new ClaudeCodeAdapter({runner, readOnly:true, outputFormat:"json"})`, 아니면 StubWorker.
  (쓰기 분기 미구현 — read-only 고정.)
- `workers/claude/ClaudeCodeAdapter.ts`: 옵션 추가 `readOnly?`, `outputFormat?:"text"|"json"`.
  readOnly면 비편집 플래그 부착(정확 플래그 `claude --help` 확인, 불확실 시 최대 제한).
  outputFormat="json"이면 `--output-format json`로 실행 후 stdout JSON 파싱 → `result` 텍스트를
  stdout으로, `usage`(input/output tokens)를 `metadata.usage`로. 파싱 실패 시 원문 유지+usage
  생략. **옵션 미지정 시 현행 `--print` 평문 동작 보존.**
- `workers/codex/CodexExecAdapter.ts`: (선택) 출력에서 usage 파싱 best-effort, 가능할 때만
  `metadata.usage` 설정. 불확실하면 미설정(추정 폴백). sandbox read-only는 기존 옵션 사용.
- `commands/project.ts`: `plan run start`에 `--codex`,`--claude`,`--timeout-ms` 추가. 켠 플랫폼만
  실제 어댑터로 `createAgentWorkerRegistry({codex,claude,runner})`. **preflight**: 켠 플랫폼마다
  `checkCodex`/`checkClaude`로 사전 확인 → 실패 시 친절한 비영 오류로 중단(디스패치 전).
  플래그 없으면 stub. 도움말 갱신.
- (선택) `TeamRunExecutor.ts`: 실 호출 대비 합리적 기본 timeoutMs 상수(없으면 옵션 그대로).
- 테스트: 레지스트리 wiring(codex read-only sandbox·claude readOnly+json 인자), claude 어댑터
  JSON 파싱(usage/텍스트, 실패 폴백, 기본 `--print` 보존), CLI 플래그/ preflight(mock runner),
  플래그 없음→stub, 기존 Run/claude 회귀.

### Files NOT to Modify
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`(읽기 전용). Swift(`apps/macos/**`) 금지.
- `cli/registry.ts`의 기존 Run 워커 구성/기존 동작 변경 금지(회귀 0). 쓰기(workspace-write) 모드
  구현·플래그 금지. credential/auth 파일 접근·Baton 직접 HTTP 금지. 병렬/fix 루프/재위임 금지.

### Step-by-Step Plan
1. 설계/태스크 + 기존 어댑터/registry/CLI preflight 읽기. `codex/claude --help`로 읽기전용·json 확인.
2. ClaudeCodeAdapter opt-in 옵션(readOnly/outputFormat) + JSON usage 파싱 + 폴백 + 테스트(기본 보존).
3. AgentWorkerRegistry read-only 프로파일 + 테스트(인자 검증).
4. (선택) CodexExecAdapter usage best-effort.
5. CLI `--codex/--claude/--timeout-ms` + preflight + 테스트(mock runner, stub 기본).
6. 전체 게이트 + 자체 diff 리뷰 + 최종 요약(읽기 전용·기본 stub·실측 토큰·수동 QA 안내 명시).

### Test / Gate Commands
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
종단 실제 실행은 수동 QA(실 CLI·인증 필요). 명령 미실행/실패는 정직히 보고.

### Acceptance Criteria
`.baton/runs/real-dispatch-v0.19.3/acceptance-criteria.md` AC-01~12. 특히: 읽기 전용 인자
(AC-02/03), claude 실측 usage 파싱+폴백(AC-04/05), CLI 플래그·preflight(AC-06/07), 기본 stub·
기존 Run 회귀 0(AC-08/12), 안전 다중 방어(AC-09~11).

### Constraints
- 읽기 전용 강제(쓰기 금지). opt-in(기본 stub). claude 변경은 opt-in 옵션(기존 동작 보존).
- 승인 게이트·worktree·base≠main·타임아웃·preflight·credential 무접근 유지.
- base=`origin/main`. commit/push 금지. UI/CLI 한국어, 식별자/플래그 영어.

### Expected Final Summary Format
```md
## Summary
## Changed Files (표)
## Commands Run (표: pnpm typecheck/test/build)
## Tests (Passing / Failing / 수동 QA만(실 CLI 종단))
## Dispatch (읽기전용 codex sandbox·claude 비편집 / claude 실측 usage / 기본 stub)
## Safety (읽기전용·opt-in·승인 게이트·worktree·base≠main·preflight·타임아웃·credential 무접근)
## Manual QA (실 codex/claude로 파일 미수정·산출물·실측 토큰 확인 절차)
## Risks / TODOs (쓰기 모드·병렬·Swift·codex usage 후속, claude 읽기전용 플래그 확정 내역)
## Notes for Reviewer (opt-in 옵션로 기존 Run 보존, mock runner 테스트)
```
명령 미실행/테스트 실패, 불확실한 플래그는 정직히 보고.
