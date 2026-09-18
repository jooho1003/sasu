# Phase 25 노션 전체 수집 — 검증 기록 색인 (2026-09-18)

실행 방식: Codex CLI(`codex exec`, 샌드박스 우회 플래그는 `scripts/execute.py`와 동일)가 main 작업 트리에서 step 단위로 구현·검증하고, Claude가 각 step을 리뷰해 결함을 수정한 뒤 같은 파일의 "오케스트레이터 리뷰" 절에 기록했다. 커밋·운영 DB·배포·실제 노션/Voyage 호출은 하지 않았다.

| step | 상태 | 기록 | 리뷰에서 고친 것 |
|---|---|---|---|
| 0 notion-api-v2025 | completed | [step0.md](step0.md) | jobs.ts 포매터 잡음 되돌림, 검색 결과 object 구분, archived 처리 |
| 1 notion-chunk | completed | [step1.md](step1.md) | **마스킹을 자르기 전에** — 경계에 걸친 이메일 누출 차단 |
| 2 notion-installation | completed | [step2.md](step2.md) | 워크스페이스 교체 시 옛 소스 정리 |
| 3 import-v2 | completed | [step3.md](step3.md) | 없음 |
| 4 roots-discover | completed | [step4.md](step4.md) | **workspace 범위가 다른 부서 subtree 페이지를 복사하던 권한 결함** |
| 5 bulk-lane | completed | [step5.md](step5.md) | 없음 |
| 6 poll-reconcile | completed (2회 실행) | [step6.md](step6.md) | 같은 분 재수정 판정 기준 |
| 7 collection-ui | completed (2회 실행) | [step7.md](step7.md), 스크린샷 4장 | 없음 |
| 8 notion-oauth-webhook | blocked | — | 노션 공개 통합·환경 변수 미준비 |

마지막 전체 검증(step 7 2차, Codex 실행): `npm run lint && npm run build && npm run test` 성공(108 files / 1,203 tests), `npm run e2e -- --grep notion` 7/7, PGlite 보안 하니스 208/208. Claude 재확인: PGlite 208/208, 노션 관련 Vitest 묶음 통과.

## 운영 반영 전 필요한 것 (미실행)

1. 환경 변수 `NOTION_TOKEN_ENCRYPTION_KEY`(base64 32바이트) 준비.
2. 0039 preflight 중복 쿼리(migration 주석) 실행 → 0건 확인.
3. 순서: `scripts/register-legacy-notion.ts --apply <org>`(기존 NOTION_TOKEN 이전) → migration 0038~0043 적용(0040은 다른 phase) → 앱 배포. 순서가 바뀌면 기존 노션 소스가 `notion_not_configured`로 멈춘다.
4. 적용 뒤 `cron.job`에 `sasu-jobs-bulk-tick` 존재, `/api/jobs/run?lane=bulk` 첫 호출 200 확인.
5. 테스트 워크스페이스 토큰으로 `2025-09-03` 실제 응답(`/users/me`의 workspace_id, data_sources, 검색 필터) 확인 — 지금까지 전부 mock.
6. 사용자 승인.
