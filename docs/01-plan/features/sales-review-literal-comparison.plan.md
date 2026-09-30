---
template: plan
feature: sales-review-literal-comparison
project: sasu
date: 2026-09-30
---

# sales-review-literal-comparison Plan

원천: [PRD AG-05·§8·§11](../../PRD.md), [ARCHITECTURE](../../ARCHITECTURE.md), [ADR-078](../../ADR.md). 이 문서는 구현 대조 목록이다.

## Executive Summary / Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| phase 38의 네 원문을 나란히 본 뒤 견적 문구 차이를 수동으로 찾아야 한다 | 동의한 비데모 부서 팀장 | 권한이 바뀐 원문 노출, 긴 문서 일부만 비교하고 전체처럼 주장 | 현재 RLS 재검사·정확한 인용·반복 건수·크기 거절 | 읽기 전용 문자 그대로의 비교 |

## 1. 범위와 완료 조건

1. 팀장은 phase 38에서 고른 같은 네 ID로 기존·변경 견적의 추가/제거 문구를 본다. 고객 요청·원칙은 확인 맥락으로 함께 보인다.
2. 각 문구는 해당 현재 원문에 정확히 포함되고 원문 링크가 있다. 동일 문구가 여러 번 나오면 등장 횟수 차이를 반영한다.
3. 최대 8건씩 보이고 전체 문구 조각 수를 표시한다. 비교 한도 초과는 422로 거절한다.
4. 팀원·미동의·데모·타 부서·삭제·비활성 소스는 결과를 받을 수 없다. 결과 저장·LLM 호출·고객 발송은 없다.
5. 기존 합성 검토와 게스트 경로가 회귀하지 않는다. 실제 문서의 사업상 의미·금액 계산은 완료 판정에 넣지 않는다.

## 2. Analyze Comparison List

- 화면: `components/sales-review-sources.tsx`의 문구 차이와 원문 링크.
- API: `POST /api/d/[dept]/sales-review/compare`.
- 모듈: `lib/sales-review-literal-comparison.ts`의 조각화·반복 차이·인용 검증.
- 기존 SQL/RLS: `items`, `sources`, `can_see()` 재사용. migration/job 없음.
- 검증: TDD, route 권한·한도, 격리 인증 브라우저, 게스트·합성 회귀, lint/build.
