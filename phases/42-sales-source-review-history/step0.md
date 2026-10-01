# Step 0: history-api

## 읽어야 할 파일
- docs/PRD.md §3 AG-08·§8·§11
- docs/ARCHITECTURE.md §6-10·6-11
- docs/ADR.md ADR-080·081
- docs/AI-DEVELOPMENT.md
- docs/01-plan/features/sales-source-review-history.plan.md
- docs/02-design/features/sales-source-review-history.design.md (전체)
- app/api/d/[dept]/sales-review/ai/route.ts
- supabase/migrations/0068_sales_source_reviews.sql
- components/sales-source-ai-review.tsx
- components/sales-review.tsx

## 작업
목록 API와 mock 테스트. strict keyset cursor·최소 응답·세션 권한.
설계 D1~D8과 상위 문서 계약을 따른다. 이전 step 결과가 있으면 읽는다.

## 코드 관계와 구조 확인
history→session/RLS, history UI→AI 읽기 모드→existing GET/paragraph 복원. Graft/Archify 현재 CLI/MCP 미노출, 실제 import+설계 Mermaid로 확인하고 도구 누락 범위를 명시.

## Acceptance Criteria
```powershell
node node_modules/vitest/vitest.mjs run --config .vercel/review-qa/checklist-vitest.config.mts --configLoader native
node scripts/review-qa.mjs build --webpack
node scripts/review-qa.mjs guest-test tests/e2e/sales-source-review-history-local.spec.ts
npm run lint
```

## 검증 절차
step0 API tests,step1 build,step2 full suite/SQL/new+legacy E2E·PDCA. 실행 기록/summary→index 연결. 실제 실행하지 않은 검사 통과 주장 금지.

## 금지사항
요청 경로 service role·LLM·쓰기·브라우저 영속 저장·원문 snapshot 금지. SQL 가시성 복제 금지. 기존 합성 흐름 유지. 운영 배포는 별도 사용자 승인.
