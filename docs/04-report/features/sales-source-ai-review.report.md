---
template: report
version: 1.1
feature: sales-source-ai-review
date: 2026-10-01
---

# sales-source-ai-review Completion Report

> **Status**: Complete — phase 41 개발·격리 로컬 검증 완료, 운영 미반영
>
> **Project**: 사수 (SASU) · **Version**: 0.1.0 · **Author**: Codex
>
> **Completion Date**: 2026-10-01 · **PDCA Cycle**: phase 41

원천: [PRD AG-07·§8·§11](../../PRD.md) → [ARCHITECTURE](../../ARCHITECTURE.md) → [ADR-080](../../ADR.md). 이 보고서는 상위 문서의 범위와 [최종 실행 기록](../../verification/sales-source-ai-review-2026-10-01.md)을 따른다. phase 38~40의 [운영 반영](../../verification/sales-source-tools-production-2026-10-01.md)과 phase 41 완료를 구분한다.

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | 선택한 네 실제 자료의 AI 문단 선택·근거 인용·확인 질문 |
| Start Date / End Date | 2026-10-01 / 2026-10-01 |
| Duration | 해당 날짜의 개발·검증 사이클 |
| Scope | 동의한 비데모 lead 본인의 비동기 검토, 현재 원문·권한·버전 검증 |

### 1.2 Results Summary

계획 성공 기준 **4/4 충족**, 설계 D1~D12 **12/12 = 100%**. 최종 전체 단위 **171파일·1,775/1,775**, 격리 SQL **308/308**와 권한 조합 **2,016건**, 신규 E2E **2/2**, 기존 회귀 **11/11**, 실제 Groq 합성 사례 **3/3**를 통과했다. lint와 Webpack 프로덕션 빌드는 종료 0이며 기존 lint 경고 80개가 남는다.

100%는 AG-07 설계와 구현의 일치율이다. 실제 고객 문서의 관련성·업무 정확도·효용 수치는 측정하지 않았다.

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 단어 탐색 뒤에도 팀장이 고객 요청·두 견적·원칙의 문맥에서 확인할 문단을 직접 찾아야 했다. |
| **Solution** | 기존 Groq structured 호출로 문단 번호만 선택하고 코드가 현재 원문 전체 인용과 고정 질문을 복원한다. SQL 공통 검사는 요청·처리·읽기·완료에서 권한과 본문 버전을 확인한다. |
| **Function/UX Effect** | 생성·진행·근거 결과·무근거·실패·재시도를 제공한다. 신규 E2E 2건에서 원문 연결·390px·변경 후 숨김과 POST/GET 응답 보류 시 2분 종료·잠금 해제를 검증했다. |
| **Core Value** | 로컬 합성 입력에서 현재 근거로 사람이 확인하는 경로와 원문 무복제 계약을 검증했다. 실제 고객의 업무 성과는 미평가다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|---|---|
| SC1 | TDD 원문 복원/거절·범위·엄격 스키마 | 충족 | pure/pipeline import red→green, CRLF·전체 문단·부정어·중복/범위·추가 문장/필드 거절 검사 |
| SC2 | 격리 SQL 현재권한·버전·폐기·한도·완료 | 충족 | SQL 308건·권한 조합 2,016건, 요청/claim/RLS/finish·본문 변경·terminal/2분·KST 한도 검사 |
| SC3 | 인증·모바일 E2E, 게스트·기존 영업 회귀 | 충족 | watchdog 수정 후 재빌드·신규 2/2·기존 11/11, ready→원문·재선택·403/404·실패/무근거·390px·응답 보류 |
| SC4 | lint/build/full unit·실제 Groq 합성 선택·증거 | 충족 | lint/build 종료 0·171파일/1,775건·Groq 정상/무관련/출력 조작 사례 3건·실행 기록 |

**Success Rate: 4/4 (100%)**. 테스트는 주 세션이 실행했다. 독립 gap-detector/report 검토자는 코드·최종 로그·기록을 읽고 대조했으며 별도 테스트를 실행하지 않았다.

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|---|---|---|---|
| PRD AG-07 | 네 자료의 주제별 문단 범위만 선택, 질문은 고정 문구 | 예 | 최대 4주제·주제당 4자료·총 16인용, 무근거 주제 미렌더·전체 무근거 refused |
| ADR-080 C안 | 합성 검토와 분리한 전용 task·SQL 검사 | 예 | sales_source_reviews/run_sales_source_review 신설, 기존 합성 작업·결정 원장 유지 |
| PRD §8·Design D2/D6 | 현재 권한·본문 hash 검사, 원문/생성 문장 무복제 | 예 | 공통 SQL·본인 RLS·worker 전용 RPC, task 결과에 선택 번호만 저장 |
| Plan FR3·Design D5 | 원자 task/job·멱등·KST 10건·2분·늦은 완료 차단 | 예 | SQL 완료 조건과 jobs 실패/sweep 배선, terminal 상태 재개 방지 |
| Design D4 | 선택/다른 도구/오류 시 이전 결과 제거·최대 2분 진행 | 예 | 컴포넌트 해제·abort·독립 watchdog, 응답 보류 재실행 통과 |

