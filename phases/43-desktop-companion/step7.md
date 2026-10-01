# Step 7: companion-sales-review

## 읽어야 할 파일

- `docs/PRD.md` §3-3 AG-04·AG-07, §3-8 DC-09
- `docs/ARCHITECTURE.md` §6-8·§6-10(AG-07 불변식), §6-12 불변식 46~48
- `docs/ADR.md` ADR-077·ADR-080(phase 41)·ADR-082 결정 8
- `docs/02-design/features/desktop-companion.design.md` §4(E14~E16·W06)·§5.3 "일 맡기기"
- step 6 산출물: `lib/companion/inbox.ts`, `app/api/companion/**`, `scripts/verify-companion-api.mjs`
- `app/api/d/[dept]/sales-review/sources/route.ts`(GET 후보 조회), `lib/sales-review-sources.ts`(`salesReviewSourceCandidates`)
- `app/api/d/[dept]/sales-review/ai/route.ts`(phase 41의 POST·GET), phase 41 마이그레이션(`*_sales_source_reviews.sql`), `lib/contracts.ts`(`SalesSourceReviewRequest`)

## 선행 조건 확인 (먼저)

```powershell
git log --oneline -1 -- "app/api/d/[dept]/sales-review/ai/route.ts"
Get-ChildItem supabase/migrations/*sales_source_reviews*.sql
```

둘 중 하나라도 없으면(=phase 41이 이 브랜치에 병합되지 않음) 아무것도 바꾸지 말고 `"status": "blocked"`, `"blocked_reason": "phase 41(AG-07) 병합 필요 — 병합 후 pending으로 되돌려 재실행"`으로 멈춘다.

## 작업

1. 테스트 먼저 `tests/sales-source-review-start.test.ts`, `tests/sales-review-source-candidates.test.ts`.
2. `lib/sales-source-review-start.ts`
   ```ts
   export async function startSalesSourceReview(ctx: ActorContext, input: SalesSourceReviewRequest): Promise<Result<{ task_id: string }>>;
   export async function readSalesSourceReviewStatus(ctx: ActorContext, taskId: string): Promise<Result<{ status: string }>>;
   ```
   phase 41 웹 POST의 lead·동의·비데모 확인, `sales_source_review_inputs`·`request_sales_source_review` 호출, 오류 매핑, worker kick을 그대로 옮긴다. 상태 조회는 본인 작업만.
3. 후보 조회를 `lib/sales-review-sources.ts`에 `loadSalesSourceCandidates(ctx)`로 추출한다(웹 GET의 두 조회 + `salesReviewSourceCandidates`). 웹 GET·phase 41 웹 POST를 이 함수들로 바꾼다(W06). 응답은 이전과 같아야 한다.
4. 앱 경로:
   - E14 `app/api/companion/sales-review/sources/route.ts` GET → `loadSalesSourceCandidates`(lead 아니면 403 `lead_only`)
   - E15 `app/api/companion/sales-review/route.ts` POST → `startSalesSourceReview` → 202
   - E16 `app/api/companion/sales-review/[taskId]/route.ts` GET → `{status, web_path}` (`web_path`는 웹 결과 화면의 상대 경로. 결과 본문은 넣지 않는다)
5. `lib/companion/inbox.ts`의 `sales`를 본인 최근 24시간 작업 `{id, status}`로 채운다(테스트 추가).
6. `scripts/verify-companion-api.mjs`에 사례 추가: member E14 403 · 데모 403 · lead 요청 202 · 같은 `request_id` 재요청 멱등 · inbox에 작업 표시 · 다른 사용자 작업 E16 404. 결과는 `docs/verification/43-desktop-companion/sales-review.md`.

## Acceptance Criteria

```powershell
npx vitest run tests/sales-source-review-start.test.ts tests/sales-review-source-candidates.test.ts tests/companion
npm run lint
npm run build
npm run test
node scripts/verify-companion-api.mjs
node scripts/review-qa.mjs sales-review-sources-test
git diff --check
```

- phase 41 웹 E2E가 있으면 함께 실행해 통과한다(이름은 `scripts/review-qa.mjs`에서 확인).

## 검증 절차

1. AC 실행.
2. 체크리스트: AG-07 권한·재검사 계약을 바꾸지 않았는가 · 앱 경로가 결과 본문·원문을 복제하지 않는가.
3. `phases/43-desktop-companion/index.json` step 7을 갱신한다.

## 금지사항

- 합성 영업 검토(AG-02)·자유 텍스트 입력 경로를 추가하지 마라. 이유: ADR-082 결정 8·PRD §3-8 제외 항목.
- AG-07 SQL·RLS·job 계약을 수정하지 마라. 이유: phase 41(ADR-080)의 범위다.
- 기존 테스트를 깨뜨리지 마라.
