# `/pdca analyze sales-agent-review` — 2026-09-30

대조 원천: [PRD AG-02](../PRD.md) → [ARCHITECTURE §6-6](../ARCHITECTURE.md) → [ADR-075](../ADR.md) → [design §11](../02-design/features/sales-agent-review.design.md). 실제 [검증 기록](../verification/sales-agent-review-2026-09-30.md)을 함께 확인했다.

| # | 설계 항목 | 구현·검증 |
|---|---|---|
| 1 | 고정 합성 S1~S4와 세 초점 | `lib/sales-review.ts`, 입력 UI·Zod |
| 2 | 엄격한 선택 스키마, 모델 자유 문장 미사용 | `lib/contracts.ts`, `lib/pipeline/sales-review.ts` |
| 3 | 정확한 quote·코드 계산·네 결과물 | `buildSalesReview`·`safeSalesReviewResult`, unit 및 브라우저 |
| 4 | 작업/행동 테이블과 `can_see()` RLS·동의 | migration 0066, 격리 SQL |
| 5 | task+job 원자 생성·멱등·일별 한도·데모 거절 | `request_sales_review`, 격리 SQL |
| 6 | job 등록·3회 실패·2분 sweep | `lib/jobs.ts`·`lib/worker.ts`, jobs unit |
| 7 | 세션 API·결과 재검증 | 신규 Route Handler, route unit |
| 8 | 팀장 단회 내부 확인·member 거절 | `review_sales_task`, SQL·브라우저 403/409 |
| 9 | 한국어 화면·4초 상태 폴링·실패 안내 | `components/sales-review.tsx`, 빌드·브라우저 |
| 10 | 게스트 무쓰기·데모 직접 화면 차단 | page `is_demo_department` 검사, 게스트 E2E·SQL |
| 11 | 로컬 SQL·단위·브라우저·lint·build 실행 기록 | 검증 문서와 완료 화면 |

**설계 대조 11/11 = 100%**. Plan 성공 기준 4/4를 로컬 합성 범위에서 충족했다. 이 수치는 구현 계약의 일치율이며 실제 고객 정책의 적합성이나 운영 준비도를 뜻하지 않는다.

## Iterate

첫 브라우저 반복 실행에서 `setSelectedId`와 목록 fetch가 엇갈려 새 작업 대신 이전 작업이 선택됐다. 새 작업 ID를 `load(preferredId)`에 전달하고 브라우저 테스트에 새 첫 작업의 선택 assertion을 추가했다. 최종 빌드·실제 모델·브라우저 완주와 스크린샷으로 재확인했다. 인용 없는 우선순위/차액 요약 표시도 제거해 사실 문장이 모두 출처 링크와 함께 나오게 했다.

## 범위·도구 한계

Graft·Archify 도구가 제공되지 않아 도구별 산출물은 0건이다. 파일 수동 추적과 design Mermaid를 검토 기록에 남겼다. 격리 PGlite는 pg_cron migration을 제외했으며, 로컬 QA E2E는 worker HTTP 트리거를 직접 호출했다. 실제 자료 연결과 운영 적용은 범위 밖이다.
