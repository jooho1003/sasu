# Step 1: demo-summary-screen-and-seed

## 읽어야 할 파일
- `/AGENTS.md` · ADR-091 · PRD §6-7·§8 · design §2 M6~M9, §8 U5·E1·E2
- step 0 결과(`docs/verification/52-demo-document-summary/step0.md`)
- `components/document-assistant.tsx`, `components/demo-document-workspace.tsx`, `app/demo/d/[dept]/documents/page.tsx`
- `scripts/seed-demo.ts`, `tests/seed-demo.test.ts`, `lib/demo-access.ts`
- 데모 E2E: `tests/e2e/demo-public-workspace.spec.ts`, `tests/e2e/demo-reviewer.spec.ts`, `tests/e2e/guest.spec.ts`
- 구현할 Next.js client/server 경계에 해당하는 `node_modules/next/dist/docs/` 가이드

## 작업
1. M6·M7: 공유 컴포넌트 추출, 실제 문서 화면 출력 불변.
2. M8: 데모 문서 화면 요약 구역(쓰기 버튼 없음).
3. M9 + U5: 시드 수정·합성 문서 추가, `tests/seed-demo.test.ts`를 `dropped === 0`(지원서 3건 + 합성 문서)과 합성 문서 네 구역 존재로 강화. 다른 데모 수치(문서 수·항목 수 등)를 단언하는 기존 테스트·E2E가 있으면 같이 맞춘다.
4. E1 E2E 추가, E2 회귀. 로컬 QA 스택(`review-qa`, `node scripts/review-qa.mjs setup` 후 로컬 DB에 데모 시드: 시드는 `.env`의 운영 URL을 읽으므로 반드시 로컬 `review-qa`의 URL·service key로 환경변수를 덮어써서 실행 — 운영 DB에 시드하지 마라). 로컬 QA 서버 3011을 다른 작업이 쓰고 있으면 E1·E2를 실행하지 말고 "root 인계"로 기록.

## Acceptance Criteria
```bash
npx vitest run tests/seed-demo.test.ts
npm run lint && npm run test
npx tsc --noEmit
# 로컬 QA 가능 시: E2E_BASE_URL=http://localhost:3011 npx playwright test <E1 스펙> demo-public-workspace.spec.ts demo-reviewer.spec.ts guest.spec.ts
```
기록: `docs/verification/52-demo-document-summary/step1.md` + 1440·390 캡처.

## 금지사항
- 데모 화면에 업로드·정리 시작·저장 등 쓰기 버튼 추가 금지. 게스트 라우트 LLM 호출 금지.
- 운영 DB(.env의 Supabase URL)에 시드·쿼리 금지.
- `npm run build` 금지(root 실행). 훅 우회·커밋·푸시 금지.
