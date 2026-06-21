# Risks — learning-stream-client-L3c1

| 위험 | 영향 | 완화 |
|---|---|---|
| 부분 라인 디코드 오류 | 이벤트 유실/깨짐 | 버퍼링(완전한 줄만 디코드), NDJSONParser 패턴 재사용. 부분 라인 테스트. |
| 알 수 없는 이벤트/kind | 크래시 | 관대 skip(파서·리듀서). 추가 필드 무시. |
| Swift 6 concurrency | 컴파일/런타임 경고 | 값 타입 아이템, watch와 동일 continuation/Task/@Sendable 패턴. |
| 스트림 에러/종료 | 행/누수 | mapRunnerError + onTermination(Task cancel) 재사용. |
| TS 회귀 | 코어 영향 | Swift 단독, packages 무변경 검증. |

## 비목표
ExecutionView 라이브 페인 + 출력 영역 재정리(L3c-2), TS 변경, claude stream-json usage.

## 후속
- **L3c-2**: ExecutionView 라이브 터미널 페인(스트림 소비) + 역할 출력 영역 재정리(summary/stub 노이즈
  + 라이브 + "왜" 설명 일관 배치, 보류 메모).
