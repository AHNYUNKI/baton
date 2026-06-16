# Implementation Design

## Summary

완성된 Baton에 (1) 전 파이프라인이 공개 CLI로 묶여 완주함을 증명하는 **hermetic
canonical E2E 테스트**와 (2) 사용자가 따라할 **런북/아키텍처 문서**를 추가한다.
새 기능이 아니라 통합 회귀 방지 + 진입 장벽 제거 레이어. E2E는 stub 워커 + mock
ProcessRunner + FinalizeWriter로 결정적으로 완주하고, 실제 codex/claude 차이는 문서가
정직히 설명한다.

## Scope

### In Scope

- `packages/cli/test/e2e.test.ts`: 기본 워크플로우 start→게이트(approve, implement)→
  approve→resume→test→review→finalize→completed, 산출물·저널·이력 단언(hermetic)
- `docs/USAGE.md`(런북), `docs/ARCHITECTURE.md`(역할/아티팩트/안전/다이어그램)
- 문서 명령 드리프트 방지 가벼운 테스트
- README 링크, (선택) 데모 config 예시

### Out of Scope

- CI 실제 외부 CLI 실행, 호스팅 문서, GIF/영상, 새 런타임 기능

## Proposed Architecture

```text
E2E (hermetic, runCli 주입):
  cwd=tmp, env={BATON_HOME:tmp, BATON_OBSIDIAN_VAULT:tmpVault}, clock=fixed,
  runner=mockProcessRunner([... test exit 0 ...])

  run "<req>" --test --test-command "<cmd>"
     → analyze,design (stub) → APPROVE gate → outcome awaiting-approval   [단언]
  run approve <id>
     → resume → IMPLEMENT gate (policy) → awaiting-approval               [단언]
  run approve <id>
     → resume → implement(stub) → test(mock exit0) → review(stub)
       → finalize(FinalizeWriter) → completed                            [단언]

  assert: <runDir>/{request.md, run.json(completed), test_result.md,
          final_summary.md, pr_description.md}
  assert: run list / run show 반영
  assert: <vault>/Baton/Runs/<id>.md + Runs.md + 복사된 final_summary.md
```

문서는 정적 마크다운(docs/). 코드 변경은 테스트/문서뿐(런타임 동작 불변).

## File-Level Plan

| File | Change |
|---|---|
| `packages/cli/test/e2e.test.ts`(신규) | canonical hermetic E2E(+선택 fix 변형) |
| `packages/cli/test/docs.test.ts`(신규, 선택) | 문서 명령/플래그가 CLI usage에 존재 |
| `docs/USAGE.md`(신규) | 설치~init~config~run(게이트/승인)~status/list/show~journal~finalize 런북 |
| `docs/ARCHITECTURE.md`(신규) | 역할→워커 매핑, 아티팩트 맵, 안전 모델, 파이프라인 다이어그램 |
| `README.md` | docs 링크, 빠른 시작 요약 |
| `examples/`(선택) | 데모 config 예시(BatonConfig 유효) |

## Data Model Changes

없음. 기존 스키마/워커/엔진 재사용. 테스트·문서만 추가.

## API / CLI Changes

없음(표면 불변). 문서가 기존 표면을 기술:
```text
init · project add|list · config list|get|set · agent list · workflow list
run <request> [--dry-run|--codex|--no-codex|--claude|--no-claude|--test|--no-test
              |--test-command <c>|--fix|--no-fix|--max-fix-attempts <n>]
run list|show|status|resume|approve|clean · journal sync · codex|claude doctor
```

## Workflow Changes

없음. E2E가 기존 게이트 흐름(approve + implement 정책 게이트)을 정확히 구동·문서화.

## Error Handling

- E2E는 각 단계 결과(outcome/status)를 단언; 예상과 다르면 테스트 실패.
- 문서는 실패/거부/게이트/미설정 경로를 설명(예: 미승인 대기, fixer 미해결 경고).

## Security Considerations

- E2E는 mock runner만 — 실제 외부 실행/네트워크 0(hermetic).
- credential/세션 토큰 무접근. 문서는 구현된 안전 모델만 기술(과장 금지).

## Test Plan

`test-plan.md` 참조. 요지: 기본 워크플로우 완주(두 게이트 approve), 결정적 산출물·
저널·이력 단언, (선택) fix 변형, 문서 드리프트 방지, hermetic.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-14 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-A01 → task-A04 의존성 순서를 따른다.
- 런타임 동작/스키마 변경 금지(테스트·문서만 추가). v0.1~v0.10 회귀 0.
- E2E는 hermetic(mock runner/임시 디렉터리/fixed clock). 실제 외부 CLI 금지.
- 문서 명령은 실제 CLI 표면과 정확히 일치. hermetic 한계 정직히 구분.
- strict TS/ESM(.js), 런타임 의존성 추가 없음.

## Non-Goals

- 실제 외부 CLI E2E, 호스팅 문서, 새 기능.

## Review Checklist

