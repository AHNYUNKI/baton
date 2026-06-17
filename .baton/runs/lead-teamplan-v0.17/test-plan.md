# Test Plan

게이트: core **pnpm typecheck/test**, GUI **swift build/test**(로직) + 수동 QA(View).
플래너/클라이언트는 **주입형 mock 어댑터/runner**로 결정적. **실제 AI/네트워크 금지.**

## Core (TS) — Vitest

### schema (TeamPlan/Project)
- 유효 TeamPlan/TeamRole parse. 역할 id 중복/빈 이름/빈 roles → 실패.
- assignedAgentId ∈ agentIds 아닌 plan → 검증 실패.
- Project.teamPlan?/overview? additive — 있는/없는 프로젝트 모두 parse.

### planner.generateTeamPlan (mock adapter)
- mock이 깔끔한 JSON 반환 → TeamPlan 파싱/검증/반환.
- mock이 프로즈+```json 블록 반환 → 관대 추출로 성공.
- mock이 1회 깨진 출력 후 정상 → 재시도 1회로 성공(호출 2회).
- mock이 계속 실패 → 상한(기본 2) 소진 후 명확한 에러(호출 정확히 2회, throw).
- assignedAgentId가 agentIds 밖 → 클램프/거부(정의대로) 단언.

### ProjectService.setTeamPlan/getTeamPlan
- set: 유효 plan 저장 + getTeamPlan 라운드트립. 손상 plan → 거부.

### CLI project plan generate/show/set
- generate: mock 어댑터 → 저장 + 봉투 'team-plan'. lead 미가용 → 안내+비정상 종료.
- show --json: 저장 plan 봉투. set(stdin/--file): 검증 후 저장, 잘못된 JSON 거부.

## GUI (Swift) — swift test

### TeamPlanEditModel
- roles add/remove/edit(name/description/instructions), 담당AI 변경(agentIds 내).
- 검증: 빈 이름/중복 id/담당AI 밖 → invalid. 직렬화(JSON/argv) 정확.

### BatonClient
- generate/show/setTeamPlan argv 배열·봉투 디코드. 실패 표면화(크래시 없음).

## Build / Manual QA
- swift build: 편집 화면 컴파일.
- 수동 QA: 개요 입력→생성(대표)→역할 편집/담당AI 변경/추가·삭제→저장. lead 미설정 안내.

## Security / Isolation
- grep: credential/세션 토큰/danger/HTTP/네트워크 매치 0.
- argv 배열·stdin/파일(셸 평가 없음). 어댑터 공식 CLI만. 재시도 bounded.
- 루트 TS 게이트 회귀 0, apps/macos 격리.

## Out of Scope (테스트 비대상)
- 실제 AI 호출/네트워크, 실행/디스패치(v0.18), clone, 서버.

## Gates

```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
cd apps/macos/Baton && swift build && swift test
```
