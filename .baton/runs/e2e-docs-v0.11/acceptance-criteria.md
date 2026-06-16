# Acceptance Criteria

v0.11 E2E 데모 & 문서가 완료되려면 아래가 모두 충족되어야 한다.

## E2E test (hermetic)

- [ ] AC-01 `packages/cli/test/e2e.test.ts`가 기본 워크플로우를 공개 `runCli`로 구동해
  start → 승인 게이트(approve) → `run approve` → resume → implement 게이트 → `run
  approve` → resume → test → review → finalize → **run.status completed**까지 완주한다.
- [ ] AC-02 E2E는 hermetic하다: 주입 mock ProcessRunner + 임시 cwd/`$BATON_HOME` +
  fixed clock. 실제 codex/claude/git/네트워크 호출이 없다.
- [ ] AC-03 완주 후 run 디렉터리에 `request.md`, `run.json`(completed),
  `test_result.md`, `final_summary.md`, `pr_description.md`가 존재한다.
- [ ] AC-04 `baton run list`/`run show <runId>`가 해당 run을 반영한다(상태/산출물).
- [ ] AC-05 (저널) `$BATON_OBSIDIAN_VAULT`=임시 볼트 설정 시, 완주 후
  `<vault>/Baton/Runs/<runId>.md`와 인덱스가 생성되고 `final_summary.md`가 볼트로
  복사된다(v0.5 자기완결).
- [ ] AC-06 (fix, 선택) test가 처음 실패하도록 mock을 구성하면 `--fix --codex`로
  bounded 재시도 후 통과/실패 경로가 E2E에서 관찰된다.

## Docs accuracy

- [ ] AC-07 `docs/USAGE.md`가 설치~init~config~run(게이트/승인)~status/list/show~
  journal~finalize 산출물까지 **실제 명령 시퀀스**로 런북을 제공한다.
- [ ] AC-08 `docs/ARCHITECTURE.md`가 역할→워커 매핑(codex/claude/test/finalize/stub),
  아티팩트 맵, 안전 모델(격리·승인·bounded fix·읽기전용 조회·볼트 Baton/ 한정·
  credential 무접근), 파이프라인 다이어그램을 기술한다.
- [ ] AC-09 문서의 명령/플래그가 실제 CLI 표면과 일치한다(부정확한 명령 없음). 가능하면
  핵심 명령 존재를 가벼운 테스트로 검증한다.
- [ ] AC-10 문서가 hermetic 한계를 정직히 구분한다: analysis.md/design.md/review.md는
  실제 `--claude`(claude CLI)에서 생성됨을 명시.
- [ ] AC-11 `README.md`가 `docs/USAGE.md`·`docs/ARCHITECTURE.md`를 링크한다.

## Safety & Compat

- [ ] AC-12 코드/테스트에 credential/세션 토큰 접근, `danger-full-access`가 없다.
- [ ] AC-13 기능 변경 없음(추가만), v0.1~v0.10 회귀 없음.
- [ ] AC-14 `pnpm typecheck && pnpm test && pnpm build` 통과, `node packages/cli/dist/
  main.js run --help` 스모크 정상.
