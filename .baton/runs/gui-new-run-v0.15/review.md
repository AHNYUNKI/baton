# Review — gui-new-run-v0.15

Reviewer: Claude Code (Design + Review). worktree
`/Users/ahnyunki/app/baton-gui-new-run-v0.15`(branch `baton/gui-new-run-v0.15`,
base `origin/main`). **결론: APPROVE.** 코드 수정 없음.

## Verdict

| 항목 | 결과 |
|---|---|
| Base | ✅ origin/main 후손, `packages/*` 무수정 |
| Swift 게이트 | ✅ `swift build` 성공, `swift test` **36 passed** |
| TS 회귀 | ✅ **193 passed**, packages 무수정, `.build` 미추적 |
| 디자인 언어(다크/캡슐/한국어) | ✅ ux-direction.md 반영 |
| 안전 | ✅ `.baton` 직접 쓰기/HTTP/서버 없음, argv 배열, baton CLI 위임 |

## Independent Verification

- `swift build`/`swift test`(Xcode 26.5) 통과(36). `corepack pnpm test` → 193(회귀 0).
- **테스트 커버리지**(BatonKit, swift test):
  - `NewRunFormModelTests`: 기본 빈 옵션, 요청 trim 검증, buildOptions 전 매핑,
    maxFixAttempts 빈값→nil, 잘못된 값 Submit 차단 (AC-01~04).
  - `BatonClientTests`: startRun 전 워커 옵션 변형을 **배열 인자**로(AC-07), mutation
    배열 인자, watch argv, envelope kind 불일치 거부, 실패 명확한 에러.
  - `RunsStoreStartRunTests`: startRun→client 호출 후 refresh(load), 실패는 저장+
    rethrow(refresh 없음) (AC-05/06).
  - `StatusDisplayTests`: 상태/단계/승인/역할 → **한국어 라벨 + 색 tint** 매핑
    (실행 중/승인 대기/완료/취소됨/건너뜀, 분석/설계/구현/테스트/리뷰) (AC-17/21).
  - `BatonLocationTests`: preference 없음/공백/trim 해석 (AC-08).
- **디자인 시스템/리스타일**: `BatonTheme` + `.preferredColorScheme(.dark)`,
  컴포넌트 `StatusPill`/`GradientButton`/`RunCard`. RunsListView=RunCard 대시보드,
  RunDetailView=StatusPill 타임라인+승인. View 한국어 카피 다수(새 실행/승인/거부/재개/
  정리/요청/시작/설정/전체/실행 중/승인 대기/완료). 기술 식별자(final_summary.md 등) 영문 유지.
- **안전**: grep상 server/.baton 직접 쓰기/HTTP 없음. 앱은 `baton run`만 호출(승인/격리
  우회 없음). Process 배열 인자. credential 미취급.

## Acceptance Criteria

AC-01 ~ AC-22 충족(로직/디자인 매핑은 테스트, **시각 충실도(목업 대비)는 수동 QA** —
설계대로). 색만으로 상태 구분 안 함(텍스트 라벨 병기).

## Deviations / Notes (수용 가능)

1. run-list 요약 계약에 요청문/완료 단계 수가 없어 카드 진행 표시는 summary 기반 보수
   표시, 상세 티켓은 실제 step 배열 사용 — 합리적(계약 v0.13 범위 내).
2. 실제 화면 픽셀 충실도는 GUI 실행 수동 QA 필요(README/UX.md 체크리스트).

## Follow-ups (비차단)

- .app 패키징/서명, 전체 설정(config) 화면, 대시보드 통계, 라이브 watch UX 다듬기.

## Reviewer Notes

- 커밋/푸시 없음.
- `CLAUDE.md`, `AGENTS.md`, `.baton/runs/**`, `packages/*` 미수정 확인.
