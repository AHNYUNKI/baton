# Request

## Run

- runId: `obsidian-journal-v0.5`
- stage: analysis & design (Claude Code)
- implementer: Codex
- builds on: `claude-adapter-v0.4` (PR #4)

## User Request

사용자는 **AI가 작업한 내역을 Obsidian에 자동으로 정리**해, 본인이 무엇을
작업했는지 추적하기 쉽고 기록용으로도 편하게 쓰고 싶다. Baton run의 작업 내역
(요청·분석·설계·구현·리뷰·상태·사용 워커)을 Obsidian 볼트에 노트로 남긴다.

### 사용자 확정 선택

- **트리거: 자동만** — run이 종료/대기 상태에 도달하면(볼트가 설정돼 있을 때)
  자동으로 볼트에 기록. 사용자가 매번 명령을 칠 필요 없음.
- **형태: 자기완결 + Dataview** — run별 요약 노트(frontmatter: runId/status/날짜/
  사용 워커/태그) + 아티팩트(analysis/design/review 등) 볼트 내 복사·임베드 +
  전체 인덱스(MOC) 노트. Dataview 쿼리로 추적 가능.

## Scope (v0.5)

- `ObsidianJournalExporter`(core): run + 아티팩트 → 볼트의 자기완결 노트/폴더로 렌더
- run별 요약 노트(frontmatter + Dataview 필드 + 아티팩트 임베드)
- 아티팩트를 볼트로 복사(자기완결)
- 전체 인덱스(MOC) 노트(Dataview 블록 + 정적 표 폴백)
- 볼트 경로 해석(`$BATON_OBSIDIAN_VAULT` env / `.baton` config), 미설정 시 no-op
- CLI run 흐름(start/resume/approve)에서 **자동 내보내기 훅**
- (선택) `baton journal sync`로 기존 run 백필
- 단위/통합/안전 테스트(실제 Obsidian 불필요, 임시 볼트 디렉터리로 검증)

## Out of Scope

- Obsidian 플러그인/URI 연동, 실시간 동기화, 양방향 편집 반영, 그래프 커스터마이즈
- 볼트 내 사용자 기존 노트 수정/삭제, SQLite, 네트워크 동기화

## Constraints

- 쓰기는 **볼트의 `Baton/` 하위에만** 한정(사용자 다른 노트 미접근/미삭제).
- 볼트 미설정 시 run 실패 금지 — 조용한 no-op(또는 1회 힌트).
- 결정적 렌더(주입 Clock), 재내보내기 멱등.
- credential/세션 토큰 무접근, `danger-full-access` 금지(기존 안전 유지).
- 런타임 의존성 추가 없음(zod/yaml). 과도한 추상화 금지.
