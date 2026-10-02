---
template: report
version: 1.1
feature: sales-source-review-history
date: 2026-10-01
---

# sales-source-review-history Completion Report

> **Status**: Complete — phase 42 개발·격리 로컬 검증 완료, 운영 미반영
>
> **Project**: 사수 (SASU) · **Version**: 0.1.0 · **Author**: Codex
>
> **Completion Date**: 2026-10-01 · **PDCA Cycle**: phase 42

원천: [PRD AG-08·§8·§11](../../PRD.md) → [ARCHITECTURE §6-11](../../ARCHITECTURE.md) → [ADR-081](../../ADR.md). 범위와 판정 근거는 [최종 실행 기록](../../verification/sales-source-review-history-2026-10-01.md)을 따른다. phase 41·42 모두 운영 미반영이다.

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | 본인 실자료 검토 이력·현재 근거 재열람 |
| Start Date / End Date | 2026-10-01 / 2026-10-01 |
| Duration | 해당 날짜의 개발·검증 사이클 |
| Scope | 동의한 비데모 lead 본인의 기존 작업 목록·상세 읽기 |

### 1.2 Results Summary

계획 성공 조건 **4/4**, 설계 D1~D8 **8/8 = 100%**. 전체 단위 **172파일·1,788/1,788**, SQL **308/308**와 권한 조합 **2,016건**, lint·최종 React lint·격리 Webpack 빌드를 통과했다. 기존 lint 경고 80개는 남는다.

최종 재검사는 **4/4**로 기존 실제 모델 회귀 1건과 신규 이력 3건을 통과했다. 기존 13개 회귀는 최초 **12통과·1실패**였고, 실패 시나리오의 새 요청 재실행이 통과했다. 따라서 기존 13개 각각의 최종 통과와 신규 3개를 합한 **16개 시나리오**를 확인했으며, 기존 회귀 13/13을 한 번에 통과한 결과는 아니다.

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 화면을 떠난 뒤 기존 실자료 검토를 다시 찾는 경로가 없어 작업 ID를 기억하거나 새 검토를 요청해야 했다. |
| **Solution** | 본인·부서·현재 원문 RLS로 최신순 목록을 조회하고, 기존 상세 API와 인용 복원을 읽기 모드로 재사용한다. 새 테이블·스냅샷·모델 호출은 추가하지 않았다. |
| **Function/UX Effect** | 20건씩 더 보기·5상태·다시 열기/닫기·현재 인용·원문 링크와 열린 결과로 초점/화면 이동을 제공한다. 신규 인증 E2E 3건에서 재접속·동일 시각 20+2·390px·권한/응답 순서·조회 종료를 검증했다. |
| **Core Value** | 로컬 합성 작업에서 모델 재호출 없이 현재 근거를 다시 확인하고 읽기 전후 쓰기 0을 검증했다. 실제 고객의 시간 절감·업무 효용은 미평가다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|---|---|
| SC1 | API 형식·guard·순서·커서·최소 응답·오류 | 충족 | 없는 Route import red→목록/기존 상세 25/25 green, 신규 목록 13건·strict paired cursor·같은 시각 keyset·no-store |
| SC2 | 격리 인증 재접속·20건+더 보기·상태·원문·390px | 충족 | 최종 신규 이력 3/3, 같은 microsecond 작업 22개·20+2·UUID 내림차순·5상태·정확 인용·초점/viewport |
| SC3 | 현재 원문/권한 숨김·지연 회복·읽기 쓰기 0 | 충족 | 변경/삭제/비활성/원칙/동의/역할·목록/상세 차단, 30초/2분·늦은 응답·A404/B보존, runtime JSON count 불변 |
| SC4 | lint/build/unit/SQL·영업/게스트 회귀·독립 분석 | 충족 | unit 1,788·SQL308+2,016·lint/build 성공, 기존 13개 각각 최종 통과·독립 정적 검토 |

