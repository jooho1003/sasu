# Phase 36 step 0 — 합성 영업 검토 내부 기능

읽기: [PRD AG-02·§8](../../docs/PRD.md), [ADR-075](../../docs/ADR.md), [plan](../../docs/01-plan/features/sales-agent-review.plan.md), [design](../../docs/02-design/features/sales-agent-review.design.md), [합성 사례](../../docs/planning/영업_에이전트_합성_사례.md), AGENTS.md, Next 설치본 관련 문서.

1. 현재 `can_see()`·jobs·llm·멤버십·내비게이션 관계를 확인하고 수동 의존 목록을 검증 기록에 남긴다. Graft·Archify가 없으면 누락을 적는다.
2. SQL migration에 작업/검토 RLS·RPC와 거절/한도/중복 검증을 만들고 격리 DB 테스트를 실행한다.
3. 새 `lib/` 모듈은 테스트 먼저 작성한 뒤 구현한다. 모델 출력은 enum 선택만 받고 코드가 합성 근거 문장을 만든다.
4. 요청/검토 API와 워커·2분 sweep, 한국어 화면을 연결한다. 게스트 경로에 쓰기/LLM을 추가하지 않는다.
5. 기능 SQL·단위·브라우저·lint·build를 실행해 `docs/verification/sales-agent-review-2026-09-30.md`에 실제 결과·누락 범위를 남긴다. `/pdca analyze sales-agent-review` 90% 미만이면 수정 후 재분석, 그 뒤 `/pdca report`를 작성한다.

운영 migration·배포는 이 step에 포함하지 않는다. `scripts/execute.py`는 다른 미커밋 파일을 함께 stage할 수 있으므로 이 작업에서는 수동으로 파일을 한정한다.
