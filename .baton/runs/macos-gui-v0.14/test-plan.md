# Test Plan

게이트: **`swift test`**(apps/macos/Baton, 로직 레이어) + **기존 TS 게이트 불변**
(`pnpm typecheck/test/build`). UI는 `swift build` 컴파일 + **수동 QA 체크리스트**.
실제 `baton` 호출은 주입형 `CommandRunner`로 mock(결정적, 외부 프로세스 없음).

## Swift Unit Tests (swift test)

### Contract models (Codable)
- v0.13 픽스처 디코드: run-list 봉투, run-detail 봉투, state 봉투, watch 이벤트(NDJSON
  한 줄). 필드 매핑 정확.
- schemaVersion 1 매칭. 불일치(예: 2) → 명확한 에러(throw), 크래시 없음.
- 누락 optional(updatedAt/outcome) 안전 디코드.

### BatonClient (주입형 CommandRunner)
- 읽기 argv 구성: `run list --json`, `run show <id> --json`, `state --json`.
- 쓰기 argv 구성: `run "<req>" [flags]`, `run approve <id>`, `--reject`, `run resume <id>`,
  `run clean <id>`. 모두 배열 인자(셸 결합 없음) 단언.
- mock 응답(봉투 JSON) → 모델 디코드 반환.
- 비정상 종료/빈 출력/`baton` 미발견 → 에러 처리(크래시 없음).

### watch NDJSON 파서
- 여러 줄(완전): 각 줄 이벤트로 분리·디코드.
- 부분 라인/버퍼 경계: 청크가 줄 중간에서 끊겨도 다음 청크와 합쳐 처리.
- 빈 줄/공백 무시.

### RunsStore 리듀서(순수)
- 초기 스냅샷 적용.
- run.created → 추가, run.removed → 제거, run.status-changed/updated → 갱신.
- 결정적 정렬(createdAt desc, runId asc) 유지.
- 알 수 없는/중복 이벤트 안전 처리.

## Build / Compile

- `swift build`(apps/macos/Baton): 앱+라이브러리+테스트 컴파일 성공(View 포함).

## Manual QA Checklist (문서화, 자동 아님)

- 앱 실행 → run 목록 표시, 선택 시 상세(steps/approvals/artifacts).
- 승인 게이트 run에서 Approve/Reject → `baton run approve` 호출, 목록/상세 갱신(watch).
- Resume/Clean 액션 동작.
- `baton` 미설정/미발견 시 안내 표시(크래시 없음).

## Monorepo Isolation

- `pnpm -w typecheck && pnpm -w test && pnpm -w build`가 apps/macos 추가와 무관하게
  통과(회귀 0). pnpm 워크스페이스에 apps 미포함 확인.

## Security Regression

- Process 호출이 배열 인자(셸 평가 없음). credential/세션 토큰/danger 문자열 부재.
- 앱이 `.baton` 파일을 직접 쓰지 않음(읽기 스냅샷/CLI 경유만).

## Out of Scope (테스트 비대상)

- SwiftUI 화면 자동 테스트(Xcode UI test), .app 패키징/서명, 실제 baton end-to-end
  자동화, 설정/새 run 폼/대시보드(후속 슬라이스).

## Gates

```bash
# Swift (apps/macos/Baton)
swift build
swift test
# TS monorepo (불변)
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```
