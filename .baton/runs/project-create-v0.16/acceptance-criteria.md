# Acceptance Criteria

v0.16 프로젝트 생성(데이터+위저드)이 완료되려면 아래가 모두 충족되어야 한다.

## Core schema & catalog (TS)

- [ ] AC-01 `Project` Zod = `{ id, name, source: { kind: 'local'|'github', value },
  agentIds: string[], leadAgentId?: string, createdAt }`. 추론 타입 export.
- [ ] AC-02 AI 에이전트 카탈로그(codex, claude)가 정의되고, 허용 id 검증 함수가 있다.
- [ ] AC-03 검증: 이름/소스 value non-empty, agentIds ⊆ 카탈로그 & ≥1, leadAgentId ∈
  agentIds(agentIds 복수면 필수, 단일이면 자동=그 id). 위반 시 명확한 에러.
- [ ] AC-04 기존 `{id,name,path,createdAt}` 형태는 사용처 갱신(하위 실데이터 없음) —
  스키마/서비스/테스트 일관.

## Core service & CLI (TS)

- [ ] AC-05 `ProjectService.create({name, source, agentIds, leadAgentId?})`가 검증 후
  레지스트리에 저장하고 Project를 반환한다(id 결정적/uuid, 중복 정책 정의).
- [ ] AC-06 `baton project create --name <n> --source-kind <local|github> --source <v>
  --agent <id>(반복) [--lead <id>]`가 동작한다(argv 배열, 잘못된 입력 거부+비정상 종료).
- [ ] AC-07 `baton project list --json`이 v0.13 봉투(`schemaVersion:1, kind:'project-list',
  data:[Project]`)로 출력된다. 텍스트 모드도 유지.
- [ ] AC-08 `baton project add <path>`가 로컬 소스 프로젝트로 하위호환 동작한다.

## GUI logic (BatonKit, swift test)

- [ ] AC-09 `ProjectFormModel`(name, source(kind+value), agentIds, leadAgentId) +
  `isValid` + `buildCreateArguments()`(→ `project create` argv) 가 단위 테스트된다.
- [ ] AC-10 `BatonClient.createProject(...)`가 argv 배열로 `project create`를 호출하고
  결과/에러를 표면화한다(크래시 없음).

## GUI views (thin, manual QA)

- [ ] AC-11 "새 프로젝트" 위저드: 이름 → 소스(로컬 폴더 피커 / GitHub URL 토글) → AI
  다중선택 + (복수 시) 대표 라디오 → 생성. 빈 입력 시 진행 비활성. paperclip/한국어.
- [ ] AC-12 프로젝트 목록(사이드바/뷰)이 생성된 프로젝트를 표시(이름/소스/대표/AI 배지).
- [ ] AC-13 View는 BatonKit에만 의존(로직 없음). 수동 QA 체크리스트 문서화.

## Safety & gates

- [ ] AC-14 GitHub 소스는 참조만(clone/네트워크 없음). 앱은 `baton` CLI 경유, `.baton`
  직접 변경/HTTP/credential 접근 없음. argv 배열.
- [ ] AC-15 `swift build` + `swift test`(apps/macos) 통과. 루트 `pnpm typecheck/test/
  build` 회귀 0(193 + core 신규 테스트).
- [ ] AC-16 `node packages/cli/dist/main.js project list --help`(또는 run --help) 스모크,
  README/UX 갱신(새 프로젝트/소스/대표 + 수동 QA 체크리스트).
