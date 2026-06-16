# Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | 볼트의 `Baton/` 밖에 쓰거나 사용자 기존 노트 침범/삭제 | Med | High | 모든 쓰기 경로를 `path.resolve(vault, 'Baton', ...)`로 만들고 `startsWith(<vault>/Baton)` 검증. 삭제 연산 없음(덮어쓰기만). runId/이름 sanitize(경로 분리자/`..` 금지). 테스트로 경로 단언. |
| R2 | 볼트 미설정인데 run이 실패 | Low | High | `resolveObsidianVault`가 undefined면 내보내기 **no-op**(run 정상 종료). 1회 힌트만. 테스트로 미설정 시 run 성공 + 미생성 단언. |
| R3 | 비결정적 렌더(타임스탬프/순서)로 diff 불안정 | Med | Med | 주입 Clock으로 exportedAt 고정 가능, 인덱스는 createdAt 내림차순 안정 정렬. run 자체 시간은 run.json에서. 스냅샷 테스트(fixed clock). |
| R4 | 아티팩트 복사 시 민감 로그(워커 stdout) 노출 | Low | Med | v0.5는 기존 .baton 아티팩트만 복사(이미 credential 무접근). 민감 데이터는 어댑터 단계에서 차단됨. 복사 대상은 run 디렉터리로 한정, 외부 파일 미포함. |
| R5 | Obsidian 임베드 경로(wikilink) 깨짐 | Med | Low | 아티팩트를 `Baton/Runs/<runId>/`로 복사하고 노트에서 볼트 상대 경로 임베드. 파일명 충돌은 runId 폴더로 격리. 렌더 테스트로 링크 형식 단언. |
| R6 | 재내보내기 비멱등(중복/누적) | Med | Med | run 노트/폴더는 runId 기준 덮어쓰기. 인덱스는 전체 run 재생성(append 아님). 동일 입력+fixed clock → 동일 출력 테스트. |
| R7 | 자동 훅이 엔진에 Obsidian 결합 유발 | Low | Med | 자동 내보내기는 CLI 레이어 공통 훅. 코어 `ObsidianJournalExporter`는 순수(주입 FS/Clock), 엔진은 호출 안 함. |
| R8 | 대량 run에서 인덱스 재생성 비용 | Low | Low | v0.5 규모에선 무시. 정렬·렌더는 단순. 필요 시 후속 증분 갱신. |
| R9 | dryRun/awaiting-approval run도 기록되어 노이즈 | Low | Low | 모든 상태 기록하되 frontmatter status/태그로 구분(`#baton/awaiting-approval` 등). 필터는 Dataview 사용자 몫. dryRun은 tag로 표시. |
| R10 | 볼트 경로에 공백/유니코드 → 경로 처리 오류 | Low | Med | path API 사용(문자열 결합 금지), 임시 디렉터리 테스트에 공백 포함 케이스. |
| R11 | 기존 안전(credential/세션 토큰/danger) 회귀 | Low | High | 보안 회귀 테스트 유지. 새 코드는 FS 쓰기만, 외부 프로세스/토큰 미접근. |
| R12 | `.gitignore` allow-list 미추가로 설계 run 누락 | Low | Low | `!.baton/runs/obsidian-journal-v0.5/` 추가 + 보안 테스트 패턴 확인. |
