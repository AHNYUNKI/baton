# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 네이티브 SQLite(better-sqlite3) 빌드 마찰 / 테스트 오염 | High | Med | v0.1은 드라이버 미연결. `DbClient` 인터페이스 + DDL 상수 + 스킬레톤만. 실제 연결은 후속 run. |
| R2 | ESM(NodeNext) 상대 임포트에 `.js` 확장자 누락 → 런타임 `ERR_MODULE_NOT_FOUND` | High | Med | 컨벤션 명시: 모든 상대 임포트는 `.js` 확장자. typecheck + 빌드 산출물 실행 smoke 테스트로 검출. |
| R3 | dry-run 경계 누수: `run --dry-run`이 실제 worktree 생성/Codex 호출 유발 | Med | High | run 서비스가 dry-run일 때 WorkerAdapter/WorktreeManager를 **호출하지 않도록** 분기. 테스트에서 mock 어댑터가 호출 0회임을 단언. |
| R4 | 전역 레지스트리(`~/.baton/projects.json`)가 숨은 전역 상태가 됨 | Med | Med | 경로를 `$BATON_HOME` 환경변수로 주입 가능하게. 테스트는 임시 디렉터리로 격리. 파일은 사람이 읽을 수 있는 JSON. |
| R5 | 어댑터/포트 과추상화(over-engineering) | Med | Med | 인터페이스는 실제 필요한 메서드만. v0.1은 CodexExecAdapter 1종, ProcessRunner 1종. 미래 어댑터는 주석 TODO로만 표기. |
| R6 | 실수로 Codex credential 접근 / `~/.codex/auth.json` 읽기 | Low | High | doctor는 `codex --version`류만 ProcessRunner로 호출. auth 경로 문자열 자체를 코드에 두지 않음. 보안 단언 테스트(파일 접근 없음) 포함. |
| R7 | main 브랜치 직접 수정 유도 | Low | High | WorktreeManager는 항상 `baton/<runId>` 브랜치 + 별도 worktree 경로를 강제. base 브랜치는 읽기 전용 취급. v0.1에서는 실행 안 함(skeleton). |
| R8 | 모노레포 빌드 순서/프로젝트 참조 오류 | Med | Low | TS project references(`tsc -b`)로 schemas→core→cli 순서 보장. `pnpm build`가 `tsc -b` 한 번으로 전체 빌드. |
| R9 | 패키지 설치 마찰(오프라인/락) | Med | Low | 네이티브 의존 0. 런타임 의존은 `zod`, `yaml`만. 나머지는 devDeps(typescript, vitest, tsx, @types/node). |
| R10 | YAML 스키마 검증 누락으로 잘못된 agent/workflow 로드 | Med | Med | 로더가 `yaml.parse` 후 **반드시 Zod로 검증**. 검증 실패 시 명확한 에러 메시지, silent 실패 금지. |
| R11 | CLI가 비즈니스 로직을 흡수(얇은 CLI 원칙 위반) | Med | Low | 명령 핸들러는 인자 파싱 → core 서비스 호출 → 출력만. 모든 로직 테스트는 core에서 수행. |
| R12 | ESLint 부재로 스타일 드리프트 | Low | Low | v0.1 게이트는 typecheck/test/build. ESLint flat config는 후속 작업으로 명시(`docs`에 TODO). |
