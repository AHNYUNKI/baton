# Risks — gui-project-cwd-v0.19.6

| 위험 | 영향 | 완화 |
|---|---|---|
| source 경로 미존재/비-git | baton 명령 오류 | 기존 에러 표시로 표면화(스코프 자체는 무해). |
| 글로벌 vs 스코프 client 혼선 | 잘못된 cwd | 프로젝트 범위 작업만 스코프, 글로벌 뷰는 기존 client 유지(명확 분리). |
| github 소스 | 실행 비대상 | workingDirectory nil(글로벌과 동일). 실행은 로컬 전용. |
| TS 회귀 | 코어 영향 | Swift 단독, `packages/*` 미수정(검증). |

## 비목표 (재확인)
TS/CLI 변경, github 클론, 프로젝트별 cwd 설정 UI, 글로벌 뷰 변경.

## 후속
- 이후: GUI에서 실제 AI 쓰기 실행 → 조직도 라이브 점등 수동 QA(테스트 목표).
- 순서 3: 예산 게이트, 스킬(v0.20).
