# Phase 35 step 0 — 영업 에이전트 합성 사례 설계 검증

입력: [PRD AG-01·§8](../../docs/PRD.md), [ADR-074](../../docs/ADR.md), [plan](../../docs/01-plan/features/sales-agent-design.plan.md), [design](../../docs/02-design/features/sales-agent-design.design.md), [합성 사례](../../docs/planning/영업_에이전트_합성_사례.md). 설계 문서를 전부 읽고 진행한다.

1. 합성 S1~S4와 기대 검토안을 대조한다. 예시 인용이 각 원문에 글자 그대로 있는지, 총액 차액이 6,000,000원인지, 사업상 초안과 확정 정책이 구분되는지 확인한다.
2. 설계의 권한·승인·실패 사례를 PRD/ADR 불변식과 대조한다. 특히 `can_see()` 단일 판정, 세션에서 부서/사용자 결정, 팀장 승인 버전 고정, 외부 발송 없음, 게스트 무쓰기를 확인한다.
3. 후속 구현 후보 모듈과 실제 확인이 필요한 영업 정책·팀장 계정·자료 범위를 분리한다. Graft·Archify 도구가 없으면 실행했다고 기록하지 않는다.
4. 실제 검증 명령·결과와 누락 범위를 `docs/verification/sales-agent-design-2026-09-30.md`에 남긴다. 그 뒤 `/pdca analyze sales-agent-design`와 `/pdca report sales-agent-design`에 설계 산출물만 반영한다.

이 step은 **설계 검증**이다. 기능 코드, DB 시드, 실제 고객 자료, 운영 배포는 실행하지 않는다.
