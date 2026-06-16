# Acceptance Criteria

v0.5 Obsidian 작업 기록 연동이 완료되려면 아래가 모두 충족되어야 한다.

## Schema

- [ ] AC-01 `JournalNoteMeta`(Zod)가 정의된다: runId, status, dryRun, workflow,
  createdAt, updatedAt?, outcome?, roles, workers(역할→워커 종류), stepCount,
  tags(string[]). 유효/무효 입력 테스트.

## Vault resolution

- [ ] AC-02 `resolveObsidianVault({env, config})`가 `$BATON_OBSIDIAN_VAULT` 우선,
  없으면 `.baton` config(`obsidian.vault`)로 경로를 해석한다.
- [ ] AC-03 미설정 시 `undefined`를 반환하고, 호출부는 내보내기를 no-op 한다.

## Exporter — run note (self-contained)

- [ ] AC-04 `exportRun(run, {vaultPath, runDirectory, clock})`가
  `<vault>/Baton/Runs/<runId>.md` 요약 노트를 쓴다.
- [ ] AC-05 노트는 YAML frontmatter(JournalNoteMeta)와 사람 친화 요약(요청, step
  상태 표, 사용 워커, outcome)을 포함한다.
- [ ] AC-06 run 디렉터리의 아티팩트를 `<vault>/Baton/Runs/<runId>/`로 **복사**하고,
  노트에서 핵심 아티팩트(analysis/design/review 존재 시)를 `![[...]]`로 임베드한다.
- [ ] AC-07 모든 쓰기 경로가 `<vault>/Baton/` 하위로 강제되고, runId는 경로 분리자/
  `..`가 제거(sanitize)된다. 볼트 밖 쓰기/사용자 노트 삭제가 없다.
- [ ] AC-08 재내보내기가 멱등이다(동일 run+fixed clock → 동일 출력, 중복 누적 없음).

## Exporter — index (MOC)

- [ ] AC-09 `updateIndex(runs, {vaultPath})`가 `<vault>/Baton/Runs.md`를 생성/갱신하며
  Dataview 코드블록과 정적 마크다운 표(폴백)를 모두 포함한다.
- [ ] AC-10 인덱스는 run을 createdAt 내림차순으로 안정 정렬하고 각 run 노트로
  wikilink 한다.

## CLI auto-export (자동만)

- [ ] AC-11 `baton run …`(및 resume/approve)이 종료/대기 상태에 도달하면, 볼트가
  설정된 경우 **자동으로** run 노트/아티팩트/인덱스를 내보낸다(별도 플래그 불필요).
- [ ] AC-12 볼트 미설정 시 run은 정상 종료되고 내보내기는 생략된다(실패하지 않음).
- [ ] AC-13 (선택) `baton journal sync`가 기존 모든 run을 백필 내보내기 한다.
- [ ] AC-14 내보내기 실패(예: 볼트 쓰기 불가)가 run 결과/종료 코드를 망치지 않는다
  (경고만, run 상태는 보존).

## Safety & Compat

- [ ] AC-15 코드/테스트에 credential/세션 토큰 경로 접근, `danger-full-access`,
  볼트 밖 쓰기 경로가 없다(보안/경로 회귀 테스트).
- [ ] AC-16 결정적 렌더(주입 Clock), 모든 FS 테스트는 임시 볼트 디렉터리 사용.
- [ ] AC-17 `.gitignore` allow-list에 `obsidian-journal-v0.5`가 포함된다.
- [ ] AC-18 `pnpm typecheck && pnpm test && pnpm build` 통과, v0.1~v0.4 회귀 없음,
  `node packages/cli/dist/main.js run --help` 스모크 정상.
