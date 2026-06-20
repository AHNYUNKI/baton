# Analysis

## User Request
L3a 학습 검토 뷰의 ① 설명 패널 가독성(우측 밀림 + 헤딩 노출) ② 설명 중복(역할 카드+게이트) 수정.

## Current Repository Understanding
- `Sources/BatonApp/ExecutionView.swift`:
  - `TeamRunRoleRow`(~637–653줄): explanation을 `DisclosureGroup(isExpanded:)`로 표시. label "왜",
    content `Text(explanation)`. **DisclosureGroup이 content를 들여쓰기**(macOS 기본) → 우측 밀림.
    explanation 원문에 `## 학습 설명` 헤딩 포함 → 그대로 노출.
  - 게이트 섹션 `canContinueCheckpoint`(~231–254줄): 체크포인트 역할 name + **explanation 재출력**
    (239–244줄) → 역할 카드(강조됨)와 중복.
  - `nonEmpty`/`trimmedExplanation` 헬퍼 존재.
- `displayExplanation`류 순수 함수 없음(추가).
- L1 extractExplanation은 헤딩 포함 섹션을 저장(`## 학습 설명\n- …`). 표시 시 헤딩 제거 필요.

## Relevant Files
| File | Reason |
|---|---|
| `Sources/BatonKit/Org/TeamRunStatus.swift` 또는 신규 | `displayExplanation`(순수) |
| `Sources/BatonApp/ExecutionView.swift` | "왜" 패널 커스텀 접기 + 게이트 중복 제거 |
| `Tests/BatonKitTests/*` | displayExplanation 테스트 |

## Existing Behavior
설명 패널 우측 밀림 + 헤딩 노출, 같은 설명 역할 카드·게이트에 중복.

## Target Behavior
- 역할 카드 "왜" 패널: 전체폭 좌측정렬, `## 학습 설명` 헤딩 제거된 본문, 접기/펼치기 유지(들여쓰기 없이).
- 게이트 섹션: 체크포인트 역할명 + "위에서 강조된 역할의 설명을 확인한 뒤 계속하세요" 안내 + 계속/거부
  버튼. **설명 본문 재출력 없음**.

## Constraints
- Swift 단독, `packages/*` 무변경(TS 회귀 0). 앱은 baton CLI만. 기존 기능/안전 불변.
- `displayExplanation` 순수(BatonKit) 테스트, View 수동 QA. Swift 6. 한국어/paperclip.

## Assumptions
- 헤딩은 정확히 `## 학습 설명`(L1/Stub 규약). 다른 형식이면 원문 트림만(graceful).
- 마크다운 풀 렌더(헤딩/리스트)는 비범위 — 헤딩만 제거하고 "- " 불릿은 그대로(가독 충분).

## Risks
- DisclosureGroup 교체 시 펼침 상태/토글 동작 유지 필요 → @State Bool + Button 토글로 대체.
- 텍스트 줄바꿈/폭 → `.fixedSize(horizontal:false, vertical:true)` 또는 `frame(maxWidth:.infinity,
  alignment:.leading)`로 좌측 전체폭.

## Recommendation
순수 `displayExplanation`(헤딩 제거) + ExecutionView "왜" 패널 커스텀 접기(좌측 전체폭) + 게이트
설명 중복 제거. Swift 단독, packages 무변경. 게이트 swift build/test + `git diff -- packages` 비어 있음.
