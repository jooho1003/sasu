# Phase 39 실제 견적 원문 문구 비교 검증 — 2026-09-30

대상: [PRD AG-05·§8·§11](../PRD.md), [ADR-078](../ADR.md), [plan](../01-plan/features/sales-review-literal-comparison.plan.md), [design](../02-design/features/sales-review-literal-comparison.design.md), [step 0](../../phases/39-sales-review-literal-comparison/step0.md). 실제 고객 문서가 제공되지 않아 격리 QA DB의 합성 견적 문구로 권한과 문자 비교를 검증했다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| TDD | `tests/sales-review-literal-comparison.test.ts`를 먼저 작성해 신규 모듈 import 실패를 확인한 뒤 구현. 원문 추가·제거·반복·동일·긴 줄·8건 표시·100,000자/2,000조각 거절 4건 통과 |
| API 단위 | `tests/sales-review-literal-comparison-route.test.ts` 신규 route import 실패 뒤 구현. lead 현재 RLS 결과, member/demo 403, 변조·중복 400, 숨김/비활성 404, 큰 원문 422의 3건 통과. 두 파일 합계 **7/7** |
| 전체 단위 | `npm run test`: **166파일·1,733건 통과** |
| 인증 브라우저 | `sales-review-compare-test` **1/1**. 팀장 화면에서 기존 쪽에 더 많이 나온 문구 2건(반복 포함)·변경 쪽에 더 많이 나온 문구 1건, 직접 원문 링크, 타 부서 404, 팀원 403, 삭제 뒤 404, 전후 jobs/llm_calls/sales_review_tasks/sales_review_actions 증가 0. [화면](sales-review-literal-comparison-2026-09-30.png) 육안 확인 |
| 기존 흐름 | `sales-review-sources-test` **1/1**, `sales-review-test` **1/1**, `guest-test` **5/5** 통과 |
| 정적·빌드 | 최종 `npm run lint`: 종료 코드 0·문구 차단 0·기존 경고 80. 최종 `node scripts/review-qa.mjs build`: Next.js 16.3.4 컴파일·TypeScript·정적 페이지 통과. `git diff --check`: 오류 0 |

첫 인증 브라우저 시도는 Next.js 자체 route announcer와 화면 alert가 둘 다 `role=alert`여서 테스트 선택자가 충돌했다. 화면 안의 alert로 테스트 선택자를 좁힌 뒤 실제 삭제 거절까지 재실행해 통과했다. 첫 시도는 통과 건수에 넣지 않았다.

최종 빌드 전 한 번은 세 테스트/검사를 동시에 실행하면서 Turbopack이 오래 진행돼 중단했다. 이후 빌드 단독 재실행은 컴파일·TypeScript·정적 페이지까지 통과했고, 바뀐 화면 문구로 인증 브라우저를 다시 실행해 화면을 갱신했다. 요청 중 선택 잠금의 마지막 UI 수정 뒤 2026-10-01에 lint/build를 다시 실행해 모두 통과했다.

## 코드 관계와 구조

`components/sales-review-sources.tsx` → 세션 `POST /api/d/[dept]/sales-review/compare` → `requireMembership`·`is_demo_department` → 세션 `items`/`sources!inner` RLS(`can_see()`) → 기존 `buildSalesReviewSourcePreview()` 현재 상태 검사 → `lib/sales-review-literal-comparison.ts` 문구 조각·반복 차이·정확 인용 → 기존 `/d/[dept]/evidence/[id]` 원문 화면. 결과는 브라우저 메모리에만 있다. [설계 Mermaid](../02-design/features/sales-review-literal-comparison.design.md#1-구조와-실행-흐름)에 새 요청·권한 재검사를 표시했다.

Graft·Archify 호출 도구 및 실행 파일은 이 세션에 없어 전후 그래프·SVG 결과는 없다. 위 관계는 실제 파일·호출의 수동 추적이며 도구 산출물로 계산하지 않는다.

## 경계

- 줄 앞뒤 공백은 비교에서 제외한다. 긴 줄은 320자 이하의 조각으로 나누므로 문구 이동·서식 차이의 의미를 판정하지 않는다. 전체 건수는 문구 조각 수이며 화면은 앞 8건씩만 보인다.
- 실제 고객 요청·견적·영업 원칙의 내용 적합성, 가격/일정 계산, 계약 조건 해석, 생성형 검토안, 대외 발송은 검증하지 않았다.
- 새 migration/job/LLM/저장 경로가 없다. 운영 배포는 하지 않았다.
