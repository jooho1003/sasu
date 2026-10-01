---
template: plan
version: 1.3
feature: sales-review-condition-checklist
date: 2026-10-01
---

# sales-review-condition-checklist Plan

원천: [PRD AG-06·§8](../../PRD.md) → [ARCHITECTURE](../../ARCHITECTURE.md) → [ADR-079](../../ADR.md). bkit plan 템플릿의 절을 사용하며 새 제품 결정은 원천 문서에만 둔다.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 네 원문에서 검토할 조건을 직접 찾아야 한다. |
| Solution | AG-06의 주제별 원문 줄·확인 질문을 제공한다. |
| Function/UX Effect | 팀장이 관련 문구에서 원문을 열어 조건을 확인한다. |
| Core Value | 현재 권한의 정확한 인용으로 사람의 검토를 돕는다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 선택한 원문의 조건 찾기 |
| WHO | 동의한 비데모 부서 팀장 |
| RISK | 키워드를 의미 판정으로 오해하거나 부정어·예외를 잘라냄 |
| SUCCESS | 정확한 전체 줄·현재 권한·한도·실패 후 이전 결과 제거 검증 |
| SCOPE | AG-06 읽기 전용 주제별 인용·고정 질문 |

## 1. Overview

목적·배경은 PRD AG-06과 ADR-079를 따른다. phase 38·39의 네 원문 선택을 재사용한다.

## 2. Scope

포함은 AG-06의 순수 모듈, POST, 원문 연결 화면, 실행 검증이다. 제외는 PRD §8·ADR-079의 생성형 의미 판정·저장·사업상 승인·발송이다.

## 3. Requirements

| ID | 매핑 | 대조 |
|---|---|---|
| FR-01 | AG-04·AG-06 | 현재 세션 네 원문·lead·동의·비데모 |
| FR-02 | AG-06·ADR-079 | 고정 단어·전체 줄·정확 인용·링크 |
| FR-03 | AG-06 | 주제·역할별 3건과 전체 수·빈 주제 안내 |
| FR-04 | AG-06 | 원문·줄 수·줄 길이 초과 422, 전체 거절 |
| FR-05 | AG-06 | 선택 변경·실패 후 이전 결과 숨김 |

비기능은 ARCHITECTURE 불변식: `can_see()` 단일 가시성, 요청 경로 service role 0, 로그 원문 0, 게스트 쓰기·LLM 0.

## 4. Success Criteria

- [x] 신규 lib 테스트 red→green, 단어 경계·부정어·한도·반례 통과.
- [x] API 현재 권한·변조·삭제·오류·no-store 통과.
- [x] 격리 인증 브라우저 인용·링크·주제·이전 결과 제거, 게스트·영업 회귀 통과.
- [x] lint·Webpack build·단위 및 [실행 기록](../../verification/sales-review-condition-checklist-2026-10-01.md), PDCA 12/12 일치.

## 5. Risks and Mitigation

ADR-079의 판정 오해는 키워드 탐색 설명·고정 질문으로, 인용 손실은 전체 줄·한도 거절로, 권한 변경은 매 POST 세션 조회로 대응한다.

## 6. Impact Analysis

원문 연결 화면→새 세션 POST→기존 원문 검증→새 순수 모듈→기존 evidence 링크. SQL·job·LLM 계약 변경 없음. Graft·Archify 제공 여부와 실제 사용 범위는 검증 기록에 남긴다.

## 7. Rollout

격리 로컬 QA와 문서 보고까지. 운영 적용은 PRD §8의 별도 승인 절차를 따른다.
