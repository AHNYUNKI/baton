# Request

## Run

- runId: `e2e-docs-v0.11`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `config-defaults-v0.10` (PR #10, merged → main `8f775f6`)

## User Request

10개 마일스톤으로 파이프라인·기록·조회·config가 완성됐다. 이제 (1) **전체 흐름이
실제로 묶여 동작함을 증명**하는 end-to-end 검증과 (2) 사용자가 따라할 수 있는
**사용 문서**를 만든다. 실제 codex/claude CLI 없이도 hermetic하게 전 파이프라인을
구동하는 canonical E2E 테스트 + 런북 문서.

## Scope (v0.11)

- `packages/cli/test/e2e.test.ts`(신규): 기본 워크플로우를 CLI(runCli)로 start →
  승인 게이트 → approve → resume → … → completed까지 hermetic하게 구동하고,
  산출물(request.md/run.json/test_result.md/final_summary.md/pr_description.md)·
  Obsidian 저널(임시 볼트)·`run list`/`run show`를 단언
- `docs/USAGE.md`(신규): 설치~init~config~run(게이트/승인)~status/list/show~journal~
  finalize 산출물까지 실제 명령 시퀀스 런북
- `docs/ARCHITECTURE.md`(신규): 역할→워커 매핑, 아티팩트 맵, 안전 모델, 파이프라인
  텍스트 다이어그램
- README에서 docs 링크
- (선택) `examples/`에 데모 config 샘플

## Out of Scope

- CI에서 실제 codex/claude/git 실행, 호스팅 문서 사이트, GIF/영상, 새 런타임 기능

## Constraints

- E2E는 **hermetic**: 주입 mock ProcessRunner + 임시 디렉터리, 실제 외부 CLI/네트워크
  없음. 결정적(fixed clock).
- 문서는 **실제 CLI 표면과 일치**(명령/플래그). 부정확한 명령 금지.
- 기존 동작 회귀 없음. credential/세션 토큰 무접근.
- 런타임 의존성 추가 없음. base = `origin/main`(v0.1~v0.10).
