# Step 0: 실제 영업 자료 AI 문단 선택·확인 질문

읽기: docs/PRD.md AG-07·§8·§11, docs/ARCHITECTURE.md §6-10, ADR-080, docs/AI-DEVELOPMENT.md, docs/01-plan/features/sales-source-ai-review.plan.md, docs/02-design/features/sales-source-ai-review.design.md.

설계 D1~D12 순서대로 구현한다. 순수·pipeline 모듈은 테스트 먼저 red 기록. 0068은 로컬 격리 DB만 적용한다. 현재 RLS 원문/버전 검증과 task+job/finish를 SQL에 둔다. 기존 sources UI에 비동기 컴포넌트와 private API를 연결한다. 실제 Groq 합성 자료 실행, 전체 단위·SQL·인증/모바일 E2E·기존 회귀·lint/build를 실행하고 docs/verification/sales-source-ai-review-2026-10-01.md에 기록한다. analyze/report 후 summary/index 상태를 갱신한다.

현재 Graft/Archify 도구·CLI 미노출. 구현 전 관계: SalesReviewSources→sources/checklist/compare/session RLS, worker→jobs→합성 sales-review pipeline, answer-grounding→paragraphSpans/resolveSelections, llm→contracts. 설계 Mermaid로 예정 변경 흐름을 검토했다. 실제 Graft/Archify 결과가 없음을 요약에 명시한다. 운영 배포는 phase41 범위 밖.
