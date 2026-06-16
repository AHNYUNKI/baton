# Implementation Design

## Summary

Baton run 내역을 **Obsidian 볼트에 자동·자기완결·Dataview 친화**로 기록하는
저널 레이어를 추가한다. 코어에 순수성 높은 `ObsidianJournalExporter`(run→요약 노트
+ 아티팩트 복사 + MOC 인덱스, 주입 FS/Clock)를 두고, 자동 내보내기는 CLI 레이어
공통 훅에서 run 종료/대기 후 호출한다. 볼트 경로는 env/config로 해석하며 미설정 시
무해(no-op). 쓰기는 볼트 `Baton/` 하위로 강제한다. 엔진은 Obsidian과 무결합 유지.

## Scope

### In Scope

- `JournalNoteMeta`(Zod) frontmatter 스키마
- `resolveObsidianVault({env,config})`(env 우선, config 폴백, 미설정 undefined)
- `ObsidianJournalExporter`: `exportRun`(노트+아티팩트 복사+임베드),
  `updateIndex`(Dataview+정적 표 MOC), 경로 강제/sanitize/멱등
- CLI 자동 내보내기 훅(start/resume/approve 후, 볼트 설정 시)
- (선택) `baton journal sync` 백필
- 단위/통합/안전 테스트(임시 볼트, fixed clock)

### Out of Scope

- Obsidian 플러그인/URI, 실시간 동기화, 양방향 편집, 그래프 설정, SQLite, 네트워크

## Proposed Architecture

```text
CLI run/resume/approve → (결과) → maybeExportJournal(context, run, runDir)
  └─ vault = resolveObsidianVault({ env, config })
        if !vault: return            # no-op (자동만, 미설정 무해)
        try:
          ObsidianJournalExporter.exportRun(run, { vaultPath: vault, runDirectory, clock })
            ├─ ensure <vault>/Baton/Runs/<safeRunId>/         # 경로 강제
            ├─ copy run 아티팩트 → 그 폴더 (자기완결)
            └─ write <vault>/Baton/Runs/<safeRunId>.md         # frontmatter + 요약 + ![[embeds]]
          ObsidianJournalExporter.updateIndex(allRuns, { vaultPath: vault })
            └─ write <vault>/Baton/Runs.md                      # Dataview + 정적 표
        catch e: warn(e)             # run 결과/종료 코드 불변 (AC-14)
```

코어 익스포터는 순수(주입 FS/Clock). 엔진은 호출하지 않음(provider-agnostic 유지).

## File-Level Plan

| File | Change |
|---|---|
| `packages/schemas/src/journalNote.schema.ts`(신규) | `JournalNoteMeta` Zod + 타입 |
| `packages/schemas/src/index.ts` | 재export |
| `packages/core/src/journal/resolveObsidianVault.ts`(신규) | env/config 경로 해석 |
| `packages/core/src/journal/ObsidianJournalExporter.ts`(신규) | exportRun/updateIndex, 경로 강제/sanitize/멱등 |
| `packages/core/src/journal/render.ts`(신규) | frontmatter/표/임베드 렌더 헬퍼(순수) |
| `packages/core/src/index.ts` | 재export |
| `packages/cli/src/commands/run.ts` | `maybeExportJournal` 훅 + (선택) `journal sync` |
| `packages/cli/src/main.ts` | (선택) `journal` 라우팅, help |
| `.gitignore` | `!.baton/runs/obsidian-journal-v0.5/` |
| `README.md` | 볼트 설정/자동 기록/형태 문서화 |
| `packages/*/test/*` | schema/resolve/exporter/index/cli/안전 테스트 |

## Data Model Changes

