# Phase 40 영업 조건 확인 질문 검증 — 2026-10-01

대상: [PRD AG-06·§8·§11](../PRD.md), [ADR-079](../ADR.md), [plan](../01-plan/features/sales-review-condition-checklist.plan.md), [design](../02-design/features/sales-review-condition-checklist.design.md), [step](../../phases/40-sales-review-condition-checklist/step0.md). 현재 부서 원문을 처리하는 제품 경로를 격리 로컬 Supabase의 합성 고객 요청·견적·원칙으로 실행했다. 실제 고객 문서의 의미·업무 적합성은 검증하지 않았다.

## 실제 실행 기록

| 검사 | 명령·결과 |
|---|---|
| TDD red | 신규 lib/route 테스트를 먼저 작성했다. `node node_modules/vitest/vitest.mjs run tests/sales-review-condition-checklist.test.ts tests/sales-review-condition-checklist-route.test.ts --config .vercel/review-qa/checklist-vitest.config.mts --configLoader native`: 신규 모듈 import 실패 2개 suite 확인 후 구현 |
| 대상 단위 green | 같은 명령: **2파일·15/15 통과**. 전체 줄·부정/예외·네 역할·영문 단어 경계·빈 주제·반복/3건 제한·100,000 UTF-16/2,000줄/2,000 Unicode 줄 경계·현재 원문/권한·API 실패 |
| 전체 단위 | `node node_modules/vitest/vitest.mjs run --config .vercel/review-qa/checklist-vitest.config.mts --configLoader native`: **168파일·1,748/1,748 통과** |
| lint | `npm run lint`: 종료 0, 문구 차단 0·기존 경고 80. 후속 E2E/스크립트 수정은 대상 ESLint와 `node --check scripts/review-qa.mjs`로 추가 확인 |
| 빌드 | `node scripts/review-qa.mjs build --webpack`: Next.js 16.3.4 컴파일 성공·TypeScript 성공·정적 페이지 38개 생성·route 목록의 checklist 확인, 종료 0 |
| 신규 인증 E2E | `node scripts/review-qa.mjs sales-review-checklist-test`: **2/2 통과**. 현재 인용·원문 링크·반복 총수·앞 3건·모바일 390px 가로 넘침 없음·선택 변경 숨김·타 부서 404/member 403·비활성 404/lead 회수 403 뒤 결과/원문 숨김, 실제 demo lead/미동의 lead 직접 POST 403 |
| 기존 흐름 회귀 | `node scripts/review-qa.mjs guest-test tests/e2e/sales-review-local.spec.ts tests/e2e/sales-review-sources-local.spec.ts tests/e2e/sales-review-literal-comparison-local.spec.ts tests/e2e/sales-review-revision-local.spec.ts`: **9/9 통과** (게스트 5 + 합성 생성 1 + 합성 재검토 1 + 원문 연결 1 + 문구 비교 1) |
| 형식 | `git diff --check` 종료 0 |

기본 Vitest 실행은 이 환경에서 늦어져 중단했다. 임시 `.vercel/review-qa/checklist-vitest.config.mts`는 프로젝트 설정과 같은 Node 환경·`tests/**/*.test.ts` 포함·RLS/E2E/node_modules 제외 및 유일한 `@/*` alias를 명시하고 `maxWorkers:2`를 사용한다. `vite-tsconfig-paths` 탐색 없이 native config로 전체 168개 파일을 검사했다. 프로젝트 기본 테스트 설정 자체는 변경하지 않았다.

첫 Turbopack 빌드는 약 4분 반 동안 최적화 단계에서 후속 출력이 없어 중단했다. 원인 확정이나 Turbopack 완료 판정은 하지 않았다. 설치된 CLI 문서에 있는 Webpack 옵션으로 다시 실행해 위 프로덕션 빌드를 통과했다. 빌드 완료 전 첫 `start`는 build ID가 아직 없어 실패했고, 완료 뒤 다시 시작한 서버에서 모든 브라우저 검사를 실행했다.

