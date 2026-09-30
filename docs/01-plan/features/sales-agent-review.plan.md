---
template: plan
version: 1.3
feature: sales-agent-review
project: sasu
date: 2026-09-30
---

# sales-agent-review Planning Document

> 원천: [PRD AG-02·§8](../../PRD.md), [ADR-075](../../ADR.md). phase 35의 [합성 사례](../../planning/영업_에이전트_합성_사례.md)를 입력으로 쓴다. 이 문서는 PDCA 매핑용이다.

## Executive Summary

| Perspective | Content |
|---|---|
| Problem | 영업 견적 변경 검토 설계가 문서에만 있고, 담당자 요청·근거 결과·팀장 확인을 실제 제품에서 이어서 볼 수 없다. |
| Solution | 고정 합성 사례 하나에 대해 인증 사용자의 내부 검토 작업·job·팀장 검토 기록을 만든다. |
| Function/UX Effect | 담당자가 초점을 고르면 비교·원칙·질문·회신 초안을 보고 팀장이 승인/반려를 남긴다. |
| Core Value | 실제 고객 데이터를 열기 전에 근거와 사람 승인 경계가 작동하는지 확인한다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 합성 검토 동선을 제품에서 검증해야 한다. |
| WHO | 인증·동의한 비데모 부서 구성원과 팀장 |
| RISK | 요청 경로 service role, 인용 없는 문장, 팀장 승인 의미 오인 |
| SUCCESS | 작업 생성→job→인용 결과→팀장 기록 완주, RLS·게스트·실패 경계 통과 |
| SCOPE | 고정 S1~S4, 세 가지 초점, 내부 검토만, 운영 미반영 |

## 1. Overview

PRD AG-02를 구현한다. 실제 자료 연결은 사용자가 선택한 합성 범위에 없다. phase 35 교차 검토 D1~D5는 ADR-075의 고정 입력·코드 작성 문장·합성 승인으로 해결한다.

## 2. Scope

- 포함: SQL 작업/검토 기록과 RPC·RLS, 구조화 모델 선택과 검증된 결과 조립, 작업 API/화면, 팀장 승인/반려, 실패 정리, 합성 및 권한 테스트.
- 제외: 실제 영업 자료, 임의 업로드/지시문, 고객 발송, 견적 수정, 결정 원장 등록, 게스트 쓰기·LLM, 운영 DB/배포.

## 3. Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | 인증·동의·비데모 멤버만 하루 10건 내에서 합성 검토 작업 생성 | High |
| FR-02 | 요청 트랜잭션이 task와 job을 만들고 워커가 구조화 선택·고정 근거 결과를 저장 | High |
| FR-03 | 모든 사실 문장에 합성 원문의 정확한 quote, 금액은 코드 계산 | High |
| FR-04 | 팀장만 내부 승인/반려를 append-only로 기록, 새 요청은 별개 | High |
| FR-05 | 권한 상실·모델 실패·2분 초과·게스트·중복 요청/검토를 안전하게 처리 | High |

비기능: 사용자 요청 경로 service role 0, `can_see()` 단일 가시성, 마스킹·로그 원문 금지, 2분 실패 정리, 한국어 UI.

## 4. Success Criteria

- [ ] SQL 격리 테스트에서 member/lead/타 부서/미동의/데모, 한도, 중복 검토와 append-only 통과.
- [ ] 새 `lib/` 테스트 선행 후 고정 문장·인용·산술·모델 선택 검증 통과.
- [ ] 브라우저에서 생성→결과→팀장 검토 완주 및 게스트 쓰기/LLM 0 확인.
- [ ] lint·build·단위·E2E 통과와 실행 증거 기록, PDCA analyze 90% 이상.

## 5. Risks and Mitigation

| Risk | Mitigation |
|---|---|
| 모델 문장이 근거를 벗어남 | 모델 출력은 enum 선택으로 제한, 문장·quote는 코드 생성 |
| 승인 의미를 실제 고객 승인으로 오인 | “합성 연습·내부 확인·발송 안 됨” UI 고정 |
| 오래된 job 결과가 실패/승인 상태를 덮음 | SQL 상태 조건·단회 검토·2분 sweep |
| 누군가 다른 부서 결과를 조회 | RLS `can_see()`와 요청/검토 RPC 검증 |

## 6. Impact Analysis

변경 대상은 `jobs` 종류/실패 매핑·worker 등록, `llm` 목적, 부서 내비게이션, 신규 SQL 테이블·RPC/화면이다. 기존 ASK·S8·게스트 경로는 계약을 바꾸지 않는다. `jobs` 소비자와 부서 내비게이션 회귀를 확인한다. Graft·Archify 도구가 없으면 수동 의존 목록과 Mermaid 구조만 기록하고 도구 실행으로 주장하지 않는다.

## 7. Rollout

로컬/격리 SQL→단위→브라우저 검증까지 수행한다. 운영 DB migration·배포는 별도 승인과 순서 확인 후 진행한다.
