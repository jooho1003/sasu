# Phase 37 step 0 — 합성 검토 돌려보내기와 연결 재검토

읽기: [PRD AG-03·§8](../../docs/PRD.md), [ADR-076](../../docs/ADR.md), [plan](../../docs/01-plan/features/sales-review-revision.plan.md), [design](../../docs/02-design/features/sales-review-revision.design.md), [phase 36 검증](../../docs/verification/sales-agent-review-2026-09-30.md), AGENTS.md, 설치된 Next.js 관련 가이드.

1. 현재 `sales_review_tasks/actions`·`request_sales_review`·`review_sales_task`·jobs·GET/UI 관계를 확인한다. 도구가 없으면 Graft/Archify 누락과 수동 관계를 기록한다.
2. migration 0067에 reason_code, revision_of, 같은 부서 FK, lead review RPC, 재검토 RPC를 만들고 격리 SQL에서 권한·멱등·한도·append-only를 확인한다.
3. 기존 API와 새 revision API를 세션/RLS로 연결하고 모델·근거 생성 계약을 바꾸지 않는다. 바뀌는 `lib/` 계약은 관련 테스트를 먼저 작성한다.
4. 한국어 UI에서 사유 선택·원본 불변 안내·재검토·부모 링크·새 행동을 구현한다.
5. 로컬 SQL·단위·인증 브라우저·게스트·lint·build를 실행하고 `docs/verification/sales-review-revision-2026-09-30.md`에 결과를 남긴다. `/pdca analyze sales-review-revision` 90% 미만이면 수정·재검사하고 `/pdca report`를 작성한다.

운영 migration·배포는 이 step에 포함하지 않는다. 사용자 미추적 `supabase/.gitignore`·`supabase/config.toml`은 건드리지 않는다.
