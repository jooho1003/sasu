# Phase 38 실제 부서 원문 연결 검증 — 2026-09-30

대상: [PRD AG-04·§8·§11](../PRD.md), [ADR-077](../ADR.md), [plan](../01-plan/features/sales-review-source-connection.plan.md), [design](../02-design/features/sales-review-source-connection.design.md), [step 0](../../phases/38-sales-review-source-connection/step0.md). QA에서는 격리 DB의 합성 원문을 사용했다. 실제 고객 문서 자체는 제공되지 않았다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| TDD | `tests/sales-review-sources.test.ts`를 먼저 작성해 신규 모듈 import 실패를 확인한 뒤 `lib/sales-review-sources.ts` 구현. 직접 부분 문자열·중복/타 부서/삭제/비활성/원칙 거절 통과 |
| API 단위 | `tests/sales-review-sources-route.test.ts`에서 세션/RLS 결과를 사용하는 GET·POST, 팀원/미동의/demo 403, 변조·중복 400, 숨겨진 원문·원칙 오지정 404, 오래된 원칙 후보 병합 검사. 최종 대상 테스트 **7/7** |
| 전체 단위 | 최종 `npm run test`: **164파일·1,726건 통과** |
| 인증 브라우저 | `node scripts/review-qa.mjs setup` 격리 DB → `build` → `start` → `sales-review-sources-test`: 최종 **1/1**. 팀장 선택 4건·직접 원문 페이지·팀원 API 403·타 부서 원문 404·삭제 뒤 재조회 404. [화면](sales-review-source-connection-2026-09-30.png) 육안 확인 |
| 기존 흐름 | `sales-review-test` **1/1**(합성 검토·근거·팀장 행동). `guest-test` **5/5**(게스트 완주와 읽기 전후 DB/AI 무증가) |
| 정적·빌드 | 최종 `node scripts/review-qa.mjs build`: Next.js 16.3.4 컴파일·TypeScript·정적 페이지 통과. `npm run lint`: 종료 코드 0, 문구 차단 0·기존 경고 80. `git diff --check`: 오류 0 |

첫 인증 브라우저 시도는 `getByLabel()`이 select를 가리키지 않아 테스트 선택이 2분 대기했다. `getByRole('combobox')`로 대상을 고쳐 실제 선택·링크·삭제 거절까지 통과했다. 다른 시도의 alert strict locator 충돌도 테스트 선택자를 고쳐 재실행했다. 실패 시도를 통과 건수에 넣지 않았다.

## 코드 관계와 구조

`components/sales-review.tsx` → `components/sales-review-sources.tsx` → 세션 `GET/POST /api/d/[dept]/sales-review/sources` → `requireMembership`·`is_demo_department` → 세션 `items`/`sources!inner` RLS(`can_see()`) → `lib/sales-review-sources.ts`의 현재 상태·원문 부분 문자열 확인 → 기존 `/d/[dept]/evidence/[id]` 원문 화면. 선택·응답은 브라우저 메모리만 사용한다. [설계 Mermaid](../02-design/features/sales-review-source-connection.design.md#1-구조와-실행-흐름)에 사람의 원문 지정과 재검사를 표시했다.

Graft·Archify 호출 도구 및 실행 파일은 이 세션에 없어 전후 그래프·SVG 결과는 없다. 위 관계는 실제 파일·호출의 수동 추적이며 도구 산출물로 계산하지 않는다.

## 경계

- 후보 목록은 최근 원문 100건과 원칙 원문 50건을 병합한다. 그보다 오래된 일반 원문 검색 UI는 없다. POST에 지정한 ID는 현재 RLS로 다시 검사한다.
- 실제 고객 요청·견적·영업 정책 문서의 내용 적합성, 가격/일정 해석, 생성형 검토안, 대외 발송은 검증하지 않았다. 이 단계는 원문 연결·대조만 제공한다.
- 새 migration/job/LLM/저장 경로가 없다. 운영 배포는 하지 않았다.
