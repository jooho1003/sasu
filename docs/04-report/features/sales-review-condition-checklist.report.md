---
template: report
version: 1.1
feature: sales-review-condition-checklist
date: 2026-10-01
---

# sales-review-condition-checklist Completion Report

> **Status**: Complete — AG-06 개발·격리 로컬 검증 완료, 운영 미반영
>
> **Project**: 사수 (SASU) · **Version**: 0.1.0
>
> **Author**: Codex · **Completion Date**: 2026-10-01 · **PDCA Cycle**: phase 40

원천: [PRD AG-06·§8·§11](../../PRD.md) → [ARCHITECTURE](../../ARCHITECTURE.md) → [ADR-079](../../ADR.md). 이 보고서는 상위 문서의 범위와 [실행 기록](../../verification/sales-review-condition-checklist-2026-10-01.md)을 따른다.

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | 실제 부서 원문의 영업 조건 확인 질문 |
| Start Date / End Date | 2026-10-01 / 2026-10-01 |
| Duration | 해당 날짜의 개발·검증 사이클 |
| Scope | 현재 권한의 네 원문에서 가격·일정·계약·승인 관련 줄과 고정 질문을 읽기 전용으로 표시 |

### 1.2 Results Summary

계획 성공 기준 **4/4 충족**, 설계 대조 **12/12 = 100%**. 전체 단위 **168파일·1,748/1,748**, 신규 인증 E2E **2/2**, 기존 회귀 **9/9**를 통과했다. `npm run lint`와 Webpack 프로덕션 빌드는 종료 0이다. lint에는 기존 경고 80개가 남는다.

100%는 AG-06 구현과 설계의 일치율이다. 실제 고객 문서의 업무 정확도나 검토 효용을 나타내지 않는다.

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 팀장이 선택한 고객 요청·기존 견적·변경 견적·원칙에서 관련 조건을 직접 찾아야 했다. |
| **Solution** | 현재 세션으로 네 원문을 재검사하고, 고정 단어가 있는 전체 줄을 정확한 인용·직접 링크와 함께 네 주제로 묶었다. |
| **Function/UX Effect** | 역할별 앞 3개 줄과 전체 수, 인용 있는 주제의 고정 질문을 제공한다. 로컬 E2E 2건에서 원문 연결·선택 변경·권한 회수 후 표시 제거와 390px 화면을 검증했다. |
| **Core Value** | 로컬 합성 입력에서 현재 권한을 지키는 인용과 사람의 원문 확인 경로를 검증했다. 실제 고객의 업무 성과는 미검증이다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|---|---|
| SC-1 | 신규 lib TDD·단어 경계·부정어·한도·반례 | 충족 | 신규 모듈 import red 확인 후 lib/route 2파일·15/15 green |
| SC-2 | 현재 API 권한·변조·삭제·오류·no-store | 충족 | route 단위와 실제 demo/미동의 403·타 부서 404·비활성/권한 회수 검사 |
| SC-3 | 격리 인증 UI·인용·링크·이전 결과 제거·게스트/영업 회귀 | 충족 | 신규 E2E 2/2·기존 회귀 9/9·데스크톱/390px 화면·DB 전후 조회 |
| SC-4 | lint·build·전체 단위·실행 기록·PDCA 90% 이상 | 충족 | lint 0·Webpack build 0·1,748/1,748·설계 12/12·실행 기록 |

**Success Rate: 4/4 (100%)**. 각 실행 결과의 명령과 증거는 [검증 기록](../../verification/sales-review-condition-checklist-2026-10-01.md)에 연결한다.

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|---|---|---|---|
| PRD AG-04·AG-06 | 동의한 비데모 lead의 현재 열람 가능한 서로 다른 네 원문만 처리 | 예 | 세션 RLS와 최신 원문 검사를 재사용하고 demo·미동의·member·타 부서 요청을 거절 |
| ADR-079 | 고정 단어·전체 줄 인용·고정 질문으로 한정 | 예 | 네 주제의 단어 탐색과 정확한 인용만 제공, 부정어·예외를 보존 |
| Plan FR-03·FR-04 | 앞 3건·전체 수·빈 주제 안내·한도 초과 전체 거절 | 예 | 반복 횟수와 제한을 표시하고 모든 입력의 한도를 검사해 422 반환 |
| Design §2·§7·§9 | 순수 lib·세션 POST·기존 UI, 저장·LLM 없이 구현 | 예 | DB·job·LLM 계약 변경 없이 기존 원문 화면에 결과 연결 |
| Design §5·§6 | 선택 변경·실패 시 이전 결과 제거, 기존 멤버십 이동 계약 유지 | 예 | UI 상태 제거 검증, 리다이렉트와 route 반환 JSON의 오류 보장 범위 명확화 |

