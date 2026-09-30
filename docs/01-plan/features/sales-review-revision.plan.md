---
template: plan
version: 1.3
feature: sales-review-revision
project: sasu
date: 2026-09-30
---

# sales-review-revision Planning Document

> 원천: [PRD AG-03·§8](../../PRD.md), [ADR-076](../../ADR.md), [phase 36 검증](../../verification/sales-agent-review-2026-09-30.md). 이 문서는 매핑용이다.

## Executive Summary

| Perspective | Content |
|---|---|
| Problem | 합성 검토안을 돌려보내도 다음 검토가 어느 작업에서 나왔는지 연결되지 않는다. |
| Solution | 팀장이 고정 사유를 남기고, 구성원이 부모 작업과 연결된 새 task+job을 요청한다. |
| Function/UX Effect | 가격/일정 사유에 해당하는 확인 질문을 먼저 본 뒤 새 결과를 따로 내부 확인한다. |
| Core Value | 실제 견적을 연결하기 전에 재검토와 승인 비승계 경계를 검증한다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 돌려보낸 결과와 다음 검토의 관계가 보이지 않는다. |
| WHO | 동의한 비데모 부서 구성원과 lead |
| RISK | 예전 내부 확인의 승계 오인, 타 부서 부모 지정, 재요청 중복 |
| SUCCESS | reject→연결 재검토→새 결과→새 내부 확인 완주, SQL 거절·멱등 검증 |
| SCOPE | 고정 S1~S4, 사유 price/schedule, 새 작업 링크, 로컬 검증 |

## 1. Overview

AG-03의 합성 검토 후속 동선을 구현한다. 자료·가격·고객 회신은 실제로 수정하지 않는다.

## 2. Scope

- 포함: reject 사유, parent task 링크, 재검토 SQL RPC/세션 API, 질문 순서 UI, 팀장 새 행동, 권한/멱등/한도/게스트 테스트.
- 제외: 원문·견적 수정, 자유 피드백, SSO 전용 초점, 실자료·외부 발송, 운영 migration/배포.

## 3. Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | lead만 ready 작업을 price/schedule 사유로 단회 돌려보낸다 | High |
| FR-02 | 동의한 같은 부서 멤버가 reject 부모에서 새 task+job을 원자 생성한다 | High |
| FR-03 | 새 task의 focus는 부모 사유이고 이전 행동은 승계되지 않는다 | High |
| FR-04 | 10건/일, 멱등, 권한 변경, demo, 타 부서, 승인 부모를 거절한다 | High |
| FR-05 | 화면은 원본 불변·새 내부 확인 필요를 분명히 표시한다 | High |

비기능: 요청 경로 service role 0, `can_see()` 단일 가시성, 자유 텍스트 저장 0, 게스트 LLM/쓰기 0.

## 4. Success Criteria

- [ ] 격리 SQL에서 lead/member/타 부서/미동의/demo, reject 사유, 부모 검증, 멱등/한도, append-only를 검사한다.
- [ ] 세션 API·UI에서 reject→재검토→새 결과→별도 확인을 브라우저로 완주한다.
- [ ] 모델은 기존 enum만 쓰고 새 사실·가격을 생성하지 않는다.
- [ ] lint·build·단위·게스트 회귀가 통과하고 실행 기록과 PDCA 대조를 남긴다.

## 5. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| 재검토가 견적 수정을 암시 | 고정 원문 불변 안내, 결과의 같은 quote/차액 검증 |
| 이전 확인 승계 | task별 action unique, 새 task에 action 없음 |
| 타 부서 parent 주입 | SQL의 부모 dept=세션 부서 및 `can_see()` 검사 |
| 재요청 폭주 | 기존 10건/일·멱등·job 원자성 재사용 |

## 6. Impact and Rollout

변경 대상: migration 0067, 기존 검토 RPC·GET/POST, 재검토 POST, 화면, 계약 enum, SQL/Route/E2E. 기존 카드·ASK·게스트 기능은 변경 대상이 아니다. 로컬/격리 검증까지 수행하고 운영은 별도 결정한다.