**Success Rate: 4/4 (100%)**. [분석](../../03-analysis/sales-source-review-history.analysis.md)의 8/8 판정과 최종 코드·실행 기록을 대조했고 중요한 미해결 정적 간극을 발견하지 않았다. 테스트 실행은 주 세션이 수행했으며 독립 검토자는 별도 테스트를 실행하지 않았다.

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|---|---|---|---|
| PRD AG-08 | 현재 볼 수 있는 본인 작업을 20건씩 최신순 재열람 | 예 | 현재 RLS·owner/dept 필터, created_at/id 내림차순 커서와 최소 메타데이터 |
| ARCH §6-11·ADR-081 C안 | 전용 목록 Route·기존 상세 복원 재사용 | 예 | 기존 0068 권한 검사와 AI GET 그대로 사용, 새 schema/RPC 없음 |
| PRD §8·Plan NFR1 | 열람 task/job/LLM 쓰기·스냅샷·영속 브라우저 저장 0 | 예 | 읽기 모드 POST 차단, 분리한 읽기 측정 구간에서 행 수 불변 |
| Design D3·D4 | 현재 상태 재확인·오래된 표시 제거·조회 시간/응답 순서 보호 | 예 | focus/갱신 초기화·key 재마운트·30초/2분 watchdog·abort 검사·늦은 오류 반례 통과 |
| Design D3 | 열린 결과로 키보드 초점·화면 이동 | 예 | 의미 있는 section·tabIndex/ref·effect focus/scroll, focused/inViewport E2E 통과 |

## 2. Related Documents

| Phase | Document | Status |
|---|---|---|
| Plan | [계획](../../01-plan/features/sales-source-review-history.plan.md) | 확정 |
| Design | [설계](../../02-design/features/sales-source-review-history.design.md) | 확정 |
| Check | [분석](../../03-analysis/sales-source-review-history.analysis.md) | 완료 |
| Act | 본 보고서 | 완료 |
| Verification | [최종 실행 기록](../../verification/sales-source-review-history-2026-10-01.md) | 기록 |
| Harness | [목록 step](../../../phases/42-sales-source-review-history/step0.md), [재열람 step](../../../phases/42-sales-source-review-history/step1.md), [검증 step](../../../phases/42-sales-source-review-history/step2.md) | 주 세션 index/summary와 연결 |

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR1 | 세션 최신순 20건·커서 더 보기 | 완료 | 21행 sentinel, microsecond 시각과 UUID로 동일 시각 페이지 중복/누락 방지 |
| FR2 | 기존 상세·진행·무근거·실패 재열람 | 완료 | initialTaskId 읽기 모드·현재 인용/질문/링크·새 검토는 원문 선택 흐름 |
| FR3 | 원문/권한·focus·응답 순서에서 표시 제거 | 완료 | 갱신/포커스·다른 선택·더 보기 오류·취소/시간초과에 오래된 표시 제거 |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved |
|---|---|---|
| 현재 권한 | 기존 RLS·본인/부서·lead/동의/비데모 | 목록/상세에서 현재 권한·본문 hash·원문 상태 재검사 |
| 최소 응답 | ID·created_at·status, 제외 수/본문 없음 | strict 커서·20건·next_cursor, 목록 본문/총수/제외 수 미반환 |
| 무쓰기 | 열람 task/job/LLM 생성 0 | 일반 읽기 전후 reviews24/tasks21/jobs555/llm310 동일, 회수 후 읽기도 jobs558→558 포함 동일 |
| 실패 회복 | 영구 대기·오래된 표시 없음 | 목록 30초·상세 2분 watchdog, 최신 요청만 적용·조회 재시도 가능 |
| 화면 | 한국어·키보드·390px | KST·5상태·초점/화면 이동·모바일 가로 넘침 없음 |

위 count는 [runtime JSON](../../verification/sales-source-review-history-2026-10-01-runtime.json)의 **읽기 측정 구간**이다. 원문 fixture 수정으로 기존 classify job이 만들어지는 구간은 분리했고, 전체 테스트 동안 jobs가 항상 555개였다고 주장하지 않는다.