## 2. Related Documents

| Phase | Document | Status |
|---|---|---|
| Plan | [계획](../../01-plan/features/sales-source-ai-review.plan.md) | 확정 |
| Design | [설계](../../02-design/features/sales-source-ai-review.design.md) | 확정 |
| Check | [분석](../../03-analysis/sales-source-ai-review.analysis.md) | 완료 |
| Act | 본 보고서 | 완료 |
| Verification | [최종 실행 기록](../../verification/sales-source-ai-review-2026-10-01.md) | 기록 |
| Harness | [phase 41 step](../../../phases/41-sales-source-ai-review/step0.md), [summary](../../../phases/41-sales-source-ai-review/step0.summary.md) | 주 세션 index/완료 기록과 연결 |

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR1 | 현재 네 자료·전체 문단 검증 | 완료 | 전체 원문 20,000 UTF-16 코드 단위·80문단·문단 4,000 코드 단위, 초과 전체 422 |
| FR2 | SQL 공통 권한·버전·요청자 본인 | 완료 | can_see·lead/동의/비데모·동일 부서·활성/미삭제·원칙·hash 재검사 |
| FR3 | task/job·멱등·10건·2분 정리 | 완료 | 원자 생성, 동일 요청 변조 거절, 재시도 실패 매핑·sweep·조건부 finish |
| FR4 | 진행/무근거/실패·원문 링크·재선택 | 완료 | 새 request_id 재시도, 현재 자료로 인용 복원, 응답 정지에도 2분 후 잠금 해제 |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved |
|---|---|---|
| 원문 무복제 | task/job/log에 원문·인용 복사본·자유 문장 없음 | IDs/hash/선택 번호 저장, structured 단일 경로 사용 |
| 권한 단일화 | SQL can_see 재사용·현재 상태 검사 | 사용자 API 세션, service role은 worker 내부만 사용 |
| 게스트·기존 흐름 | 새 기능 차단·회귀 유지 | SQL demo 거절·기존 게스트/영업 회귀 11건 통과 |
| 실패 회복 | 영구 스피너 없음·terminal 보호 | POST/GET 보류 watchdog·jobs 실패·2분 sweep·늦은 finish 차단 |
| 화면 | 한국어·390px 열람 | 전체 문단·링크·모바일 가로 넘침 없음 확인 |

### 3.3 Deliverables

| Deliverable | Location |
|---|---|
| SQL task/RLS/RPC | [0068 migration](../../../supabase/migrations/0068_sales_source_reviews.sql) |
| 번호 검증·인용 복원 | [pure module](../../../lib/sales-source-review.ts) |
| 비동기 모델 실행 | [pipeline](../../../lib/pipeline/sales-source-review.ts), [jobs](../../../lib/jobs.ts), [worker](../../../lib/worker.ts) |
| 세션 POST/GET | [API](../../../app/api/d/[dept]/sales-review/ai/route.ts) |
| 결과·진행 화면 | [component](../../../components/sales-source-ai-review.tsx), [부모 UI](../../../components/sales-review-sources.tsx) |
| 단위·API·pipeline·브라우저 | [pure test](../../../tests/sales-source-review.test.ts), [route test](../../../tests/sales-source-review-route.test.ts), [pipeline test](../../../tests/pipeline/sales-source-review.test.ts), [E2E](../../../tests/e2e/sales-source-ai-review-local.spec.ts) |
| 화면·모델·실행 증거 | [검증 기록](../../verification/sales-source-ai-review-2026-10-01.md) |

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

AG-07 개발·격리 검증 범위의 미해결 기능 차이는 없다. 실제 고객 자료의 관련성·업무 적합성 평가는 자료가 준비된 뒤 별도로 수행한다. phase 41과 0068은 운영에 반영하지 않았으며 운영 적용은 별도 승인·검증 단계다.

### 4.2 Cancelled/On Hold Items

Graft·Archify MCP/실행 파일을 사용할 수 없어 실제 전후 그래프·렌더 산출물은 없다. import/호출 추적과 설계 Mermaid로 관계를 검토하고 도구 누락을 기록했다. SQL WASM 검증은 pg_cron/pg_net 미지원으로 기존 0004를 제외했으며 cron 운영 검증을 한 것으로 주장하지 않는다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Target | Final |
|---|---|---|
| 설계 일치율 | 90% 이상 | D1~D12 12/12 = 100% |
| 성공 기준 | 4개 충족 | SC1~SC4 4/4 |
| 전체 단위 | 통과 | 171파일·1,775/1,775 |
| SQL·권한 조합 | 통과 | 308/308·2,016건 |
| 신규 E2E | 통과 | 2/2, 최종 전체 10.6초 |
| 기존 회귀 | 통과 | 11/11 |
| 실제 Groq 합성 | 통과 | 정상·무관련·출력 조작 3/3 |
| lint/build | 종료 0 | lint 0·기존 경고 80, Webpack 컴파일/TypeScript/정적 38페이지 성공 |

