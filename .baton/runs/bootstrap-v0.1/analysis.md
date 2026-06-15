# Analysis

## User Request

빈 레포(CLAUDE.md, AGENTS.md만 존재) 위에 Baton v0.1 MVP를 부트스트랩한다.
결과물은 `packages/core`, `packages/cli`, `packages/schemas` 로 구성된 strict
TypeScript pnpm monorepo이며, 7개의 CLI 명령과 그 골격(스키마, 아티팩트 저장,
SQLite/이벤트/worktree/Codex 어댑터 skeleton)을 포함한다.

## Intent

사용자는 "동작하는 제품 기능"보다 **확장 가능한 구조와 안전한 경계(seam)**를
먼저 확보하려 한다. 즉 이번 작업의 가치는:

- 역할 기반 워커(Claude=분석/설계, Codex=구현)를 조율할 수 있는 **뼈대**
- run 단위로 산출물을 `.baton/runs/<runId>/`에 남기는 **아티팩트 규약**
- 실제 외부 호출(Codex, git, sqlite)을 **인터페이스 + mock 가능한 seam**으로
  격리해 테스트 가능하게 만드는 것

기능 완성도가 아니라 *경계의 정확함*이 성공 기준이다.

## Current Repository Understanding

- 레포 루트: `/Users/ahnyunki/app/baton`
- 존재 파일: `CLAUDE.md`(분석/설계 지침), `AGENTS.md`(Codex 구현 지침)
- 소스 코드 / 패키지 매니페스트 / lockfile 없음 → **그린필드**
- AGENTS.md가 타깃 아키텍처, 도메인 개념, 코딩 표준, 보안/Git/테스트 규칙을
  이미 상세히 규정 → 설계는 이 문서와 충돌하지 않아야 한다.

## Relevant Files

| File | Reason |
|---|---|
| `CLAUDE.md` | 분석/설계 역할 경계 및 산출물 포맷의 출처 |
| `AGENTS.md` | Codex 구현 규칙, 타깃 디렉터리 구조, 어댑터 인터페이스 형태의 출처 |
| `package.json`(신규) | pnpm 워크스페이스 루트 |
| `pnpm-workspace.yaml`(신규) | 패키지 글롭 정의 |
| `tsconfig.base.json`(신규) | strict/ESM 공통 컴파일러 옵션 |
| `packages/schemas/src/*`(신규) | Zod 스키마 — 영속/외부 데이터 형태의 단일 출처 |
| `packages/core/src/*`(신규) | 비즈니스 로직, 어댑터, 서비스 |
| `packages/cli/src/*`(신규) | 얇은 CLI 디스패처와 명령 |
| `examples/agents/*.yaml`, `examples/workflows/*.yaml`(신규) | agent/workflow 로딩 대상 |

## Existing Behavior

없음. 빈 레포이므로 현재 동작은 "아무 것도 없음"이다. 기존 컨벤션 제약이 없어
설계 자유도가 높지만, 동시에 AGENTS.md가 사실상의 컨벤션 출처가 된다.

## Target Behavior

설치/빌드 후 다음이 동작한다:

- `baton init` → cwd에 `.baton/` 워크스페이스(config, runs/) 생성, idempotent.
- `baton project add <path>` / `project list` → Baton 홈 레지스트리에 프로젝트
  등록/조회.
- `baton agent list` / `workflow list` → 번들 예제 + 로컬 YAML 로딩 후 목록 출력.
- `baton run <request> --dry-run` → runId 생성, `.baton/runs/<runId>/`에
  `request.md` + `run.json`(status: planned) 기록, 계획된 워크플로우 step 출력.
  **워커 실행/worktree 생성/Codex 호출은 하지 않는다.**
- `baton codex doctor` → `codex` CLI 가용성/버전 점검 결과 출력
  (auth 파일은 절대 읽지 않음).

SQLite, EventLogger, WorktreeManager, CodexExecAdapter는 **인터페이스 + skeleton**
으로 존재하며, 실제 부수효과는 주입 가능한 포트(ProcessRunner, Clock 등) 뒤에 둔다.

## Constraints

- **기술**: TypeScript strict, ESM(NodeNext), Zod, Vitest. 네이티브 의존성 회피.
- **아키텍처**: CLI는 얇게(파싱/출력만), 로직은 core. 공유 타입은 schemas.
  provider 로직은 어댑터 뒤로. core는 Codex 전용 동작에 직접 결합 금지.
- **안전(MUST NOT)**: `~/.codex/auth.json` 접근 금지, credential 복사 금지,
  `danger-full-access` 기본값 금지, main 직접 수정 금지, push/deploy/패키지 설치
  기능 미구현, 자동화 테스트에서 실제 Codex 로그인 의존 금지.
- **제품**: SwiftUI 앱 / 로컬 API 서버 미구현. 과도한 추상화 금지.

## Assumptions

### Safe Assumptions

- pnpm + TypeScript + Vitest 사용 가능(개발 환경 가정).
- ESM + NodeNext 모듈 해상도 → 상대 임포트는 `.js` 확장자 표기.
- 패키지명은 `@baton/schemas`, `@baton/core`, `@baton/cli`, CLI bin은 `baton`.
- 모노레포 내부 의존은 `workspace:*` 프로토콜로 연결.

### Risky Assumptions

- **SQLite 드라이버**: better-sqlite3(네이티브)는 빌드/CI 마찰과 테스트 오염
  위험이 있다 → v0.1은 **드라이버를 실제로 연결하지 않고** `DbClient` 인터페이스
  + DDL 상수 + 스킬레톤 `openDatabase()`로만 구현한다("초기화 골격" 문구와 일치).
- **프로젝트 레지스트리 위치**: 전역 상태를 피하라는 지침과 다중 프로젝트 관리
  요구가 충돌한다 → 절충으로 Baton 홈(`$BATON_HOME` 또는 `~/.baton/`)의
  `projects.json` 파일에 둔다(검사 쉽고, SQLite 골격에 비차단적).
- **CLI 파서**: 외부 파서(commander 등) 대신 7개 명령용 **소형 내부 디스패처**를
  손수 구현해 의존성을 zod/yaml로 최소화한다.
- **YAML**: agent/workflow 로딩에 순수 JS `yaml` 패키지 1개를 core에 추가한다.

## Open Questions

(블로킹 질문만 — 아래는 설계 기본값을 정해 진행하며, 다르면 알려주세요.)

1. SQLite 실제 드라이버 연결을 v0.1에 포함할지(기본: **골격만, 미연결**).
2. 프로젝트 레지스트리를 전역(`~/.baton/`)에 둘지(기본: **전역 홈**) vs 프로젝트
   로컬(`./.baton/`).

## Risks

`risks.md` 참조. 핵심: 네이티브 SQLite 빌드 마찰, ESM `.js` 확장자 누락으로 인한
런타임 임포트 오류, 전역 레지스트리의 숨은 상태화, dry-run 경계가 새어 실제 부수
효과(worktree/Codex)가 발생하는 것, 어댑터 추상화 과설계.

## Recommendation

위 "Risky Assumptions"의 기본값(SQLite 골격 미연결 / 전역 홈 레지스트리 / 손수
만든 소형 CLI 디스패처 / `yaml` 1개 추가)으로 진행한다. 모든 외부 부수효과는
`ProcessRunner`, `Clock`, `DbClient` 같은 **주입 가능한 포트** 뒤에 두어 Vitest에서
mock으로 검증한다. ESLint는 v0.1에서 보류하고 게이트는 `typecheck + test + build`
로 한다. 상세 설계와 Codex 핸드오프는 `design.md` 참조.
