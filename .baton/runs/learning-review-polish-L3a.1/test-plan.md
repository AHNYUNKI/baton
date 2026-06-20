# Test Plan — learning-review-polish-L3a.1

게이트: **swift build/test** + **TS 회귀 0**(`git diff -- packages` 비어 있음). View 수동 QA.

## Swift Unit (swift test)
### displayExplanation
- "## 학습 설명\n- a\n- b" → 헤딩 제거된 "- a\n- b".
- 헤딩 없는 본문 → 원문 트림.
- 빈/공백 문자열 → 빈.
- 선두 빈 줄/공백 후 헤딩 → 헤딩 제거.

## Build / Manual QA
- swift build: "왜" 커스텀 접기 + 게이트 변경 포함 컴파일.
- 수동 QA(calc-demo 체크포인트 run):
  - "왜" 패널: 전체폭 좌측, 우측 밀림 없음, `## 학습 설명` 헤딩 미노출, 줄바꿈 정상, 접기/펼치기 동작.
  - 게이트 섹션: 설명 본문 중복 없음(역할명+안내+버튼만).
  - 기존 게이트(승인/diff/체크포인트 버튼)·기타 화면 정상(회귀 없음).

## Isolation / Security
- `git diff -- packages` 비어 있음(TS 미변경). 앱은 baton CLI만.

## Out of Scope
- 마크다운 풀 렌더, TS 변경, 스트리밍(L3b/c).

## Gates
```bash
cd apps/macos/Baton && swift build && swift test
git diff --stat -- packages   # 비어 있어야
```
