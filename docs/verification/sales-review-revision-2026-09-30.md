# phase 37 합성 영업 재검토 실행 기록 — 2026-09-30

대상: [PRD AG-03](../PRD.md), [ADR-076](../ADR.md), [설계](../02-design/features/sales-review-revision.design.md), [step 0](../../phases/37-sales-review-revision/step0.md). 실제 고객 자료·운영 DB는 사용하지 않았다.

## 실행 결과

| 검증 | 결과 |
|---|---|
| SQL | `node scripts/verify-security-sql.mjs "$env:TEMP\\sasu-pglite-phase36"`: 격리 PGlite **289 pass, 0 fail**. 재검토 부모/사유·멱등 충돌·한도·과거 null 사유·동의/RLS·append-only 확인. PGlite 패키지만 기존 임시 설치를 재사용했고 DB는 새 인메모리 인스턴스다. |
| 로컬 DB | `node scripts/review-qa.mjs setup`으로 격리 QA DB에 migration 0067 적용, `npx supabase migration up --local`로 로컬 개발 DB에도 0067 적용. 운영 DB 미적용. |
| 단위·정적 | `npm run test`: **162 files, 1,719 tests pass**. `node scripts/review-qa.mjs build`: Next.js 16.3.4 빌드·TypeScript 통과. `npm run lint`: 종료 코드 0, 문구 차단 0·기존 경고 80. `git diff --check`: 종료 코드 0. |
| 인증 브라우저 | 최종 QA 프로덕션 빌드 서버에서 기존 검토 `sales-review-test` **1/1**, reject(schedule)→연결 재검토→별도 lead 확인 `sales-review-revision-test` **1/1**. [완료 화면](sales-review-revision-2026-09-30.png)을 육안 확인했다. |
| 게스트 | `node scripts/review-qa.mjs guest-test`: **5/5**. 실부서 접근 거절·게스트 열람 전후 AI 호출/DB 행 증가 없음. |
| QA DB 조회 | 격리 QA DB 직접 조회: `tasks=10, ready=10, revisions=2`; `actions=8, rejections_with_reason=2`; `llm_calls=10` (`sales_quote_review`). 여러 반복 실행의 누적이며 최종 E2E의 단일 결과 수가 아니다. |

첫 재실행의 새 E2E는 부서 이름 고정값이 이전 실행과 충돌해 실패했다. 테스트 fixture 이름에 무작위 부서 ID 일부를 붙인 뒤 재실행해 통과했다. 기존 검토 E2E는 팀원 화면 목록 로딩 5초 제한으로 한 번 실패했다. 생성한 작업 ID를 명시적으로 선택하고 로딩을 기다리도록 고친 후 최종 빌드에서 통과했다. 실패 실행을 통과 수에 넣지 않았다.

별도 `node scripts/review-qa.mjs rls-test`는 **7/8** 통과했다. 실패 1건은 기존 `search_topic_items_as` 상태질문 fixture의 lead 전용 기록 검색 결과가 빈 배열인 경우다(`tests/rls/rls.test.ts:147`). QA DB 직접 조회에서 그 항목의 내용은 `합성 팀장 자료입니다.`였고, 테스트 검색어 `외주사/견적/인상`을 포함하지 않았다. 이 phase가 변경한 SQL 함수·테이블은 격리 보안 SQL 289건에서 통과했으며, 전체 live RLS suite 성공으로 기록하지 않는다.

## 코드 관계와 구조 검토

`components/sales-review.tsx` → 세션 review POST → `review_sales_task(p_task,p_action,p_reason)` → append-only `sales_review_actions`; 구성원 revision POST → `request_sales_review_revision(p_dept,p_parent,p_request_id)` → 부모 사유/부서/동의/한도 확인 → 연결 task+job → 기존 worker·`llm.structured`·고정 S1~S4 인용 검증 → 세션 GET/RLS → 새 lead 행동. [설계 Mermaid](../02-design/features/sales-review-revision.design.md#2-architecture-options)가 이 순서를 나타낸다.

Graft·Archify 호출 도구는 이 세션에 제공되지 않아 실제 도구 그래프·SVG는 0건이다. 위 관계는 파일/함수 수동 추적이며 설계 Mermaid를 도구 결과로 주장하지 않는다.

## 경계

- 원문·견적 금액·시작일·영업 정책은 수정하지 않았다. 고객 발송과 실제 가격/계약 승인은 없다.
- 운영 migration·배포는 하지 않았다. 로컬 합성 사례와 모델 호출만 검증했다.
- PGlite는 `0004_worker_cron.sql`을 실행하지 않았다. 브라우저에서는 `/api/jobs/run`으로 기존 worker를 직접 실행했다.

[PDCA 분석](../03-analysis/sales-review-revision.analysis.md) · [보고](../04-report/features/sales-review-revision.report.md)
