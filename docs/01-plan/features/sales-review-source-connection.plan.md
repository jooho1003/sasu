---
template: plan
feature: sales-review-source-connection
project: sasu
date: 2026-09-30
---

# sales-review-source-connection Plan

원천: [PRD AG-04·§8](../../PRD.md), [ADR-077](../../ADR.md), [ARCHITECTURE](../../ARCHITECTURE.md). 이 문서는 구현 대조 목록이다.

## Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| 합성 S1~S4 밖의 실제 부서 원문을 영업 화면에서 고를 수 없다 | 동의한 비데모 부서 lead | 타 부서/권한 회수/삭제 원문 노출, 원칙 오지정 | 현재 권한의 4건 선택→원문 대조·링크, 회수 후 거절 | 읽기 전용 원문 연결 |

## Success Criteria

1. 현재 세션의 부서 lead가 `items` 4건을 각각 지정하고 원문과 직접 링크를 본다.
2. 원칙 ID는 활성 `is_principles` 소스의 원문이다. 중복·타 부서·미삭제 조건 위반은 거절한다.
3. member·미동의·demo·익명은 사용할 수 없고 게스트 쓰기/LLM은 증가하지 않는다.
4. 원문 삭제·소스 비활성화 또는 권한 변경 뒤 같은 ID 요청은 거절한다.
5. 고정 합성 검토와 운영 게스트 동선이 회귀하지 않는다.

## Analyze Comparison List

- 화면: `/d/[dept]/sales-review` 실제 원문 선택 영역.
- API: `GET/POST /api/d/[dept]/sales-review/sources`.
- 모듈: `lib/sales-review-sources.ts` 검증·미리보기 계약.
- 기존 SQL/RLS: `items`, `sources`, `can_see()` 재사용. migration/job 없음.
- 검증: 단위 TDD, route 권한·원문 상태 테스트, lint/build, 인증 브라우저·게스트.