```ts
// journalNote.schema.ts
JournalNoteMeta = {
  runId: string;
  status: RunStatus;
  dryRun: boolean;
  workflow: string;
  createdAt: string;
  updatedAt?: string;
  outcome?: string;
  roles: string[];                       // step 역할들
  workers: Record<string, string>;       // 역할 → 'codex'|'claude'|'stub'
  stepCount: number;
  tags: string[];                        // ['baton', `baton/${status}`, dryRun? 'baton/dry-run']
}
```

볼트 파일 레이아웃(자기완결):

```text
<vault>/Baton/
  Runs.md                       # MOC 인덱스 (Dataview + 정적 표)
  Runs/
    <runId>.md                  # 요약 노트 (frontmatter + 요약 + ![[embeds]])
    <runId>/
      request.md, analysis.md, design.md, review.md, run.json, ...  # 복사된 아티팩트
```

## API / CLI Changes

신규 core API: `ObsidianJournalExporter`, `resolveObsidianVault`, `JournalNoteMeta`.

CLI:
```bash
# 자동: 볼트 설정 시 run/resume/approve 후 자동 기록 (별도 플래그 없음)
export BATON_OBSIDIAN_VAULT=/path/to/vault     # 또는 .baton config의 obsidian.vault
baton run "<request>"                           # 종료/대기 → 자동 내보내기
baton journal sync                              # (선택) 기존 run 백필
```

## Workflow Changes

실행 의미(격리·게이트·재개)는 불변. 추가는 CLI 레이어의 사후 기록 훅뿐. 모든 run
상태(completed/failed/cancelled/awaiting-approval/dry-run)가 frontmatter status/태그로
구분되어 기록된다.

## Error Handling

- 볼트 미설정 → no-op(조용, 1회 힌트 허용). run 정상.
- 내보내기 예외 → 경고 출력, run 결과/종료 코드 불변(AC-14). 부분 쓰기여도 run 보호.
- 악의적/이상 runId → sanitize(경로 분리자/`..` 제거). 볼트 밖 경로면 거부.
- 아티팩트 복사 중 일부 누락 → 가능한 만큼 복사 + 경고, 노트는 생성.

## Security Considerations

- 쓰기는 볼트 `Baton/` 하위로 강제(`resolve`+`startsWith` 검증). 삭제 연산 없음
  (덮어쓰기만) → 사용자 기존 노트 보호.
- 복사 대상은 run 디렉터리 아티팩트만(기존 안전: credential/세션 토큰 무접근).
- 익스포터는 외부 프로세스/토큰 미접근. `danger-full-access` 무관.
- 보안/경로 회귀 테스트 유지.

## Test Plan

`test-plan.md` 참조. 요지: 미설정 no-op, 자기완결 복사·임베드, 경로 강제/악의적
runId, 멱등, Dataview+정적 표 인덱스, 내보내기 실패가 run 불변, fixed clock 결정성.

## Acceptance Criteria

`acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.

## Codex Implementation Instructions

- `tasks.json`의 task-401 → task-407 의존성 순서를 따른다.
- v0.1~v0.4 공개 동작/테스트를 깨지 말 것. 엔진에 Obsidian 결합 금지(CLI 훅만).
- 쓰기는 볼트 `Baton/` 하위로 강제, 삭제 연산 없음, runId sanitize.
- 결정적 렌더(주입 Clock), 모든 FS 테스트는 임시 볼트.
- 런타임 의존성 추가 없음(zod/yaml). 실제 Obsidian 불필요.

## Non-Goals

- Obsidian 플러그인/URI 연동, 실시간/양방향 동기화, SQLite, 네트워크.

## Review Checklist

- [ ] 볼트 미설정 시 run 정상 + 내보내기 no-op.
- [ ] 쓰기 경로가 볼트 `Baton/` 하위로 강제, 악의적 runId sanitize, 삭제 없음.
- [ ] 자기완결(아티팩트 복사) + 핵심 임베드, frontmatter Dataview 친화.
- [ ] 인덱스 Dataview+정적 표, createdAt 내림차순, 멱등.
- [ ] 내보내기 실패가 run 결과/종료 코드 불변. 엔진 무결합.
- [ ] credential/세션 토큰/danger 회귀 없음. v0.1~v0.4 회귀 없음.

---

## Codex Handoff

아래를 그대로 Codex에 붙여넣어 구현을 시작한다.

### ⚠️ Base Branch (필수 — 첫 시도 REJECT 사유)

- **반드시 `origin/main`에서 분기**한다(최신, v0.1~v0.4 누적: Run 엔진/실제 Codex/
  Claude 어댑터/resume/approve/clean 포함). 예:
  `git worktree add ../baton-obsidian-journal-v0.5 -b baton/obsidian-journal-v0.5 origin/main`
- 첫 시도는 stale한 v0.1 트리에서 분기해 v0.2~v0.4가 누락됐고 훅이 dry-run에만
  붙어 REJECT 됐다. 분기 후 `RunExecutor.ts`/`RunStore.ts`/`registry.ts`/
  `ClaudeCodeAdapter.ts` 존재를 먼저 확인하라.
- 기존 저널 코어(첫 시도의 `journal/*`, `journalNote.schema.ts`, `journal.ts`)는
  재사용 가능 — 그대로 이식하되, 훅은 **실제 run/resume/approve/clean** 흐름에 연결하고
  `workers` 메타에 실제 레지스트리(codex/claude/stub)를 반영하라.

### Goal

Baton v0.5: Baton run 내역을 **Obsidian 볼트에 자동·자기완결·Dataview 친화**로
기록한다. 코어에 순수 `ObsidianJournalExporter`(run→요약 노트 + 아티팩트 복사 +
MOC 인덱스)를 만들고, 자동 내보내기는 CLI 레이어 훅에서 run 종료/대기 후 호출한다.
볼트 경로는 env/config로 해석하고 미설정 시 무해(no-op). 쓰기는 볼트 `Baton/`
하위로 강제한다. 엔진은 Obsidian과 무결합 유지.

성공 기준은 "내보내기 동작"이 아니라 **안전(볼트 Baton/ 하위 한정, 사용자 노트
보호) + 자기완결 + 결정적 + 미설정 무해 + 회귀 없음**이다.

### Source of Truth (우선순위)

1. 이 Codex Handoff
2. `.baton/runs/obsidian-journal-v0.5/design.md`
3. `.baton/runs/obsidian-journal-v0.5/tasks.json`
4. `.baton/runs/obsidian-journal-v0.5/analysis.md`, `acceptance-criteria.md`, `test-plan.md`
5. 기존 v0.1~v0.4 코드 컨벤션(`RunStore`, `ArtifactStore`, `config/paths`, CLI run)
6. `AGENTS.md`

충돌 시 추측하지 말고 멈추고 보고.

### Files to Create

- `packages/schemas/src/journalNote.schema.ts`
- `packages/core/src/journal/resolveObsidianVault.ts`
- `packages/core/src/journal/ObsidianJournalExporter.ts`
- `packages/core/src/journal/render.ts`
- `packages/core/test/{resolveObsidianVault,obsidianJournalExporter}.test.ts`
- `packages/schemas/test/journalNote.test.ts`(또는 기존 schemas.test에 추가)

### Files to Modify

- `packages/schemas/src/index.ts` — `JournalNoteMeta` 재export
- `packages/core/src/index.ts` — journal API 재export
- `packages/cli/src/commands/run.ts` — `maybeExportJournal` 훅(start/resume/approve
  후), (선택) `journal sync`
- `packages/cli/src/main.ts` — (선택) `journal` 라우팅 + help
- `packages/cli/test/cli.test.ts` — 자동 내보내기/미설정 no-op/실패 불변 테스트
- `.gitignore` — `!.baton/runs/obsidian-journal-v0.5/`
- `README.md` — 볼트 설정/자동 기록/형태 문서화

### Files NOT to Modify / NOT to Create

- `CLAUDE.md`, `AGENTS.md` 수정 금지.
- `.baton/runs/**` 설계 아티팩트 수정 금지(읽기 전용 입력).
- `RunExecutor`/코어 엔진에 Obsidian 결합 금지(자동 내보내기는 CLI 훅만).
- 볼트 내 사용자 기존 노트 수정/삭제 코드 금지(덮어쓰기만, `Baton/` 하위만).
- 런타임 의존성 추가 금지(`zod`, `yaml`).

### Step-by-Step Implementation Plan

1. `.baton/runs/obsidian-journal-v0.5/`의 design/tasks/analysis/acceptance/test-plan 읽기.
2. `JournalNoteMeta`(Zod) + 테스트. (task-401)
3. `resolveObsidianVault({env,config})`(env 우선, config 폴백, 미설정 undefined) +
   테스트. (task-402)
4. `ObsidianJournalExporter.exportRun`: `<vault>/Baton/Runs/<safeRunId>.md` 노트
   (frontmatter + 요약 + step 표 + 워커 + outcome) + 아티팩트를
   `<vault>/Baton/Runs/<safeRunId>/`로 복사 + analysis/design/review 임베드. 경로
   강제(`Baton/` 하위)·runId sanitize·멱등. render.ts 헬퍼. + 테스트. (task-403)
5. `updateIndex(runs,{vaultPath})`: `<vault>/Baton/Runs.md`에 Dataview 코드블록 +
   정적 표, createdAt 내림차순, wikilink, 재생성 멱등 + 테스트. (task-404)
6. CLI `maybeExportJournal` 훅: start/resume/approve 결과 후 볼트 설정 시 export+
   index. 미설정 no-op, 내보내기 예외는 경고만(run 결과/종료 코드 불변). 주입
   Clock·env 사용 + 테스트. (task-405)
7. (선택) `baton journal sync`: 기존 모든 run 백필 + 인덱스 재생성 + 테스트. (task-406)
8. `.gitignore` allow-list, README, 보안/경로 회귀 테스트, 전체 게이트 + 스모크,
   자체 diff 리뷰, 최종 요약. (task-407)

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

`.baton/runs/obsidian-journal-v0.5/acceptance-criteria.md`의 AC-01 ~ AC-18 전부 충족.
특히: 미설정 no-op(AC-03/12), 볼트 `Baton/` 하위 강제+sanitize(AC-07), 자기완결
복사·임베드(AC-06), 멱등(AC-08), Dataview+정적 표 인덱스(AC-09), 내보내기 실패가
run 불변(AC-14).

### Constraints

- strict TS, ESM(.js), export 함수 명시 반환 타입, 런타임 의존성 zod/yaml만.
- 자동만(별도 플래그 없이 볼트 설정 시 동작). 미설정 무해.
- 쓰기는 볼트 `Baton/` 하위 한정, 삭제 없음, runId sanitize. 사용자 노트 보호.
- 결정적 렌더(주입 Clock), 모든 FS 테스트는 임시 볼트.
- 엔진 provider/도구-agnostic 유지(Obsidian은 CLI 훅 + 코어 순수 익스포터).
- credential/세션 토큰 무접근, danger 금지(기존 안전 유지).
- **base = `origin/main`**(위 Base Branch 참조). 훅은 dry-run이 아닌 실제 run/
  resume/approve/clean 흐름에 연결.
- 작업은 새 worktree에서. **commit/push 하지 말 것**(명시 요청 전까지).

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
- 증분 인덱스, Obsidian URI 연동, SQLite 등 남은 항목

## Notes for Reviewer
- 미설정 no-op, 볼트 Baton/ 경로 강제 + sanitize, 자기완결 복사·임베드, 멱등,
  내보내기 실패가 run 불변, 엔진 무결합을 집중 확인
```

명령 미실행/테스트 실패는 정직하게 보고.