### 3.3 Deliverables

| Deliverable | Location |
|---|---|
| 세션 목록 API | [history Route](../../../app/api/d/[dept]/sales-review/history/route.ts) |
| 본인 이력 UI | [history component](../../../components/sales-source-review-history.tsx) |
| 기존 상세 읽기 모드·화면 연결 | [AI component](../../../components/sales-source-ai-review.tsx), [sales-review](../../../components/sales-review.tsx) |
| 목록/API 검사 | [route test](../../../tests/sales-source-review-history-route.test.ts) |
| 인증·통신·늦은 응답 검사 | [history E2E](../../../tests/e2e/sales-source-review-history-local.spec.ts) |
| 화면·count·실행 증거 | [검증 기록](../../verification/sales-source-review-history-2026-10-01.md) |

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

AG-08 기능 범위의 중요한 미해결 설계 차이는 없다. 실제 고객 업무 효용·SLA·부하·branch coverage는 측정하지 않았다. 기존 실제 모델 회귀의 최초 timeout 원인은 확보하지 못했으며, 새 요청 재실행 성공을 원인 해소로 판정하지 않는다.

phase 41·42는 운영 미반영이다. 적용 시 0068과 phase 41 worker/UI부터 함께 검토·검증하는 별도 단계가 필요하다.

> 2026-10-02 갱신: phase 41·42는 PR #24 병합(10/1 22:12 KST)으로 자동 운영 배포됐고, 0068은 10/2 20:33 KST에 적용됐다. 경위는 [운영 기록](../../verification/desktop-companion-production-2026-10-02.md)에 있다. 로그인 lead의 운영 흐름은 아직 확인하지 않았다.

### 4.2 Cancelled/On Hold Items

Graft·Archify MCP/CLI 미노출로 실제 그래프·렌더 산출물이 없다. import/호출 추적과 설계 Mermaid로 확인한 범위만 기록했다. SQL WASM은 pg_cron/pg_net 미지원으로 기존 0004를 제외했으며 cron 운영 검증을 수행한 것으로 계산하지 않는다. Python 하네스 실행기는 실행하지 않고 주 세션에서 step 순서로 직접 구현·검증했다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Final |
|---|---|
| 설계 일치율 / 성공 기준 | D1~D8 8/8 = 100% / SC1~SC4 4/4 |
| 목록·기존 상세 API | 25/25, 신규 목록 13건 |
| 전체 단위 | 172파일·1,788/1,788 |
| SQL·권한 조합 | 308/308·2,016건 |
| 신규 이력 E2E | 최종 3/3, 14.4초/3.6초/1.8초 |
| 최종 재검사 묶음 | 기존 실제 모델 1 + 신규 이력 3 = 4/4, 30.9초 |
| 기존 회귀 | 최초 12통과·1실패, 실패 시나리오 새 요청 재실행 1/1(9.2초) |
| lint·React lint | 종료 0·blocking 0, 기존 warnings 80 |
| 격리 Webpack 빌드 | 종료 0·compile 64초·TypeScript 32.5초·static 38건 |

최종 `phase42-recheck.log`, 최초 `phase42-regression.log`, `phase42-build-release-final.log`, lint/unit/SQL 로그를 [실행 기록](../../verification/sales-source-review-history-2026-10-01.md)과 대조했다. 설계 일치율은 최초 회귀 성공률·실고객 정확도·branch coverage가 아니다. E2E/컴파일 시간도 제품 SLA가 아니다.

API 3-way는 설계·서버·클라이언트 모두 GET history의 optional paired cursor→`{tasks,next_cursor}`, 기존 GET ai의 task_id→현재 상세로 대응한다. 이력 모드에서 POST/새 검토 버튼은 없으며 작업 결과는 기존 현재 원문 복원을 사용한다.

### 5.2 Resolved Issues

