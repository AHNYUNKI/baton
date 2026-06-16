# Review — config-defaults-v0.10

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-config-defaults-v0.10`(branch `baton/config-defaults-v0.10`,
**base `origin/main`**) 직접 검증. **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, v0.9 fix 루프 PRESENT |
| 게이트 | ✅ typecheck 통과, **158/158 tests (28 files)**, v0.1~v0.9 회귀 없음(+13) |
| 3단 우선순위 | ✅ `flags.x ?? config.workers?.x ?? false` (플래그>config>기본) |
| 부정 플래그/충돌 | ✅ `--no-*` 지원, `setTriStateFlag`가 `--codex --no-codex` throw |
| config set 검증 | ✅ Zod safeParse 통과 후에만 write, 잘못된 값/키 거부 |
| 보안 | ✅ credential/세션 토큰/danger 0 |

## Independent Verification

- base 검증 통과(origin/main 후손, v0.9 attemptFix 존재).
- `corepack pnpm typecheck` 통과, `corepack pnpm test` → **158 passed**.
- `resolveRunOptions`: `useCodex = flags.useCodex ?? config.workers?.codex ?? false`
  (claude/test/fix 동일), `maxFixAttempts = flags ?? config ?? 1`, testCommand
  flag>config. 보너스 가드: `--test-command` without `--test` → 에러.
- `setTriStateFlag`: `current !== undefined && current !== next` → "Cannot combine
  X and Y" throw(충돌). 미지정→undefined(=config 사용).
- `config set`: `setAtPath` + `coerceConfigValue` 후 `BatonConfigSchema.safeParse(next)`
  → 실패 시 명확한 에러·미기록, 성공 시 `parsed.data`(정규화+머지 보존) write.
- `journal.ts`: 자체 파싱 제거, loadConfig 사용. vault env>config 유지.
- 테스트(실제 기능): "flags before config before defaults"(77), "negative flags
  override config"(399), "config worker defaults when flags omitted"(375),
  config list/get/set(162), 잘못된 값/키 거부(190), init idempotent(151),
  StubWorker 회귀(244), test.command config(355), journal no-op(1425).

## Acceptance Criteria

AC-01 ~ AC-16 충족 확인.

## Deviations / Notes (수용 가능)

1. `--test-command` without `--test` 에러 가드 추가(설계 외) — 사용자 실수 방지의
   합리적 강화. 승인.
2. config write는 단순 overwrite(원자성은 후속 TODO). 단일 사용자 가정상 수용.

## Follow-ups (비차단)

- SQLite, 전역(홈) config, config 원자적 쓰기/동시성, 대화형 설정 마법사.

## Reviewer Notes

- 커밋/푸시 없음 — 제약 준수.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**` 설계 아티팩트 미수정 확인.
