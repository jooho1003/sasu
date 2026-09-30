# phase 36 합성 영업 검토 실행 기록 — 2026-09-30

대상: [PRD AG-02](../PRD.md), [ADR-075](../ADR.md), [설계](../02-design/features/sales-agent-review.design.md), [step 0](../../phases/36-sales-agent-review/step0.md). 실제 고객 자료나 운영 DB를 사용하지 않았다.

## 실행 결과

| 검증 | 결과 |
|---|---|
| TDD | `tests/sales-review.test.ts`를 먼저 작성해 신규 모듈 import 실패를 확인한 뒤 `lib/sales-review.ts` 구현. 고정 문장·인용·차액·변조 거절 테스트 통과. |
| 보안 SQL | `node scripts/verify-security-sql.mjs "$env:TEMP\sasu-pglite-phase36"`: **286 pass, 0 fail**. 새 항목 4개가 요청 멱등·task+job 원자성, RLS/동의, lead 단회 append-only 행동, 일별 한도를 검사. 격리 PGlite이며 `0004_worker_cron.sql`은 제외. |
| 로컬 실제 DB | `npx supabase migration up --local`: 0066 적용. 별도 `node scripts/review-qa.mjs setup`: 격리 QA DB에 0066 적용·합성 계정/조직 준비. 운영 DB 미적용. |
| 단위 회귀 | 최종 `npm run test`: **162 files, 1,717 tests pass**. job 실패 매핑·2분 sweep 추가 뒤 대상 `npx vitest run tests/jobs.test.ts tests/sales-review.test.ts tests/pipeline/sales-review.test.ts tests/sales-review-routes.test.ts`: **4 files, 37 tests pass**. |
| 빌드·정적 검사 | `node scripts/review-qa.mjs build`: Next.js 16.3.4 빌드·TypeScript 통과. `npm run lint`: 종료 코드 0, 문구 차단 0·경고 80. `git diff --check`: 종료 코드 0. |
| 게스트 회귀 | `npm run e2e -- tests/e2e/guest.spec.ts`: **5/5 pass**. 게스트 무쓰기·기존 경로 검증. |
| 실제 브라우저·모델 | `node scripts/review-qa.mjs start`의 격리 QA 프로덕션 빌드 서버 + `node scripts/review-qa.mjs sales-review-test`: 작업 생성→job 1건→모델 처리 ready→인용 결과→member 승인 403→lead 내부 확인→중복 409, **1/1 pass**. [완료 화면](sales-agent-review-2026-09-30.png). |
| QA DB 결과 | 격리 QA DB `psql` 직접 조회: `tasks=4, ready=4`, `actions=3`, `llm_calls=4`(`purpose='sales_quote_review'`). 실패한 반복 브라우저 시도의 작업 1건도 포함한다. 최종 실행은 1/1 pass. |

개발 서버에서 첫 브라우저 시도는 Next 페이지 컴파일이 끝나지 않아 180초 타임아웃으로 실패했다. QA 프로덕션 빌드 서버에서는 첫 두 실행이 통과했다. 세 번째 반복 실행에서 새 작업 생성 후 이전 작업이 선택되는 경쟁 상태가 드러나 실패했고, `load(preferredId)`로 새 작업 선택을 고쳤다. 최종 빌드에서 새 작업 선택 assertion과 전체 동선을 다시 실행해 **1/1 pass**했고 스크린샷을 갱신했다. 실패한 시도를 통과로 계산하지 않았다.

## 코드 관계와 구조 검토

`page.tsx`·`components/sales-review.tsx` → 세션 `GET/POST /api/d/[dept]/sales-review` → SQL `request_sales_review`(task+job) → `lib/jobs.ts`/`lib/worker.ts` → `lib/pipeline/sales-review.ts` → `llm.structured` 선택 → `lib/sales-review.ts` 고정 인용 문장 → task result → 세션 GET/RLS 재검증 → `review_sales_task` lead 단회 기록. 실패는 job 3회 종료 또는 2분 sweep이 task를 `failed`로 바꾸며 UI가 사유를 보여 준다. [설계 Mermaid](../02-design/features/sales-agent-review.design.md#2-architecture-options)가 사람의 내부 확인 지점을 포함한다.

Graft·Archify 호출 도구는 이 세션에 없어 실제 그래프·SVG 결과를 만들지 못했다. 위 관계는 파일·함수 수동 추적이고 Mermaid는 설계 문서의 구조도다. 이를 도구 실행 결과로 간주하지 않는다.

## 남은 경계

- 실제 영업 정책·고객 자료·업로드·외부 발송은 테스트하지 않았고 이 기능에 연결하지 않았다.
- 운영 migration·배포는 하지 않았다. 로컬 QA 모델 1개 합성 사례만으로 실제 영업 효용을 주장하지 않는다.
- `0004_worker_cron.sql`은 PGlite에서 실행하지 않았다. 로컬 브라우저 테스트는 `/api/jobs/run`을 직접 호출해 같은 worker를 실행했다.

[PDCA 분석](../03-analysis/sales-agent-review.analysis.md) · [보고](../04-report/features/sales-agent-review.report.md)