## 2. Related Documents

| Phase | Document | Status |
|---|---|---|
| Plan | [계획](../../01-plan/features/sales-review-condition-checklist.plan.md) | 확정 |
| Design | [설계](../../02-design/features/sales-review-condition-checklist.design.md) | 확정 |
| Check | [분석](../../03-analysis/sales-review-condition-checklist.analysis.md) | 완료 |
| Act | 본 보고서 | 완료 |
| Verification | [실행 기록](../../verification/sales-review-condition-checklist-2026-10-01.md) | 기록 |
| Harness | [phase 40 step](../../../phases/40-sales-review-condition-checklist/step0.md) | 주 세션 완료 기록과 연결 |

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-01 | 현재 세션 네 원문·lead·동의·비데모 | 완료 | AG-04 최신 상태 검사 재사용 |
| FR-02 | 고정 단어·전체 줄·정확 인용·링크 | 완료 | 한국어 포함·영문 대소문자 무시 단어 경계 |
| FR-03 | 주제·역할별 3건·전체 수·빈 주제 안내 | 완료 | 인용 없는 주제는 question=null, 조건 부재를 단정하지 않음 |
| FR-04 | 원문·줄 수·줄 길이 한도 초과 전체 422 | 완료 | 100,000 UTF-16 코드 단위·2,000개 비어 있지 않은 줄·줄당 2,000 Unicode 문자 |
| FR-05 | 선택 변경·실패 후 이전 결과 숨김 | 완료 | 원문·문구 비교·체크리스트 상태 제거 |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved | Status |
|---|---|---|---|
| 권한 | 세션 RLS·can_see() 단일 판정 | 요청 service role·가시성 복제 없음 | 충족 |
| 무저장·LLM | 제품 경로 쓰기·LLM 0 | jobs 534→534, llm_calls 293→293, tasks 12→12, actions 10→10 | 충족 |
| 게스트 격리 | 직접 POST 거절·기존 게스트 유지 | 실제 demo lead 403·기존 게스트 회귀 5건 포함 | 충족 |
| 원문 보호 | 원문 로그 없음·JSON private/no-store | 고정 오류·캐시 헤더·응답 제한 검사 | 충족 |
| 화면 | 한국어·모바일 결과 열람 | 데스크톱과 390px 화면 확인·가로 넘침 없음 | 충족 |

### 3.3 Deliverables

| Deliverable | Location |
|---|---|
| 순수 탐색 모듈 | [lib](../../../lib/sales-review-condition-checklist.ts) |
| 세션 API | [route](../../../app/api/d/[dept]/sales-review/checklist/route.ts) |
| 기존 원문 선택 화면 확장 | [component](../../../components/sales-review-sources.tsx) |
| 단위·route 테스트 | [lib test](../../../tests/sales-review-condition-checklist.test.ts), [route test](../../../tests/sales-review-condition-checklist-route.test.ts) |
| 인증 브라우저 테스트 | [E2E](../../../tests/e2e/sales-review-condition-checklist-local.spec.ts) |
| 화면·DB·접근 거절 증거 | [검증 기록](../../verification/sales-review-condition-checklist-2026-10-01.md) |

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

AG-06 완료 범위의 미해결 기능 차이는 없다. 실제 고객 문서의 업무 적합성·생성형 의미 해석은 별도 계약과 평가가 필요한 후속 범위다. 운영 배포는 수행하지 않았으며 별도 사용자 승인 절차를 유지한다.

### 4.2 Cancelled/On Hold Items