최종 로그 `phase41-e2e-final.log`, `phase41-regression.log`, `phase41-unit-final.log`, `phase41-sql-final.log`, `phase41-build-final.log`, `phase41-lint-final.log`의 결과를 읽고 [분석](../../03-analysis/sales-source-ai-review.analysis.md)과 대조했다. D4/D10의 이전 partial은 watchdog 코드와 최종 E2E 2/2로 해소됐으며 **12/12 판정에 이의가 없다**. branch coverage·정확도 비율·제품 SLA는 측정하지 않았다. 실제 흐름 8.7초와 mocked 오류/보류 1.1초는 해당 테스트 실행 시간이다.

API 3-way는 설계·서버·클라이언트 모두 POST 네 IDs+request_id→202 task_id, GET task_id→`{task:{id,status,result}}`로 일치한다. ready는 현재 입력으로 정확한 전체 인용과 고정 질문을 복원하며, 현재 작업/원문이 무효이면 403/404로 이전 표시를 제거한다.

### 5.2 Resolved Issues

| Issue | Resolution | Result |
|---|---|---|
| fetch 응답이 끝나지 않으면 2분 제한에 도달하지 못함 | POST 시작부터 독립 watchdog, POST/poll abort·task/creating 제거 | 재빌드 뒤 GET/POST 응답 보류·121초 clock E2E 통과, 선택 잠금 해제 |
| 초기 E2E에서 원문 연결 전에 역할 변경·이름 없는 combobox 선택 | 연결 완료 대기·역할별 이름으로 선택 | 최종 인증 E2E 통과 |
| 3회 job 실패의 사용자 상태 연결 확인 필요 | 전용 failure-owner 매핑 검사 추가 | 최종 전체 단위 1,775건에 포함 |

초기 실패 기록은 [실행 기록](../../verification/sales-source-ai-review-2026-10-01.md)에 남겼다. 최종 통과 건수에 초기 실패 실행을 더하지 않는다.

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

모델은 번호만 선택하고 코드가 원문을 복원하도록 분리해 자유 문장·인용 복제 없이 기능을 검증했다. 공통 SQL 검사를 요청·RLS·worker·finish에 적용해 현재 권한과 변경된 원문의 결과 노출을 차단했다.

### 6.2 What Needs Improvement (Problem)

정상 polling 응답의 시간 검사만으로는 통신 정지를 다룰 수 없었다. 실제 고객 자료 평가는 없고 그래프 도구 산출물도 누락됐다. 기존 lint 경고 80개는 이번 범위에서 해결하지 않았다.

### 6.3 What to Try Next (Try)

비동기 UI의 완료 조건에는 응답 보류도 포함하고 독립 종료 타이머를 검증한다. 실문서 평가를 시작할 때는 주제 관련성·예외 문단 보존·무근거 사례의 평가 기준을 먼저 정의한다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

정적 리뷰에서 발견한 완료 경계는 수정 코드의 재빌드·재실행까지 연결한다. 모델 합성 사례의 통과와 실제 고객 업무 정확도를 별도 항목으로 기록한다.

### 7.2 Tools/Environment

Graft·Archify가 사용 가능해지면 다음 구조 변경에서 실제 산출물을 남긴다. 로컬 SQL 환경의 제외 migration과 Webpack 빌드 조건은 검증 기록에 유지한다.

## 8. Next Steps

### 8.1 Immediate

phase 41 개발 결과와 0068·worker·UI를 함께 검토한다. 운영 적용은 별도 사용자 승인과 적용 검증 후 진행한다. 이 보고서는 phase 41 운영 검증이나 배포 완료를 뜻하지 않는다.

> 2026-10-02 갱신: PR #24 병합(10/1 22:12 KST)이 Vercel Git 연동으로 바로 운영 배포됐고, 0068은 10/2 20:33 KST에 운영 DB에 적용됐다. 그 사이 워커가 멈췄던 경위와 복구는 [운영 기록](../../verification/desktop-companion-production-2026-10-02.md)에 있다. 로그인 lead의 운영 흐름과 실고객 자료 적합성은 아직 확인하지 않았다.

### 8.2 Next PDCA Cycle

실제 고객 문서가 준비되면 별도 관련성·업무 적합성 평가를 수행한다. 가격 계산·원칙 충돌 단정·사업상 승인·고객 발송은 이번 기능에 없다. 이미 열린 결과의 권한 변경은 **focus/후속 요청**에서 재검사하며 실시간 철회 push는 제공하지 않는다.

## 9. Changelog

### phase 41 (2026-10-01)

**Added:** 전용 AI 문단 선택 task·SQL 공통 권한/버전 검사·worker·세션 POST/GET·근거 복원·검토 UI·단위/SQL/E2E/합성 모델 증거.

**Changed:** 기존 원문 선택 화면에 비동기 검토를 연결하고 다른 도구·선택 변경·현재권한 오류 시 결과를 제거.

**Fixed:** POST/GET 응답 정지에도 2분 후 요청을 중단하고 진행 상태·부모 선택 잠금을 해제.

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | 2026-10-01 | 최종 watchdog 재실행·4/4 기준·12/12 설계·검증 경계 기록 | Codex |
