# Test Plan

러너: Vitest. 모든 FS는 임시 run 디렉터리로 격리, 결정적(고정 입력). **실제 워커/
git/네트워크 불필요.**

## Unit Tests

### FinalizeWriter
- run.json + 아티팩트(request/analysis/design/test_result/review)가 있는 run 디렉터리 →
  `final_summary.md` 생성: 요청/워크플로우/step 표/테스트 요약/아티팩트 목록/outcome 포함.
- `pr_description.md` 생성: 제목(요청 1줄 정규화)/요약/step 개요/테스트 상태/포인터.
- 두 파일 경로가 result.artifacts에 포함, run 디렉터리에 존재.
- 누락 아티팩트(analysis 등 부재) → 있는 것만 반영, 부재 "(none)"류 표기, 실패 없음.
- 멱등: 동일 입력 2회 → 동일 파일 내용.
- run.json 없음/손상 → success:false + 메시지(throw 없음).
- 출력 경로가 run 디렉터리 하위로 강제(밖 경로 시도 차단), 삭제 호출 없음.
- 제목 정규화: 개행 제거, 길이 제한.

### registry
- `createWorkerRegistry({})` → release_writer = FinalizeWriter(Stub 아님).
- `{codex:true}`/`{claude:true}`/`{test:true,testCommand}`/조합 → release_writer 여전히
  FinalizeWriter, 다른 역할 매핑 불변.

## CLI / Integration Tests

- `baton run "<req>"`(mock 워커로 성공 완주) → run 디렉터리에 final_summary.md/
  pr_description.md 생성 단언, FinalizeWriter cwd === worktreePath.
- (해당 시) Obsidian 저널 export가 생성된 final_summary.md를 볼트로 복사(자기완결,
  v0.5 동작) — 회귀 확인.
- release_writer Stub 가정 테스트가 있으면 FinalizeWriter로 갱신.

## Security / Path Regression

- grep: credential/세션 토큰/`danger-full-access` 매치 0.
- FinalizeWriter가 run 디렉터리 밖으로 쓰지 않음, 삭제 연산 없음(단언).

## Out of Scope (테스트 비대상)

- LLM 산문 생성, git diff, 실제 PR/gh, 실패 경로 finalize, SQLite, 네트워크.

## Gates

```bash
corepack pnpm typecheck
corepack pnpm test          # v0.1~v0.7 + v0.8, 회귀 없음
corepack pnpm build
node packages/cli/dist/main.js run --help
```
