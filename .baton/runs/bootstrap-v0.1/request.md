# Request

## Run

- runId: `bootstrap-v0.1`
- stage: analysis & design (Claude Code)
- implementer: Codex

## User Request

Baton v0.1 MVP를 부트스트랩한다. Baton은 여러 AI에게 역할을 부여해 개발 요청을
분석 → 설계 → 구현 → 테스트 → 리뷰 흐름으로 처리하는 **로컬 우선 AI 개발
오케스트레이터**다. 초기 버전은 macOS 앱이 아니라 **CLI**로 시작한다.

### Target Flow

1. 사용자가 CLI에 개발 요청을 입력한다.
2. Baton이 run을 생성한다.
3. Baton이 분석/설계/구현/테스트/리뷰 workflow step을 관리한다.
4. Claude Code = 분석/설계 worker.
5. Codex = 구현 worker.
6. 모든 중간 산출물은 `.baton/runs/<runId>/`에 저장한다.
7. 구현은 git worktree에서 격리한다.
8. 테스트 결과, 로그, 최종 요약을 artifact로 남긴다.

### v0.1 Implementation Scope

- TypeScript 기반 pnpm monorepo 생성
- `packages/core`, `packages/cli`, `packages/schemas` 구조
- strict TypeScript 설정
- Zod 기반 schema 정의
- CLI 기본 명령 구현
- `.baton` 프로젝트 초기화
- agent/workflow YAML 로딩
- artifact directory 생성
- SQLite 초기화 골격
- event logger 골격
- git worktree manager interface
- CodexExecAdapter interface와 skeleton
- 테스트 골격

### Target CLI Commands

```bash
baton init
baton project add <path>
baton project list
baton agent list
baton workflow list
baton run <request> --dry-run
baton codex doctor
```

### Constraints

- macOS SwiftUI 앱 / Local API server는 만들지 않는다.
- 실제 Codex 호출은 skeleton만, 자동화 테스트에서는 mock.
- `~/.codex/auth.json` 읽기 / Codex credential 접근 금지.
- `danger-full-access` 기본값 금지.
- main branch 직접 수정 구조 금지.
- push / deploy / package install 기능은 구현하지 않는다.
- 과도한 추상화 금지, 작은 MVP 구조.
