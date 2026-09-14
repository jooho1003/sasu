# Step 0: write-boundaries

## 읽어야 할 파일

- `docs/PRD.md` §3-2·§8-2·§11
- `docs/ARCHITECTURE.md` §6·§6-2·§8
- `docs/ADR.md` ADR-042
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-4·§D
- `supabase/migrations/0002_can_see_rls.sql`, `0013_authenticated_write_boundaries.sql`, `0015_evidence_write_boundaries.sql`
- `scripts/verify-security-sql.mjs`
- `app/api/d/[dept]/documents/route.ts`, `app/api/d/[dept]/meetings/transcript/route.ts`
- `lib/supabase/membership.ts`, `lib/mask.ts`

## 작업

1. 격리 SQL 하니스에서 departments 조직 변경과 items 직접 INSERT 거부 테스트를 먼저 추가하고 실패를 기록한다.
2. 마이그레이션 0025: departments authenticated 정책을 SELECT 전용으로 바꾸고 anon/authenticated 쓰기를 회수한다. items INSERT도 회수한다. can_see()는 변경하지 않는다.
3. 업로드는 세션으로 lead·부서·비데모를 확인한다. 소스·메타데이터 쓰기는 세션을 유지한다. items에만 기존 mask()를 적용한 뒤 수집 어댑터 service role INSERT를 쓴다. 전사의 미동의 발언은 계속 버린다. 실패·거부·마스킹·부서 위조 회귀 테스트를 추가한다.
4. 하니스의 기본 GRANT 및 전 테이블 직접 쓰기 경계 표를 고정한다. 기존 허용 경계와 이번 수정 범위를 구분해 기록한다.

## Acceptance Criteria

- `npm run lint`, `npm run build`, `npm run test`
- `node scripts/verify-security-sql.mjs <PGlite 설치 경로>`: 합성 데이터·메모리 DB만 사용한다.
- `npm run e2e:trailer`: 기존 합성 공간 체험 회귀.
- 실행 결과를 `docs/verification/security-hotfix.md`에 기록한다.

## 금지사항

- 운영 DB 적용·배포·실데이터 쓰기·실제 LLM 호출 금지. 운영 검증은 step1의 승인 게이트다.
- 기존 phase7 파일, Claude 설계 문서의 범위를 변경하지 않는다.
- 서비스 클라이언트로 조회하거나 마스킹 전 내용을 저장/로그 출력하지 않는다.
