# Phase 38 step 0 — 실제 부서 원문을 영업 검토 화면에 연결

읽기: [PRD AG-04·§8](../../docs/PRD.md), [ADR-077](../../docs/ADR.md), [plan](../../docs/01-plan/features/sales-review-source-connection.plan.md), [design](../../docs/02-design/features/sales-review-source-connection.design.md), AGENTS.md, 설치된 Next.js route/page 가이드.

1. 현재 합성 검토 화면·세션 API·`items`/`sources` RLS 관계를 확인한다. Graft·Archify가 없으면 수동 관계와 누락을 기록한다.
2. `lib/sales-review-sources.ts`는 테스트를 먼저 작성해 ID·원칙·인용 부분 문자열을 검증한다.
3. GET/POST 세션 route에서 lead·동의·비데모를 확인하고, 현재 RLS로 읽은 활성·미삭제 원문 4건만 응답한다. 원문 선택을 저장하지 않는다.
4. 화면에 실제 원문 선택·대조·원문 링크를 추가한다. 합성 실행·재검토는 그대로 유지한다.
5. 단위·route·인증 브라우저·게스트·lint/build를 실행하고 `docs/verification/`에 결과를 기록한다. `/pdca analyze sales-review-source-connection` 90% 미만이면 수정한 뒤 `/pdca report`를 작성한다.

운영 배포는 이 step에 포함하지 않는다. 기존 미추적 `supabase/.gitignore`·`supabase/config.toml`은 건드리지 않는다.
