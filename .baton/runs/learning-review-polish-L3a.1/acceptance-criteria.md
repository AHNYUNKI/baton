# Acceptance Criteria — learning-review-polish-L3a.1

## 순수 (swift test)
- [ ] AC-01 `displayExplanation(raw)`가 선두 `## 학습 설명` 헤딩 줄을 제거하고 본문을 트림 반환한다.
- [ ] AC-02 헤딩 없음 → 원문 트림. 빈/공백 → 빈 문자열. 선두 빈 줄/공백 처리.

## 가독성 (manual QA / swift build)
- [ ] AC-03 역할 카드 "왜" 패널이 **전체폭 좌측정렬**로 표시(우측 밀림 없음, DisclosureGroup 들여쓰기
  제거). 긴 텍스트 줄바꿈 정상.
- [ ] AC-04 패널에 `## 학습 설명` 헤딩이 노출되지 않는다(본문만). 접기/펼치기 동작 유지.

## 중복 제거 (manual QA / swift build)
- [ ] AC-05 게이트 섹션(체크포인트)에서 설명 **본문 재출력 없음** — 역할명 + 짧은 안내 + 계속/거부
  버튼만. (설명은 역할 카드 "왜" 패널에만.)
- [ ] AC-06 기존 게이트(승인/거부, diff accept/reject, 체크포인트 계속/거부)·화면 보존(회귀 없음).

## 안전 & 게이트
- [ ] (포함) `packages/*` 미수정(`git diff -- packages` 비어 있음, TS 회귀 0). `swift build`+`swift test`
  통과. 앱은 baton CLI만, credential 무접근. 한국어/paperclip.

## 수동 QA (문서)
- [ ] (QA) calc-demo 체크포인트 run → 앱 실행 탭: "왜" 패널 좌측 전체폭·헤딩 없음, 게이트에 설명
  중복 없음. 절차를 요약에 명시.
