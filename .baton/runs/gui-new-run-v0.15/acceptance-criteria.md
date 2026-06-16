# Acceptance Criteria

v0.15 GUI 새 run 생성 슬라이스가 완료되려면 아래가 모두 충족되어야 한다.

## NewRunFormModel (BatonKit, testable)

- [ ] AC-01 `NewRunFormModel`이 요청 텍스트 + 워커 옵션(dryRun, useCodex/useClaude/
  useTest, testCommand, fixEnabled, maxFixAttempts)을 보유한다.
- [ ] AC-02 `buildOptions()`가 폼 상태를 `StartRunOptions`로 정확히 매핑한다(미설정
  토글은 nil, 설정값은 반영).
- [ ] AC-03 `isValid`가 요청 trim 비어있지 않을 때만 true. 빈/공백 요청은 invalid.
- [ ] AC-04 maxFixAttempts 입력은 비었으면 nil, 값이면 정수(범위 밖은 폼에서 막거나
  CLI 거부에 위임 — 정의대로). 단위 테스트.

## RunsStore.startRun (orchestration)

- [ ] AC-05 `RunsStore.startRun(request:options:)`가 `client.startRun`을 호출하고,
  성공 시 `load()`/refresh로 목록을 즉시 갱신한다(주입형 client로 호출 순서 단언).
- [ ] AC-06 startRun 실패(에러)는 throw/상태로 표면화되어 UI가 안내할 수 있다(크래시
  없음).

## BatonClient argv (보강)

- [ ] AC-07 `startRun` argv가 모든 StartRunOptions를 정확히 반영한다(--codex/--no-codex,
  --claude, --test, --test-command <c>, --fix, --max-fix-attempts <n>, --dry-run,
  --workflow/--project). 배열 인자(셸 결합 없음). 단위 테스트로 고정.

## Baton executable path

- [ ] AC-08 `BatonLocation.resolve(preference:)`(순수)가 설정 경로가 있으면 그것을,
  없으면 기본 `baton`(PATH)을 반환한다. 단위 테스트.
- [ ] AC-09 해석된 경로가 `ProcessRunner(executable:)`/BatonClient에 주입되어 사용된다.
  미발견 시 기존 명확한 에러(크래시 없음).

## UI (thin, manual QA)

- [ ] AC-10 SwiftUI: "New Run" 진입 + `NewRunView`(요청 + 토글 + Start) + 최소
  Settings(baton 경로)가 컴파일되고 BatonKit(테스트된 로직)에만 의존한다.
- [ ] AC-11 빈 요청에서 Start가 비활성/거부된다(폼 검증 반영). 수동 QA 체크리스트
  문서화(새 run 생성 → 목록 반영, 경로 미발견 안내).

## Safety & monorepo isolation

- [ ] AC-12 앱은 `.baton`를 직접 변경하지 않고 `baton run`만 호출한다(승인 게이트/격리
  우회 없음). Process 배열 인자. credential/세션 토큰 미취급.
- [ ] AC-13 `packages/*`(TS) 미수정. 루트 `pnpm typecheck && test && build` 회귀 0(193).
- [ ] AC-14 `apps/macos/README.md`가 새 run 생성/경로 설정 + 수동 QA 체크리스트를 갱신한다.

## Design system & restyle (paperclip-inspired, 한국어)

`ux-direction.md` 기준.

- [ ] AC-17 `BatonTheme`(다크 색/타이포/간격) + 상태/역할 매핑 **순수 함수**
  (`StatusDisplay.koreanLabel(status)`, `tint(status)`, `RoleDisplay.koreanLabel(role)`)가
  BatonKit에 있고 **단위 테스트**된다(상태/역할 → 한국어 라벨·색 매핑).
- [ ] AC-18 재사용 컴포넌트 `StatusPill`/`RoleBadge`/`RunCard`/`GradientButton`(캡슐+
  그라데이션)이 구현되고 앱은 `.preferredColorScheme(.dark)` 고정.
- [ ] AC-19 `RunsListView`가 paperclip형 대시보드로 리스타일된다: 사이드바 필터
  (전체/실행 중/승인 대기/완료) + 팀(역할) 배지 + run 카드(요청 요약, 상태 캡슐,
  단계 진행 N/M, 워크플로우). 승인 대기 카드는 앰버 강조 + 인라인 승인/거부.
- [ ] AC-20 `RunDetailView`가 티켓형으로 리스타일된다: 단계 타임라인(상태 캡슐+역할+
  타이밍/이유), 승인, 산출물 목록(`final_summary.md` 등 파일명 영문 유지) + 액션.
- [ ] AC-21 UI 라벨/버튼/상태/필터가 **한국어**다(상태/역할/액션/필드: ux-direction
  용어집). 기술 식별자(`runId`/아티팩트 파일명/CLI 플래그)는 영문 유지. 색만으로 상태
  구분하지 않고 텍스트 라벨 병기.
- [ ] AC-22 `apps/macos/UX.md`(또는 README 섹션)에 디자인 언어(다크/크림/캡슐/한국어
  용어집)가 기록되어 향후 슬라이스가 따른다.

## Gates

- [ ] AC-15 `swift build` + `swift test`(apps/macos/Baton) 통과.
- [ ] AC-16 루트 TS 게이트 통과 + `node packages/cli/dist/main.js run --help` 스모크 정상.
