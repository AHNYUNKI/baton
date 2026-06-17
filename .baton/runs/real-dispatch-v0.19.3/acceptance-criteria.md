# Acceptance Criteria — real-dispatch-v0.19.3

실제 디스패치(읽기 전용 첫 컷)가 완료되려면 아래 모두 충족. 단위 테스트는 mock runner(실 CLI
불요), 종단 실제 실행은 수동 QA.

## opt-in & 기본 (pnpm test)
- [ ] AC-01 `plan run start <projectId>`에 플래그 **없으면 기존대로 StubWorker**(실제 호출 없음,
  회귀 0).
- [ ] AC-08 `createAgentWorkerRegistry`에서 codex/claude 미지정 → StubWorker. 기본 동작 불변.

## 읽기 전용 강제 (pnpm test)
- [ ] AC-02 `--claude` 시 ClaudeCodeAdapter가 **비편집(읽기 전용) 권한 플래그**로 실행된다(파일
  수정 불가). 정확 플래그는 `claude --help`로 확인(불확실 시 최대 제한).
- [ ] AC-03 `--codex` 시 CodexExecAdapter가 `--sandbox read-only`로 실행된다(workspace-write 아님).
- [ ] AC-11 **쓰기(workspace-write) 모드는 구현/노출되지 않는다**(읽기 전용 고정).

## 실측 토큰 (pnpm test)
- [ ] AC-04 claude `--output-format json` 출력에서 `usage`(input/output tokens)를 파싱해
  `metadata.usage`로 설정 → 토큰 표가 **실측**(estimated:false)으로 전환. (codex usage는
  best-effort; 없으면 추정 폴백.)
- [ ] AC-05 JSON 파싱 실패 시 원문 stdout 유지 + usage 생략(추정 폴백) — 크래시 없음.

## CLI & preflight (pnpm test)
- [ ] AC-06 `--codex`/`--claude`가 해당 플랫폼만 실제(읽기전용) 어댑터로 선택한다. `--timeout-ms`
  반영.
- [ ] AC-07 **preflight**: 켠 플랫폼의 CLI 미설치/실행 불가 시 친절한 비영 오류로 **디스패치 전
  중단**(승인/실행 진입 안 함).

## 안전 & 회귀
- [ ] AC-09 승인 게이트(pre-dispatch)·worktree 격리·base≠main·타임아웃 유지. 역할당 1회 호출.
- [ ] AC-10 credential/auth 파일 무접근, Baton 직접 HTTP 없음(인증·호출은 AI CLI 자체).
- [ ] AC-12 `ClaudeCodeAdapter` 기본(옵션 미지정) `--print` 동작 보존 → **기존 Run 경로
  (`createWorkerRegistry`)·전체 테스트 회귀 0**. 루트 `pnpm typecheck/test/build` 통과. Swift 미변경.

## 수동 QA (문서)
- [ ] (QA) 실 codex/claude로 `--codex`/`--claude` 실행 시: ① repo 파일 **미수정**(git status 깨끗),
  ② run 디렉터리에 산출물/프롬프트 기록, ③ claude 토큰이 실측으로 표시 — 절차를 요약에 명시.
