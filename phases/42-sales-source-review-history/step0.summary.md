# Step 0 — history-api

- PRD AG-08·§8·§11, ARCHITECTURE §6-11, ADR-081 → PDCA plan/design → 이 step 순서로 진행했다.
- 세션 GET history Route: 본인/부서·현재 RLS, 20행+sentinel·시각/ID keyset·엄격한 두 필드 커서·최소 메타데이터·private/no-store.
- API 테스트 선행 import red 뒤 신규13·기존상세12, 25/25 통과. 새 lib/SQL/RPC 없음.
- history API→세션 table SELECT→기존 sales_source_review_inputs RLS 호출. Graft/Archify 미노출; 실제 파일 import/호출 추적과 설계 Mermaid만 확인했다.
- 최종 명령·로그: [검증 기록](../../docs/verification/sales-source-review-history-2026-10-01.md). 다음 step은 source AI GET/원문 복원 계약을 유지한다.
