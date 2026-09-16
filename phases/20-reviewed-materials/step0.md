# Step 0: review-schema

## 읽어야 할 파일
- docs/PRD.md §3-3·§8·§11, docs/ADR.md ADR-053·054
- docs/planning/자료검토_음성전사_요구사항.md §4~8
- supabase/migrations/0030_source_lifecycle.sql

## 작업
자료 초안·변환 구간·수정 이력 및 세션 RPC를 만든다. can_see 단일 판정, 동의한 lead만 쓰기, 데모 무쓰기, 낙관적 버전, 확정 전 items 없음, 확정/중지/삭제 원자성, 늦은 완료 차단을 SQL에서 집행한다. 원본은 DB에 저장하지 않는다.

## Acceptance Criteria
`node scripts/verify-security-sql.mjs <pglite-dependency-directory>` — 신규 자료 권한·버전·삭제 검증 포함.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