첫 신규 E2E의 주 흐름은 통과했고 데모 검사는 프록시의 `max-age=0` 추가 때문에 캐시 헤더 정확 문자열 비교가 실패했다. private/no-store가 모두 포함되는지 검사하도록 고쳐 전체 2개를 다시 실행해 통과했다. 이 초기 실패를 통과 건수에 더하지 않았다.

## 화면·쿼리 증거

- [데스크톱 화면](sales-review-condition-checklist-2026-10-01.png), [390px 화면](sales-review-condition-checklist-2026-10-01-mobile.png): 전체 줄·부정어·원문 링크·역할별 건수·제한 안내를 육안 확인했다.
- [전후 DB 조회](sales-review-condition-checklist-2026-10-01-runtime.json): jobs **534→534**, llm_calls **293→293**, sales_review_tasks **12→12**, sales_review_actions **10→10**. QA 시드는 검사 전 별도로 만들었으며 제품 요청은 읽기 전용이다.
- [실제 세션 거절](sales-review-condition-checklist-2026-10-01-denied.json): demo lead와 미동의 lead 모두 403, `private, no-store, max-age=0`, topics 미반환. 임시 합성 계정·멤버십은 테스트 종료 시 제거했다.
- 회귀 화면은 과거 기록을 덮어쓰지 않도록 별도 보존했다: [합성 검토](phase40-regression-sales-agent-review-2026-09-30.png), [재검토](phase40-regression-sales-review-revision-2026-09-30.png), [원문 연결](phase40-regression-sales-review-source-connection-2026-09-30.png), [문구 비교](phase40-regression-sales-review-literal-comparison-2026-09-30.png).

## 코드 관계·독립 검토

`components/sales-review-sources.tsx` → 세션 `POST /api/d/[dept]/sales-review/checklist` → `requireMembership`·비데모 검사 → `items`/`sources!inner` RLS(`can_see()`) → 기존 `buildSalesReviewSourcePreview` → 새 순수 `buildSalesReviewConditionChecklist` → 기존 evidence 원문 링크. SQL·jobs·LLM 계약 변경 없음.

bkit analyze의 독립 gap-detector 검토는 여섯 영역(세션 권한, 현재 원문, 인용/질문, 건수/한도, 이전 결과 제거, 게스트/무저장)에서 구현 누락·보안 우회를 찾지 못했다. 지적한 멤버십 리다이렉트와 반환 JSON의 오류 보장 범위는 design §6에서 구분했고, 실제 demo 직접 POST도 E2E로 보완했다. 독립 검토자는 테스트를 실행하지 않았으며 위 런타임 결과는 주 세션의 실행이다.

Graft·Archify MCP/실행 파일은 제공되지 않았다. Docker를 실행해 격리 QA는 복구했으나 두 그래프 도구 산출물은 없다. 실제 파일 의존 추적과 [설계 Mermaid](../02-design/features/sales-review-condition-checklist.design.md#2-architecture-options)만 사용했다. 전후 Graft 그래프·Archify SVG를 실행한 것으로 계산하지 않는다.

## 경계·후속

고정 단어 목록에 기반한 원문 탐색이며 문맥 이해·원칙 위반·가격 차이·일정 충족·승인 사실을 판정하지 않는다. 원문 선택과 결과는 저장하지 않으며 새 요청 때 현재 권한·원문 상태를 다시 검사한다. 이미 열린 브라우저의 원문에 대한 실시간 철회 채널을 추가한 것은 아니다.

실제 고객 문서 적합성·생성형 해석·운영 배포는 이번 완료 범위에 없다. 기존 미추적 `supabase/.gitignore`·`supabase/config.toml`은 변경하지 않았다. [PDCA 분석](../03-analysis/sales-review-condition-checklist.analysis.md)과 [보고](../04-report/features/sales-review-condition-checklist.report.md)에 완료 판정을 연결한다.
