# UX Direction — Paperclip-inspired (Baton macOS)

참고: https://github.com/paperclipai/paperclip — "AI 에이전트 팀을 관리하는,
**태스크 매니저처럼 보이는** 오케스트레이션 앱". 사용자가 원하는 "저런 느낌".

## 핵심 번역 (Paperclip → Baton)

| Paperclip | Baton 적용 |
|---|---|
| AI 에이전트 "팀"(org chart, roles) | 역할 워커 = 팀: analyst/architect/implementer/tester/reviewer/fixer/release_writer |
| "looks like a task manager" 대시보드 | run 목록 = **태스크 카드 보드/리스트**, 상태 한눈에 |
| 목표 정의 → 팀 고용 → 승인 & 실행 → 모니터 | New Run(요청 + 워커 선택) → 승인 게이트 → 라이브 모니터 |
| Governance(승인/일시정지/종료) | 승인 게이트 approve/reject, resume, clean |
| Ticket(전 과정 추적/감사) | run 상세 = step 타임라인 + 아티팩트 + 이벤트 로그 |
| 비용/예산 | (Baton 비용 개념 없음 — 대신 step 진행/소요시간 표시. 비용은 비도입) |

> 주의: Paperclip의 "자율 기업/예산/멀티컴퍼니"는 Baton 범위 밖. **비주얼·UX 느낌만**
> 차용하고 도메인(로컬 개발 오케스트레이션)은 그대로 유지.

## 비주얼 언어 (배너 기반)

- **테마: 다크.** 배경 거의 블랙(`#141414`~`#1A1A1A`), 표면(카드) 약간 밝은 톤(`#1F1F1F`/`#242424`).
- **텍스트: 따뜻한 크림/아이보리**(순백 금지). 기본 `#F2EAD8`류, 보조 텍스트 뮤트 그레이(`#9A968C`).
- **타이포: 굵은 헤비 산세리프** 디스플레이(헤드라인 bold/heavy), 본문은 시스템 산세리프.
  넉넉한 행간·여백.
- **시그니처 모티프: 그라데이션 캡슐(둥근 알약/필).** 상태/역할 배지, 액센트 요소를
  rounded-capsule + 비비드 그라데이션으로. 미세 노이즈/그레인은 선택(과하지 않게).
- **액센트 팔레트(그라데이션):** 보라→핑크, 오렌지→옐로, 블루→틸, 그린, 레드 등 비비드.
  - 의미 매핑 권장: running=블루/틸, awaiting-approval=오렌지/앰버, completed=그린,
    failed=레드, cancelled/skipped=뮤트 그레이, planned=보라.
- **크롬 최소화:** 얇은 구분선, 큰 라운드 코너(카드 12–16pt), 호버/선택 시 부드러운 강조.
- **밀도: 여유롭게.** macOS 사이드바 + 디테일 2-패널 + 상단 얇은 타이틀바(좌측 Baton 워드마크).

## 화면 (이 슬라이스 + 향후)

1. **Dashboard / Runs (메인)** — 좌측 사이드바(필터: All/Running/Awaiting/Done) +
   본문 run **카드 리스트**. 카드: runId(또는 요청 요약), 상태 캡슐, 워크플로우,
   진행 step 미니 표시(예: 5/7), 생성시각. 상단에 **+ New Run** 버튼(액센트 그라데이션).
2. **Run Detail (티켓)** — step **타임라인**(각 step 상태 캡슐 + 역할 배지 + 타이밍/이유),
   approvals, 아티팩트 목록(analysis/design/test_result/review/final_summary/pr_description),
   액션 버튼(Approve/Reject/Resume/Clean) — 승인 게이트는 눈에 띄게(앰버 강조).
3. **New Run (시트)** — 큰 요청 입력 + 워커 "팀" 토글(Codex/Claude/Test/Fix를
   카드/캡슐 토글로), 고급(testCommand/maxFixAttempts/dry-run) 접기. **Start**(액센트).
4. **Settings (최소)** — baton 실행 파일 경로, (후속) 기본 워커.

## SwiftUI 구현 메모

- `BatonTheme`(색/타이포/간격/상태색 토큰) — 한 곳에서 정의(다크 고정). 토큰 값은
  단순 상수라 가벼운 단위 테스트 가능(상태→색 매핑 등). 시각 결과는 수동 QA.
- 재사용 컴포넌트: `StatusPill`(상태 캡슐), `RoleBadge`, `RunCard`, `GradientButton`,
  `StepRow`. View는 얇게(BatonKit 로직 의존).
- 다크 모드 고정(앱 `.preferredColorScheme(.dark)`). 시스템 폰트 heavy weight 활용.
- 접근성: 색만으로 상태 구분 금지 — 캡슐에 **텍스트 라벨** 병기.

## 한국어 용어 (UI 카피)

UI에 보이는 라벨/버튼/상태는 **한국어**로. 기술 식별자(`runId`, 워크플로우 id `default`,
아티팩트 파일명 `final_summary.md`/`analysis.md` 등, CLI 플래그 `--codex`)는 **영문 유지**.

| 개념 | UI 한국어 |
|---|---|
| Run | 실행 |
| New run | 새 실행 |
| Runs(목록/필터 헤더) | 실행 / 전체 실행 |
| Step | 단계 |
| Workflow | 워크플로우(또는 흐름) |
| Approval gate | 승인 게이트(또는 "승인 대기 지점") |
| Artifacts | 산출물 |
| Team / Roles | 팀(역할) |
| 액션 Approve/Reject/Resume/Clean | 승인 / 거부 / 재개 / 정리 |
| New Run 필드 Request | 요청 |
| 고급 옵션 dry-run | 계획만(미실행) |
| testCommand / maxFixAttempts | 테스트 명령 / 최대 수정 횟수 |
| Start | 시작 |
| Settings | 설정 |
| needs you | 확인 필요 |

### 상태(status) 한국어 매핑
- planned → 대기 · running → 실행 중 · awaiting-approval → 승인 대기 ·
  completed → 완료 · failed → 실패 · cancelled → 취소됨 · skipped → 건너뜀

### 역할(role) 한국어 라벨
- analyst → 분석 · architect → 설계 · implementer → 구현 · tester → 테스트 ·
  reviewer → 리뷰 · fixer → 수정 · release_writer → 릴리스
- (provider 브랜드명 Codex/Claude는 그대로. 화면엔 역할 라벨 우선, provider는 보조)

## 비목표

- Paperclip의 비용/예산/멀티컴퍼니/org-chart 편집, 모바일, 자율 24/7. 비주얼 느낌만 차용.
