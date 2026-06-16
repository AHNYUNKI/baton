# Test Plan

러너: Vitest. 모든 FS는 OS 임시 디렉터리(임시 볼트/`$BATON_HOME`)로 격리,
Clock은 fixedClock 주입(결정적). **실제 Obsidian/네트워크 불필요.**

## Unit Tests

### schema (JournalNoteMeta)
- 유효 메타 parse, 무효(필수 누락/잘못된 status) safeParse 실패.

### resolveObsidianVault
- `$BATON_OBSIDIAN_VAULT` 설정 시 해당 경로.
- env 없고 config(`obsidian.vault`) 있으면 config 경로.
- 둘 다 없으면 undefined.
- 공백/유니코드 포함 경로 처리.

### ObsidianJournalExporter.exportRun
- `<vault>/Baton/Runs/<runId>.md` 생성, frontmatter(JournalNoteMeta) 포함.
- 요약 본문: 요청, step 상태 표, 사용 워커(역할→codex/claude/stub), outcome.
- run 디렉터리 아티팩트가 `<vault>/Baton/Runs/<runId>/`로 복사됨.
- analysis/design/review 존재 시 `![[<runId>/analysis.md]]` 임베드, 없으면 생략.
- **경로 강제**: 모든 출력 경로가 `<vault>/Baton/` 하위. runId에 `../`/구분자가 있으면
  sanitize되어 볼트 밖으로 새지 않음(악의적 runId 테스트).
- 멱등: 동일 run+fixed clock 2회 → 동일 파일 내용, 중복 폴더/항목 없음.

### ObsidianJournalExporter.updateIndex
- `<vault>/Baton/Runs.md`에 Dataview 코드블록 + 정적 표 동시 포함.
- run을 createdAt 내림차순 안정 정렬, 각 run 노트로 wikilink.
- 재생성(append 아님) 멱등.

## CLI / Integration Tests

- 볼트 설정(`env.BATON_OBSIDIAN_VAULT`=임시) + `run "<req>"`(mock 워커) 종료 →
  자동으로 노트/아티팩트/인덱스 생성 단언.
- resume/approve 후에도 자동 내보내기 갱신.
- 볼트 미설정 → run 정상 종료(exit 0/정상 outcome), 볼트 미생성, 내보내기 생략.
- 내보내기 실패 모의(볼트 경로가 파일 등 쓰기 불가) → run 결과/종료 코드 불변,
  경고만(AC-14).
- (선택) `baton journal sync` → 기존 run 다수 백필, 인덱스에 전부 표시.

## Security / Path Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0(기존 유지).
- exporter가 볼트 밖 경로로 쓰지 않음, 삭제 연산 없음(코드/테스트 단언).
- `.gitignore`에 `!.baton/runs/obsidian-journal-v0.5/` 포함 확인.

## Out of Scope (테스트 비대상)

- 실제 Obsidian 앱/플러그인, Dataview 실제 렌더, 네트워크, SQLite.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.4 + v0.5, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