- [ ] E2E가 기본 워크플로우를 두 게이트 approve로 완주(completed), 결정적 산출물 단언.
- [ ] E2E hermetic(mock runner, 실제 외부 호출 0), fixed clock.
- [ ] 저널/이력 반영 단언. (선택) fix 변형.
- [ ] docs/USAGE·ARCHITECTURE가 실제 CLI와 일치, hermetic 한계 정직 구분, README 링크.
- [ ] 기능/스키마 변경 없음, credential/토큰/danger 회귀 없음, v0.1~v0.10 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.10 누적). 예:
  `git worktree add ../baton-e2e-docs-v0.11 -b baton/e2e-docs-v0.11 origin/main`
- 분기 직후 확인: `packages/schemas/src/batonConfig.schema.ts`(v0.10),
  `packages/cli/src/commands/run.ts`(resolveRunOptions/--no-*), 그리고
  `git merge-base --is-ancestor origin/main HEAD`.
- 리뷰 시 테스트 총개수가 직전(158)보다 줄면 base를 의심하라.

### Goal

완성된 Baton에 (1) 전 파이프라인이 공개 CLI로 묶여 완주함을 증명하는 hermetic
canonical E2E 테스트와 (2) 사용자가 따라할 런북/아키텍처 문서를 추가한다. **새 기능
없음** — 통합 회귀 방지 + 진입 장벽 제거. E2E는 stub 워커 + mock ProcessRunner +
FinalizeWriter로 결정적으로 완주하고, 실제 codex/claude 차이는 문서가 정직히 설명한다.

성공 기준은 "테스트/문서 추가"뿐 아니라 **hermetic 완주 단언 + CLI와 정확히 일치하는
문서 + 회귀 0**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/e2e-docs-v0.11/design.md`
3. `.baton/runs/e2e-docs-v0.11/tasks.json`
4. `.baton/runs/e2e-docs-v0.11/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.10 코드(특히 `cli.test.ts`의 runCli 주입 패턴, 기본 워크플로우,
   게이트/approve/resume, FinalizeWriter, journal export)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/cli/test/e2e.test.ts`
- `docs/USAGE.md`
- `docs/ARCHITECTURE.md`
- `packages/cli/test/docs.test.ts`(선택, 문서 드리프트 방지)

### Files to Modify

- `README.md` — docs 링크 + 빠른 시작 요약
- `examples/`(선택) — 데모 config 예시(BatonConfig 유효)

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- 런타임 코드/스키마/워커/엔진 동작 변경 금지(테스트·문서만).
- 실제 codex/claude/git을 실행하는 테스트 금지(mock만).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/e2e-docs-v0.11/`의 design/tasks/analysis/acceptance/test-plan 읽기 +
   기존 cli.test.ts의 runCli 주입 패턴/게이트 흐름 파악.
2. `e2e.test.ts`: 기본 워크플로우를 runCli로 start → approve 게이트 awaiting →
   approve → resume → implement 게이트 awaiting → approve → resume → test(mock exit0)
   → review → finalize → completed. request.md/run.json/test_result.md/final_summary.md/
   pr_description.md 존재 + run list/show 반영 + 임시 볼트 저널 export 단언. hermetic
   (mock runner/임시 디렉터리/fixed clock). (task-A01)
3. (선택) fix 변형: test 1회 실패 후 성공 mock + `--fix --codex` → bounded 재시도 후
   completed, attempts 단언. (task-A01에 포함)
4. `docs/USAGE.md`: 설치~init~config set(워커/볼트/테스트)~run(게이트/승인 흐름)~
   status/list/show~journal sync~finalize 산출물까지 실제 명령 시퀀스. hermetic 한계
   (analysis/design/review.md는 실제 --claude 필요) 정직히 구분. (task-A02)
5. `docs/ARCHITECTURE.md`: 역할→워커 매핑, 아티팩트 맵, 안전 모델, 파이프라인 텍스트
   다이어그램. 코드와 대조해 정확히. (task-A03)
6. (선택) `docs.test.ts`로 문서 핵심 명령/플래그가 CLI usage에 존재함을 단언. README
   docs 링크. 전체 게이트 + 스모크, 자체 diff 리뷰, 최종 요약. (task-A04)

### Test Commands

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
node packages/cli/dist/main.js run --help
```

명령 미실행/실패는 성공으로 위장하지 말고 그대로 보고.

### Acceptance Criteria

`.baton/runs/e2e-docs-v0.11/acceptance-criteria.md`의 AC-01 ~ AC-14 전부 충족.
특히: 두 게이트 approve로 completed(AC-01), hermetic(AC-02), 결정적 산출물(AC-03),
저널/이력(AC-04/05), 문서 CLI 일치 + hermetic 한계 구분(AC-09/10), 회귀 0(AC-13).

### Constraints

- strict TS, ESM(.js), 런타임 의존성 zod/yaml만. 런타임 동작/스키마 변경 금지.
- E2E hermetic(mock runner/임시 디렉터리/fixed clock). 실제 외부 CLI/네트워크 금지.
- 문서는 실제 CLI 표면과 정확히 일치, hermetic 한계 정직 구분. credential/토큰 무접근.
- base = `origin/main`. 새 worktree. **commit/push 하지 말 것**.

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
- 실제 외부 CLI E2E, 호스팅 문서 등 남은 항목

## Notes for Reviewer
- E2E 완주(두 게이트)·hermetic·결정적 산출물·저널/이력, 문서 CLI 일치·hermetic 한계
  구분, 회귀 0을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
