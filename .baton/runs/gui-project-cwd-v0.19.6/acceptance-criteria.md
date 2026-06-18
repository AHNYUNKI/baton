# Acceptance Criteria — gui-project-cwd-v0.19.6

## 순수 (swift test)
- [ ] AC-01 `localWorkingDirectory(for:)`가 local 소스 → `URL(fileURLWithPath: source.value)` 반환.
- [ ] AC-02 github 소스/빈·공백 경로 → nil.

## 배선 (manual QA / swift build)
- [ ] AC-03 ProjectDetailView가 local 프로젝트 진입 시 `workingDirectory = source.value`로 스코프된
  `BatonClient`를 구성한다.
- [ ] AC-04 ExecutionView/ProjectPlanView 및 plan generate/run·team-run·watch가 그 스코프 client를
  사용한다(프로젝트 저장소에서 실행/조회).
- [ ] AC-05 글로벌 뷰(대시보드/프로젝트 목록/실행 목록)는 기존 글로벌 client·동작 유지(회귀 없음).

## 안전 & 게이트
- [ ] AC-06 `packages/*` 미수정(`git diff -- packages` 비어 있음, TS 회귀 0). `swift build` +
  `swift test` 통과. 앱은 `baton` CLI만, credential 무접근. README/UX 갱신.

## 수동 QA (문서)
- [ ] (QA) 앱에서 calc-demo(로컬) 선택 → 실행 탭에 CLI로 만든 team-run이 보이고, 조직도가 역할
  상태로 점등 → 절차를 요약에 명시.