Graft·Archify가 제공되지 않아 전후 코드 그래프와 Archify 산출물을 만들지 못했다. 실제 파일 의존 추적과 설계 Mermaid로 검토했으며 도구 실행 결과로 계산하지 않는다. Turbopack 빌드는 최적화 단계에서 중단해 완료 여부가 미검증이다. 프로덕션 빌드는 Webpack으로 통과했다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Target | Final |
|---|---|---|
| Design Match Rate | 90% 이상 | 12/12 = 100% |
| Plan Success Criteria | 4개 충족 | 4/4 |
| 대상 단위 | 통과 | 15/15 |
| 전체 단위 | 통과 | 168파일·1,748/1,748 |
| 신규 인증 E2E | 통과 | 2/2 |
| 기존 회귀 | 통과 | 9/9 |
| lint | 종료 0 | 종료 0·기존 경고 80 |
| 프로덕션 빌드 | 완료 | Webpack 컴파일·TypeScript·정적 생성 성공, 종료 0 |

정적 구조·기능·API 계약과 주 세션의 런타임 결과를 [분석](../../03-analysis/sales-review-condition-checklist.analysis.md)에서 대조했다. 독립 gap-detector는 핵심 구현 누락·보안 우회를 발견하지 않았으며 테스트는 실행하지 않았다. 코드 커버리지와 실제 업무 정확도는 측정하지 않았다.

### 5.2 Resolved Issues

| Issue | Resolution | Result |
|---|---|---|
| 멤버십 리다이렉트와 JSON 오류 보장 범위 혼재 | 설계 §6에서 기존 멤버십 계약과 반환 JSON을 구분 | 명확화 |
| 실제 demo 직접 POST 검증 부족 | demo lead·미동의 lead의 실세션 E2E 추가 | 모두 403·topics 미반환 |
| 프록시가 max-age=0을 더해 캐시 헤더 정확 문자열 비교 실패 | private/no-store 포함을 검사하고 신규 E2E 전체 재실행 | 최종 2/2, 초기 실패는 통과 수에 미포함 |

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

기존 AG-04 원문 검사를 재사용해 현재 상태 검증을 유지했다. 전체 줄과 명시적 한도는 부정어·예외를 잘라 내지 않는 계약을 테스트 가능하게 했고, 선택 변경·권한 회수 뒤 UI까지 확인해 이전 결과 표시를 검증했다.

### 6.2 What Needs Improvement (Problem)

그래프 도구 산출물과 실제 고객 문서 평가가 없다. 기본 Vitest와 Turbopack의 지연 원인은 확정하지 못했다. 기존 lint 경고 80개도 이번 범위에서 해결하지 않았다.

### 6.3 What to Try Next (Try)

실문서 평가가 승인되면 업무 기준과 반례를 먼저 정의하고, 키워드 탐색의 누락·과잉 탐색을 별도로 측정한다. 생성형 해석은 근거·권한·폐기 계약을 확정한 뒤 별도 PDCA로 다룬다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

설계의 오류 응답 범위에는 공통 인증 helper의 이동·예외 계약을 함께 적는다. 분석에는 정적 검토와 실제 실행 주체를 구분하고, 완료율과 업무 효용 지표를 혼동하지 않는다.

### 7.2 Tools/Environment

Graft·Archify가 사용 가능해지면 다음 구조 변경에서 실제 전후 산출물을 남긴다. 지연 원인이 확인될 때까지 기본 Vitest/Turbopack 중단과 대체 실행 조건을 검증 기록에 보존한다.

## 8. Next Steps

### 8.1 Immediate

phase 40 개발·로컬 검증 결과를 검토한다. 운영 적용은 PRD §8의 별도 승인 뒤 진행한다. 이번 보고는 배포 완료를 뜻하지 않는다.

### 8.2 Next PDCA Cycle

실제 고객 문서 적합성 평가 또는 생성형 검토 확장은 다음 범위를 결정한 뒤 별도 계획·설계로 진행한다. 키워드 확인 질문만으로 원칙 충돌·조건 충족·사업상 승인·고객 발송을 판단하지 않는다. 이미 열린 원문에 대한 실시간 철회 채널은 추가하지 않았다.

## 9. Changelog

### phase 40 (2026-10-01)

**Added:** 현재 원문의 네 주제별 인용·고정 질문, 세션 checklist POST, 단위·실세션 E2E와 실행 기록.

**Changed:** 기존 원문 선택 화면에 조건 확인 버튼과 결과를 추가하고 선택 변경·재요청 실패 시 이전 결과를 제거.

**Verified:** 로컬 합성 입력에서 현재 권한·정확 인용·한도·무쓰기·기존 흐름 회귀. LLM·결과 저장·DB migration·운영 배포 없음.

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | 2026-10-01 | AG-06 완료 보고·실행 결과·미검증 경계 기록 | Codex |
