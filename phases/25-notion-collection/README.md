# Phase 25 — 노션 전체 수집 (ADR-060)

- 원천: PRD §3-5(NOT-01~07)·§8 "ADR-060 노션 전체 수집 경계", ADR-060, 상세 설계 `docs/planning/노션_전체수집_설계.md`(하네스가 자동 주입하지 않으므로 각 step이 직접 읽는다).
- 목표: 노션 페이지 1개 = `sources` 1행 단위 위에 **직접 등록**(부서장이 URL을 붙임)과 **자동 수집**(조직 관리자가 범위를 부서에 매핑)을 둘 다 제공한다.
- 사용자 결정(2026-09-18): 제출 전 구현 착수 · 노션 API `2025-09-03` 전환 · 벡터 저장 진행(상한 2,000 유지) · Supabase DB 용량 설계는 별도 · 발언이 담긴 문서도 전원 동의 전제로 전부 수집(부서 단위 동의 게이트).

## 실행 순서와 의존

| step | name | 의존 | 비고 |
|---|---|---|---|
| 0 | notion-api-v2025 | — | 어댑터만. DB·화면 변경 없음 |
| 1 | notion-chunk | — | 순수 모듈. step 0과 병행 가능 |
| 2 | notion-installation | 0 | migration + 조직별 토큰 + 전역 토큰 제거 |
| 3 | import-v2 | 0·1·2 | 기존 소스는 `import_version=1`로 무변경 |
| 4 | roots-discover | 3 | 동의 게이트·상한·제외 포함 |
| 5 | bulk-lane | 3 | step 4와 병행 가능 |
| 6 | poll-reconcile | 4·5 | |
| 7 | collection-ui | 4 | 데모 시드 포함 |
| 8 | notion-oauth-webhook | 2 | 노션 공개 통합 개통(사람 작업) 선행 → 없으면 `blocked` |

## 공통 규칙

- 운영 DB·운영 배포·실제 고객 워크스페이스 호출은 하지 않는다. 실제 노션 호출이 필요한 확인은 사용자가 준비한 테스트 워크스페이스 토큰이 있을 때만 하고, 없으면 그 항목을 미실행으로 기록한다.
- migration 번호는 실행 시점에 `supabase/migrations/`의 다음 빈 번호를 쓴다(다른 세션이 0037 이후를 쓰고 있을 수 있다). 이미 적용된 migration 파일을 고치지 않는다.
- 이 작업 트리에는 다른 세션의 미커밋 변경이 많다. 이 phase와 무관한 파일을 되돌리거나 정리하지 않는다. 커밋은 하지 않는다(경계 커밋은 사람이 지정 경로로 한다).
- Graft·Archify가 PATH에 없으면(2026-09-18 확인 시 없음) 실제 파일·검색으로 확인한 의존 관계를 `docs/verification/notion-collection/stepN.md`에 적고 "도구 결과 없음"을 명시한다.
- 완료 기록은 `docs/verification/notion-collection/`에 step별로 남긴다: 변경 파일, 실행한 명령과 결과, 미실행 항목.
