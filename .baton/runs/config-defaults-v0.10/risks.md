# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 우선순위 모호(플래그 vs config vs 기본값) | Med | Med | 명문화: 명시 플래그 > config > 내장 기본값. boolean은 3-상태(미지정/on/off). resolveRunOptions 단위 테스트로 각 조합 단언. |
| R2 | 부정 플래그(--no-x) 3-상태 파싱 오류 | Med | Med | `--codex`→true, `--no-codex`→false, 미지정→undefined(=config 사용). 파서가 충돌(`--codex --no-codex`) 시 명확한 에러. 테스트. |
| R3 | `config set` 값 코어션/검증 실패 | Med | Med | 값 파싱(true/false/정수/JSON 배열) 후 전체 BatonConfig Zod 검증. 위반/알 수 없는 키 → 명확한 에러, 미기록. 테스트. |
| R4 | 리팩터로 journal(vault)/run(testCommand) 회귀 | Med | High | loadConfig가 기존 형태를 포함하도록(obsidian.vault/test.command). env>config 우선순위 유지. 기존 v0.5/v0.7 테스트 회귀 없음 확인. |
| R5 | 잘못된 config.json으로 run 실패 | Med | Med | loadConfig는 Zod 실패 시 명확한 에러(파일 경로). 부재는 빈 config(no-op). run은 config 없거나 비어도 기본값으로 동작. |
| R6 | config write가 기존 필드 손실 | Med | Med | set은 load→머지→검증→write(전체 보존). 부분 갱신만 적용. 라운드트립 테스트. |
| R7 | 동시 write 경합 | Low | Low | v0.10 단일 사용자 가정. write는 단순 덮어쓰기(원자성은 후속). 문서화. |
| R8 | 스키마 확장이 기존 config({version:1}) 깨뜨림 | Low | Med | 모든 신규 필드 optional, version 1 유지. 기존 config.json parse 유지. 하위호환 테스트. |
| R9 | maxFixAttempts/testCommand 등 교차 검증 | Low | Low | maxFixAttempts는 FixPolicy 범위(1~5)와 일관. config 검증에서 동일 제약. 테스트. |
| R10 | credential/세션 토큰/danger 회귀 | Low | High | config는 로컬 파일 읽기/쓰기만. 외부/토큰 미접근. 보안 회귀 테스트. |
