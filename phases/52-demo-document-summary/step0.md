# Step 0: demo-summary-read-path

## 읽어야 할 파일
- `/AGENTS.md` · `/docs/ADR.md` ADR-091(·ADR-090) · `/docs/PRD.md` §6-7 "데모 문서 요약", §8 "데모 문서 요약 범위"
- `/docs/02-design/features/demo-document-summary.design.md` §2 M1~M5, §8 S1·U1~U4·U6
- `supabase/migrations/0002_can_see_rls.sql`(데모 읽기 정책 형태), `0011_document_assistant.sql`, `0034_reviewed_materials.sql`(document_summaries 정책)
- `lib/pipeline/document-summary.ts`, `tests/pipeline/document-summary.test.ts`, `lib/supabase/demo-workspace.ts`, `lib/demo-workspace.ts`, `lib/contracts.ts`(DocumentSummary)
- `scripts/verify-security-sql.mjs`(PGlite 하니스, 모듈 등록 방식), 예: `scripts/verify-device-links-sql.mjs`

## 작업
1. M1 migration `0070_demo_document_summaries_read.sql` + `supabase/rollback/`에 대응 롤백(기존 롤백 파일 형식 확인).
2. S1: SQL 하니스 모듈 추가·등록 — anon이 데모 부서 요약 1행 읽기, 비데모 0행, 비활성 소스 0행, INSERT/UPDATE/DELETE 거부. 실행: `npm install --prefix <임시폴더> @electric-sql/pglite@0.5.8 @electric-sql/pglite-pgvector@0.0.9` 후 `node scripts/verify-security-sql.mjs <임시폴더>`(이미 설치된 `C:/Users/이주호/AppData/Local/Temp/sasu-pglite-verify-20260920`가 있으면 그것을 써도 된다).
3. M2: 검증 함수를 `lib/document-summary-check.ts`로 이동(테스트 먼저 — 새 lib 모듈은 TDD 가드 대상이니 `tests/document-summary-check.test.ts`를 먼저 만들고 red 확인). 파이프라인은 import + 같은 이름 re-export. U6(기존 테스트) 그대로 통과.
4. M3: `lib/demo-document-summaries.ts` — U1~U4 테스트 먼저(red) → 구현.
5. M4·M5: 데모 로더·타입. 요약 조회 오류는 빈 요약으로 처리.

## Acceptance Criteria
```bash
npx vitest run tests/document-summary-check.test.ts tests/demo-document-summaries.test.ts tests/pipeline/document-summary.test.ts
node scripts/verify-security-sql.mjs <pglite 폴더>
npm run lint && npm run test
npx tsc --noEmit
```
기록: `docs/verification/52-demo-document-summary/step0.md`(명령·결과 요약·red→green·SQL 하니스 통과 수).

## 금지사항
- 쓰기 정책·RPC·새 테이블 추가 금지. anon 읽기 조건에서 `is_demo_department`를 빼지 마라.
- 앱 코드에 가시성 판정 로직을 복제하지 마라(RLS가 집행).
- `npm run build` 금지(메인 체크아웃 `.next` 충돌 방지 — root가 실행). 훅 우회·커밋·푸시·운영 DB 접속 금지.