| Issue | Resolution | Result |
|---|---|---|
| 취소한 A 상세의 늦은 403/404가 B 현재 결과 제거 | POST/poll JSON 직후 abort 검사를 오류 콜백 앞에 배치 | abort를 무시한 늦은 A404 반례에서 B·목록 유지 |
| 열린 wrapper가 ARIA region으로 열람되지 않음 | div→의미 있는 section, 초점/화면 이동 추가 | 결과 region·focused/inViewport 최종 E2E 통과 |
| 삭제 검사 뒤 합성 fixture의 비워진 본문 미복원 | 테스트에서 본문도 복원, fixture classify job 계수/정리 분리 | 제품 SQL 변경 없이 최종 이력 E2E 통과 |
| 초기 렌더 시각/취소된 목록 timer 경계 | Date.now를 effect로 이동·timeout aborted guard | React lint와 종료/늦은 응답 E2E 통과 |

기존 모델 회귀는 최초 100초 안에 ready가 나타나지 않았고 task는 processing, 모델 호출 기록은 2,284ms였다. 중간 실패 코드가 없어 연결·출력·완료 처리 어느 원인인지 확정하지 않았다. 이 사례는 위 해결된 제품 결함 목록에 포함하지 않는다. 자동 Next build lock 충돌도 다른 프로세스를 종료하지 않고 기존 격리 빌드 경로로 검증했으며 실패 기록을 보존했다.

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

기존 권한·상세 복원을 재사용해 모델 재호출이나 스냅샷 없이 재방문 경로를 만들었다. 같은 시각 페이지와 취소를 무시한 늦은 오류를 실제 반례로 검사해 정렬·응답 순서 계약을 확인했다.

### 6.2 What Needs Improvement (Problem)

모델 회귀의 최초 processing 지연은 중간 코드를 확보하지 못했다. fixture 삭제/복원과 트리거 job을 읽기 무쓰기 측정과 섞으면 결과를 잘못 해석할 수 있었다. 기존 lint 경고 80개는 남는다.

### 6.3 What to Try Next (Try)

비동기 회귀에서 실패가 발생하면 원문을 로그에 남기지 않으면서 task/job 안전 상태를 보존해 원인 판별 근거를 확보한다. 읽기 전후 측정은 fixture 변경과 분리하고 키보드 초점·결과 위치를 브라우저 완료 조건에 포함한다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

최초 실패·새 요청 재실행·최종 성공을 별도 기록하고 재실행 성공만으로 제품 원인 수정이나 한 번의 전체 통과를 주장하지 않는다. 독립 검토에서 찾은 간극은 수정 코드·재빌드·실행 반례까지 연결한다.

### 7.2 Tools/Environment

Graft·Archify가 제공되면 다음 구조 변경에서 실제 산출물을 남긴다. 격리 빌드와 SQL 제외 범위는 운영 검증과 구분해 유지한다.

## 8. Next Steps

### 8.1 Immediate

주 세션에서 phase index/summary·로컬 커밋을 마무리한다. 운영 적용은 별도 사용자 지시와 검증 후 진행하며, 이번 보고는 배포 완료를 뜻하지 않는다.

### 8.2 Next PDCA Cycle

실제 사용 피드백이 준비되면 목록 탐색과 업무 적합성을 평가한다. 검색·공유·확인 기록·업무 승인·발송은 이번 범위에 없다. 이미 열린 결과의 원문/권한 변화는 갱신·focus·후속 요청에서 재검사하며 실시간 철회 push는 제공하지 않는다.

## 9. Changelog

### phase 42 (2026-10-01)

**Added:** 본인 현재 작업 메타데이터 목록·같은 시각 keyset 더 보기·기존 결과 재열람·인증/지연/무쓰기 검증 기록.

**Changed:** 기존 AI 상세에 initialTaskId 읽기 모드를 추가하고 영업 화면에 독립 이력을 연결, 열린 결과로 초점/화면 이동.

**Fixed:** 취소된 상세의 늦은 오류가 현재 결과를 지우는 응답 순서 경계와 조회 timeout 처리.

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | 2026-10-01 | 최종 SC4/4·D8/8·읽기 count·실패/재실행·검증 한계 기록 | Codex |
