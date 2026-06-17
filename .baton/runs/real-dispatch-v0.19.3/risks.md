# Risks — real-dispatch-v0.19.3

| 위험 | 영향 | 완화 |
|---|---|---|
| claude 읽기전용 플래그 오설정 | 의도치 않은 파일 편집(안전 핵심) | `claude --help`로 정확 플래그 확인, 불확실 시 **가장 제한적**(편집/실행 도구 차단). **수동 QA로 git status 미수정 확인** 필수. |
| codex 쓰기 기본값 누출 | read-only 의도인데 workspace-write로 실행 | 레지스트리에서 `sandbox:'read-only'` **명시 강제**. 인자 검증 테스트. 쓰기 분기 미구현. |
| 실 CLI 미설치/미인증 | 크립틱 실패 | **preflight**(checkCodex/checkClaude)로 디스패치 전 친절 중단. |
| 어댑터 기본 변경 회귀 | 기존 Run 경로 깨짐 | claude 변경은 **opt-in 옵션**, 기본 `--print` 보존. `cli/registry.ts` 불변. 회귀 테스트. |
| JSON 파싱 취약 | usage 못 읽거나 크래시 | 파싱 실패 시 원문 유지 + 추정 폴백(크래시 없음). |
| 긴 실행/행 | 멈춤 | 타임아웃 기본 + 역할당 1회. |
| credential 노출 우려 | 보안 | 인증은 codex/claude CLI 자체. Baton은 auth 파일 미접근·직접 HTTP 없음. |
| 종단 자동 검증 불가 | 회귀 사각 | 단위는 mock runner로 인자/파싱/preflight 검증, 종단은 수동 QA(문서화). |

## 비목표 (재확인)
쓰기(workspace-write) 모드, 병렬/역할별 게이트/fix 루프/재위임, Swift 모니터, codex usage 정밀
파싱, Baton 직접 네트워크.

## 후속 (로드맵)
- **쓰기 모드**(worktree 한정 workspace-write) + 강화 승인(diff 검토 게이트).
- Swift 실행 모니터 + 조직도 라이브 점등(실측 상태/토큰).
- 예산 게이트(플랫폼별 한도→남은 양), codex usage 정밀화, 병렬/역할별 게이트, 스킬(v0.20).
