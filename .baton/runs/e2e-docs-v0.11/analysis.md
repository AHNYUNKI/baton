# Analysis

## User Request

완성된 Baton을 (1) hermetic E2E 테스트로 전 파이프라인 동작을 증명하고, (2) 사용자가
따라할 런북·아키텍처 문서로 사용 가능하게 만든다.

## Intent

10개 마일스톤은 각 컴포넌트를 개별 테스트로 검증했지만, "전체가 공개 CLI를 통해
end-to-end로 묶여 완주하는가"를 보장하는 단일 테스트가 없다. 또 사용자가 무엇을
어떻게 실행하는지 문서가 없다(README는 부분적). 가치의 핵심은 **통합 회귀 방지(E2E)
+ 진입 장벽 제거(docs)** 다. 새 기능이 아니라 검증·문서화 레이어.

## Current Repository Understanding (v0.10 / main 8f775f6 기준)

- CLI 표면(`main.ts`): init, project add|list, config list|get|set, agent list,
  workflow list, run <request> [flags], run list|show|status|resume|approve|clean,
  journal sync, codex doctor, claude doctor.
- `run` 플래그: `--dry-run`, `--codex|--no-codex`, `--claude|--no-claude`,
  `--test|--no-test`, `--test-command <cmd>`, `--fix|--no-fix`, `--max-fix-attempts <n>`.
- 기본 워크플로우(`examples/workflows/default.workflow.yaml`): analyze, design,
  **approve**, implement, test, review, finalize.
- 게이트: `isGate = type==='approve' || policy.requiresApproval(type)`, 기본 정책
  `['implement','fix']` → run은 **approve step**과 **implement step** 두 곳에서 멈춘다.
- `runCli(argv, { cwd, env, runner, clock, stdout, stderr })` — 주입 가능(테스트 친화).
  기존 cli.test.ts가 이 패턴으로 통합 테스트.
- 결정적 산출물: request.md, run.json, test_result.md(TestRunner), final_summary.md/
  pr_description.md(FinalizeWriter). analysis.md/design.md/review.md는 ClaudeCodeAdapter
  (실제 claude 필요) → hermetic E2E에선 stub이라 생성 안 됨.
- `docs/` 디렉터리 없음.

## Relevant Files

| File | Reason |
|---|---|
| `packages/cli/test/e2e.test.ts`(신규) | 전 파이프라인 hermetic E2E |
| `docs/USAGE.md`(신규) | 사용 런북 |
| `docs/ARCHITECTURE.md`(신규) | 역할/아티팩트/안전 모델 |
| `README.md` | docs 링크 |
| `examples/`(선택) | 데모 config |

## Existing Behavior

개별 컴포넌트는 158개 테스트로 검증. 전체 흐름을 한 번에 구동하는 canonical E2E와
사용자 문서는 없음.

## Target Behavior

- E2E 테스트: 임시 cwd + mock runner + (필요 시) config로 `baton run` 시작 → 승인
  게이트(approve/implement)에서 멈춤을 확인하고 `run approve`로 진행 → test(mock exit 0)
  → review(stub) → finalize → **completed**. run.json/test_result.md/final_summary.md/
  pr_description.md 생성, `run list`/`show`에 반영, 임시 볼트로 저널 export 확인.
- docs/USAGE.md: 실제 명령 시퀀스로 같은 흐름을 사람이 따라하도록.
- docs/ARCHITECTURE.md: 역할→워커(codex/claude/test/finalize/stub), 아티팩트 맵,
  안전 모델(격리·승인·bounded fix·읽기전용 조회·볼트 Baton/ 한정), 파이프라인 다이어그램.

## Constraints

- E2E hermetic: 실제 codex/claude/git/네트워크 금지. mock runner + 임시 디렉터리 +
  fixed clock. 결정적.
- 문서는 CLI 표면과 정확히 일치(명령/플래그). 검증: 문서의 명령이 실제로 존재.
- 회귀 0. credential/세션 토큰 무접근. base = origin/main.

## Assumptions

### Safe

- E2E는 stub 워커(analysis/design/implement/review) + TestRunner(mock runner) +
  FinalizeWriter(결정적)로 구성 → 완주 + 결정적 산출물.
- 두 게이트(approve, implement)를 각각 approve로 통과.
- 문서는 마크다운 정적 파일(docs/).

### Risky

- **게이트 수**: 기본 정책상 approve+implement 두 게이트 → E2E는 approve를 두 번
  호출해야 한다. 문서·테스트가 이 흐름을 정확히 반영해야 함(혼동 주의).
- **hermetic 한계**: analysis.md/design.md/review.md는 실제 claude 필요 → E2E에선
  생성 안 됨. E2E는 "stub 경로의 결정적 산출물 + 완주"를 단언하고, 문서가 "실제
  --codex --claude 시 추가 산출물"을 설명한다(정직하게 구분).
- **문서 드리프트**: 문서 명령이 실제 CLI와 어긋날 위험 → 가능하면 사용법 문자열을
  단일 출처로 참조하거나, 문서 명령 존재를 검증하는 가벼운 테스트.

## Open Questions

(기본값으로 진행, 다르면 알려주세요.)

1. E2E를 stub 기반 hermetic으로 둘지(기본 — CI 안전). 실제 codex/claude는 문서로만.
2. 문서를 `docs/USAGE.md` + `docs/ARCHITECTURE.md`로 분리(기본) vs README 통합.

## Risks

`risks.md` 참조. 핵심: 게이트 흐름 오해, hermetic 한계 오인, 문서 드리프트, E2E
취약성(비결정), 회귀.

## Recommendation

기본 워크플로우를 공개 CLI로 완주시키는 hermetic E2E 테스트(주입 mock runner + 임시
디렉터리 + fixed clock)를 추가해 통합 회귀를 막고, `docs/USAGE.md`(런북)와
`docs/ARCHITECTURE.md`(역할/아티팩트/안전)를 실제 CLI 표면에 맞춰 작성한다. E2E는
stub 경로의 결정적 산출물·완주·저널·이력을 단언하고, 실제 워커 차이는 문서가 정직히
설명한다. 상세는 `design.md`.
