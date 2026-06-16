# Analysis

## User Request

Baton run의 작업 내역을 Obsidian 볼트에 **자동으로, 자기완결 형태로(Dataview 친화)**
정리해 사용자가 작업을 추적·기록하기 쉽게 만든다. run 종료/대기 시 자동 내보내기,
run별 요약 노트 + 아티팩트 복사·임베드 + 전체 인덱스(MOC).

## Intent

지금까지 Baton은 `.baton/runs/<runId>/`에 기계 친화적 아티팩트를 남겼지만, 사용자가
"무엇을 했는지" 사람 친화적으로 훑어보긴 어렵다. 이 마일스톤의 가치는 **사람을 위한
기록 레이어**: Obsidian에서 검색·백링크·Dataview로 run 이력을 탐색하게 한다. 핵심은
"내보내기"보다 *안전하고 자기완결적이며 자동인* 기록이다(볼트의 Baton/ 하위에만,
멱등, 미설정 시 무해).

## Current Repository Understanding (v0.4 / PR #4 기준)

- `packages/core/src/config/paths.ts` — `batonHome($BATON_HOME)`, `getRunDir(runId)`.
  볼트 경로 해석을 추가할 자리.
- `packages/core/src/artifacts/ArtifactStore.ts` — `getRunDir`, write/read. run
  디렉터리에 request.md/analysis.md/design.md/run.json/logs/steps/events.jsonl/
  review.md 등이 쌓임(워커·엔진이 생성).
- `packages/core/src/runs/RunStore.ts` — `load(runId)` → `Run`(상태/steps/worktreePath/
  approvals/cleanedAt 등). 내보낼 메타의 출처.
- `packages/cli/src/commands/run.ts` — start/resume/approve가 실행 결과를 만든 뒤
  출력. 여기서 종료/대기 도달 시 **자동 내보내기 훅**을 건다.
- `packages/cli/src/commands/context.ts` — `CommandContext`에 `env`/`cwd` 존재 →
  볼트 경로(env) 해석 가능.
- `.gitignore` — 설계 run allow-list 누적(`!.baton/runs/<id>/`). v0.5도 추가.

## Relevant Files

| File | Reason |
|---|---|
| `packages/schemas/src/journalNote.schema.ts`(신규) | 노트 frontmatter 메타(Zod) |
| `packages/core/src/journal/resolveObsidianVault.ts`(신규) | env/config 볼트 경로 해석 |
| `packages/core/src/journal/ObsidianJournalExporter.ts`(신규) | run→노트/폴더 렌더+복사, 인덱스 |
| `packages/core/src/journal/render.ts`(신규, 선택) | frontmatter/표/임베드 렌더 헬퍼 |
| `packages/core/src/runs/RunStore.ts` | run 로드(내보낼 데이터) |
| `packages/core/src/artifacts/ArtifactStore.ts` | run 디렉터리/아티팩트 목록 |
| `packages/cli/src/commands/run.ts` | 자동 내보내기 훅, (선택) journal sync |

## Existing Behavior

run 산출물은 `.baton/runs/<runId>/`에만 존재. Obsidian/사람 친화 기록 레이어 없음.
사용자가 이력을 훑으려면 파일을 직접 열어야 함.

## Target Behavior

- 볼트가 설정된 상태에서 `baton run …`(또는 resume/approve)이 종료/대기에 도달하면,
  자동으로 `<vault>/Baton/Runs/<runId>.md`(요약 노트)와 `<vault>/Baton/Runs/<runId>/`
  (아티팩트 복사)를 생성/갱신하고 `<vault>/Baton/Runs.md`(인덱스)를 갱신.
- 볼트 미설정이면 run은 정상 동작하고 내보내기는 조용히 생략(1회 힌트 허용).
- 노트 frontmatter는 Dataview 쿼리 친화(runId/status/dryRun/workflow/createdAt/
  updatedAt/workers/roles/stepCount/outcome/tags).
- (선택) `baton journal sync`로 기존 모든 run을 백필.

## Constraints

- 쓰기는 볼트의 `Baton/` 하위에만. runId 경로 분리자 금지(sanitize). 볼트 밖 경로
  거부. 사용자 기존 노트 미수정/미삭제.
- 볼트 미설정 시 무해(no-op). 결정적 렌더(주입 Clock). 재내보내기 멱등.
- credential/세션 토큰 무접근, danger 금지(기존 안전 유지).
- 모든 FS는 주입/임시 디렉터리 테스트.

## Assumptions

### Safe

- 볼트는 로컬 디렉터리(마크다운 폴더). 경로는 `$BATON_OBSIDIAN_VAULT` 우선,
  없으면 `.baton` config 키(`obsidian.vault`).
- 자기완결: 아티팩트를 볼트로 복사하고 노트에서 `![[...]]`로 임베드.
- 인덱스는 Dataview 코드블록 + 정적 표(플러그인 미설치 폴백) 둘 다 포함.

### Risky

- **자동 트리거 위치**: 코어 엔진은 provider/도구-agnostic 유지를 위해 자동
  내보내기는 **CLI 레이어**에서 수행한다(start/resume/approve 후 공통 훅). 엔진에
  Obsidian 개념을 결합하지 않는다.
- **임베드 경로**: Obsidian wikilink는 볼트 상대 경로 기반 → 노트는
  `Baton/Runs/<runId>/analysis.md`를 `![[<runId>/analysis.md]]`류로 임베드. 파일명
  충돌은 runId 폴더로 격리.
- **백필 sync**: "자동만" 선택을 존중해 `journal sync`는 최초 설정/복구용 보조로만
  제공(매 run 수동 로깅 명령은 추가하지 않음).

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. 볼트 경로를 env(`$BATON_OBSIDIAN_VAULT`) 우선 + `.baton` config 폴백으로 둘지(기본).
2. 볼트 내 베이스 폴더명을 `Baton/`으로 둘지(기본).

## Risks

`risks.md` 참조. 핵심: 볼트 밖/사용자 노트 침범, 볼트 미설정 시 run 실패, 비결정적
렌더로 불안정, 아티팩트 복사 누수(민감 로그), 임베드 경로 깨짐, 멱등성 위반.

## Recommendation

코어에 순수성 높은 `ObsidianJournalExporter`(렌더+복사+인덱스, 주입 FS/Clock)를 두고,
자동 내보내기는 CLI 레이어 공통 훅에서 호출한다. 볼트 경로는 env/config로 해석하고
미설정 시 no-op. 쓰기는 볼트 `Baton/` 하위로 강제하고 runId를 sanitize한다.
frontmatter는 Dataview 친화로 설계하고 인덱스는 정적 표 폴백을 포함한다. 모든 FS는
임시 볼트로 테스트한다. 상세는 `design.md`.
