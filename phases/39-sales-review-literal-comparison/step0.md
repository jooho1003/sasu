# Phase 39 step 0 — 실제 견적 원문의 문구 차이

읽기: [PRD AG-05·§8·§11](../../docs/PRD.md), [ADR-078](../../docs/ADR.md), [plan](../../docs/01-plan/features/sales-review-literal-comparison.plan.md), [design](../../docs/02-design/features/sales-review-literal-comparison.design.md), AGENTS.md, 설치된 Next.js Route Handler 가이드.

1. phase 38 원문 선택·세션 API·`items`/`sources` RLS 관계를 확인한다. Graft·Archify가 없으면 실제 파일 관계와 누락을 기록한다.
2. 새 `lib/` 비교 모듈의 테스트를 먼저 작성하고 실패를 확인한 뒤, 반복 문구·긴 줄·한도·정확한 인용을 구현한다.
3. 새 세션 route에서 네 ID를 매번 다시 읽고 AG-04 조건·현재 RLS로 검증한 뒤 비교 결과를 돌려준다. 원문이나 결과는 저장하지 않는다.
4. 화면에서 문구 차이·전체 건수·원문 링크를 확인한다. 기존 합성 검토는 분리한다.
5. 단위·route·인증 브라우저·게스트·합성·lint/build를 실행하고 `docs/verification/`에 증거를 기록한다. `/pdca analyze sales-review-literal-comparison` 90% 미만이면 보완하고 `/pdca report`를 작성한다.

운영 배포는 이 step에 포함하지 않는다. 기존 미추적 `supabase/.gitignore`·`supabase/config.toml`은 건드리지 않는다.
