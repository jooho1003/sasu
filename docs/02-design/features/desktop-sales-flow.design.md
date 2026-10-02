# desktop-sales-flow — Design

2026-10-03 · bkit PDCA · [Plan](../../01-plan/features/desktop-sales-flow.plan.md)
원천 PRD §3-8 DC-16·§8 → ARCHITECTURE §6-12 → ADR-086.

## Context Anchor

| Key | Value |
|---|---|
| WHY | 영업 검토 시작·진행·결과 열기의 회복 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 POST·중첩 폴링·이탈 후 링크/읽음 |
| SUCCESS | SC1~6 실행 증거와 독립 U1~8/S1~2 대조 |
| SCOPE | PRD DC-16·§8 / ARCHITECTURE §6-12 / ADR-086 |

## 1. Overview

기존 일 맡기기의 영업 검토 renderer를 보완한다. 상태/권한/원문/작업 실행은 기존 서버를 따른다. 아래 10개 목록과 SC1~6이 독립 analyze 대상이다.

## 2. Architecture Options

| 안 | 영향 | 선택 |
|---|---|---|
| A 기존 state/ref/cleanup | 제품 2파일·계약 재사용 | ADR-086 선택 |
| B 범용 hook/캐시 | 새 추상화·저장 경로 | 보류 |
| C 새 task API/outbox | 서버/권한/자동 실행 영향 | 제외 |

App workKey→WorkTab→WorkSalesReview→기존 sales.sources/start/status·app.openWeb→onSeen(current). 일 맡기기 nav 클릭은 같은 탭에도 key를 바꾸어 자식 cleanup을 실행한다. 각 await 뒤 요청 세대/current를 검사하며 발신 화면·세션 종료 후 후속 웹 열기/읽음/notice를 시작하지 않는다. 자료 effect의 개발 StrictMode setup 재실행에서는 현재 mounted view가 진행 중인 읽기를 이어받아 단일 요청과 로딩/잠금 종료를 보존한다. 실제 화면 종료 뒤 이전 인스턴스의 응답은 계속 폐기한다.

## 3. Data Model

기존 candidate(item_id,title,kind,quote,is_principles), start(task_id), status(queued/processing/ready/refused/failed,web_path)를 유지한다. 메모리에 후보/조회 상태/4역할 선택/선택별 request_id/task_id/status/조회·시작·열기 잠금/세대만 둔다. 새 SQL·로컬 영구 캐시 없음. source candidate quote를 새 답으로 렌더하지 않는다.

## 4. API Specification

E14 sales.sources(), E15 sales.start({request_item_id,old_quote_item_id,new_quote_item_id,policy_item_id,request_id}), E16 sales.status(task_id), 기존 app.openWeb(web_path), onSeen(id,stillCurrent?)만 사용한다. 실제 route/parse 계약과 3-way 대조한다. E15 `request_id`는 같은 선택의 실패 후 retry에서 재사용하고 선택 변경/명시 새 검토에서 새 시도를 만든다. 서버가 현재 source·role·task 소유/멱등을 판정한다. main/preload·IPC·서버 계약 변경 없음.

## 5. UI/UX Checklist

| ID | 비교 항목 |
|---|---|
| U1 | ‘영업 원문 검토’·자료 loading/empty/error를 구분한다. ‘자료 다시 불러오기’를 제공하고 조회 중 연타는 1flight다. 오류의 오래된 후보/결과를 숨긴다. |
| U2 | 고객 요청·기존 견적·변경 견적·원칙 native label/select 4개. 현재 후보 ID 4개가 모두 있고 distinct여야 시작한다. 원칙은 is_principles만. 시작 중 후보 조회/선택 변경을 동결한다. |
| U3 | ‘검토 시작하기’ ref 잠금·진행 안내·1POST. 실패는 선택 보존/자동 재전송 없음. 같은 선택 retry 같은 request_id, 선택 변경 새 ID. task 접수 뒤 원문 선택/시작 중복 차단. |
| U4 | source_unavailable는 자료/결과 숨김·수동 E14 재검사 허용. lead_only/consent_required/demo/일반 403/연결 오류를 한국어 안내한다. 권한을 UI가 새로 판정하지 않는다. |
| U5 | task queued/processing 때 5초 E16 단일 flight. 한국어 queued ‘검토를 준비하고 있습니다.’, processing ‘원문을 검토하고 있습니다.’, ready ‘검토가 끝났습니다.’, refused ‘검토 근거를 확인하지 못했습니다.’, failed ‘검토를 끝내지 못했습니다.’. 오류면 자동 조회 정지와 ‘상태 다시 확인’. 성공 queued/processing이면 재개. |
| U6 | queued/processing 새 시작 금지. ready/refused/failed에서만 ‘새 검토’로 task/상태/시도 ID를 초기화해 선택 단계로 돌아간다. status not_found는 상태/결과 숨김과 수동 E16 서버 재검사를 제공한다. |
| U7 | ready의 ‘웹에서 결과 보기’는 ref 잠금·현재 E16 재조회 후 ready만 openWeb, 성공 뒤 onSeen(task_id,current). 다른 상태는 한국어 반영/링크 미열기·미읽음. 조회/웹 열기 실패도 읽음 없음. status/open의 중첩을 막는다. |
| U8 | 자료/시작/상태/웹 열기/읽음의 각 await 후 current 검사. 탭 이탈·같은 work 탭 재클릭·로그아웃 cleanup. 늦은 응답이 notice·선택·상태·웹 열기·읽음을 바꾸지 않음. 개발 StrictMode effect 재실행에서도 자료 읽기는 단일 요청으로 완료되고 잠금이 풀림. 이미 시작한 외부 행동 취소 불가. |

## 6. Error Handling

PRD DC-16·§8의 실패 맵을 따른다. 요청 ID는 오류 자체로 바꾸지 않는다. 자료 수동 reload 후 살아 있는 선택만 현재 후보로 검증하며 없는 ID는 POST할 수 없다. status error/not_found는 task ID를 재조회용으로 보존하되 stale ready를 결과 링크로 사용하지 않는다. 서버 main 기존 timeout은 유지한다.

## 7. Security Checklist

S1: 기기 Bearer·현재 멤버십·lead/동의/비데모·본인 task RLS·원문 재검사·request_id 멱등·can_see 단일 판정 무변경. 서버 권한을 후보 UI 검사로 대신하지 않는다.
S2: 새 원문/토큰/질문 로그·영구 캐시·LLM·DB 없음. 기존 HTTPS/출처 제한/좁은 IPC·로그아웃 유지. 직접 AI 답/승인/발송은 추가하지 않는다.

## 8. Test Plan

먼저 현재 renderer로 누락을 재현하는 targeted Electron red를 실행한 후 구현한다. 합성 HTTPS API와 실제 main/preload/renderer를 사용한다.

| 단계 | 실행 시나리오 |
|---|---|
| step0 | 자료 지연/empty/503/reload/403·현재 4distinct/원칙·start 연타1POST·실패 선택/동일 ID retry·선택 변경 새 ID·성공 중복 금지·source_unavailable 재조회·자료/시작 늦은 이탈/같은 탭/로그아웃 |
| step1 | 5초 폴링 지연 시 단일 request·5상태·오류 stop/수동 재개·terminal 새 검토·not_found 숨김/retry·현재 ready/다른 상태/조회 실패·openWeb 실패·연타1/성공 뒤 읽음·status/open/읽음 늦은 응답 |
| step2 | 기존25와 신규 전체 Electron·별도 실제 development React/StrictMode 자료 조회·desktop lint/build/unit·root lint/build/unit·isolated SQL·Graft 전후/Archify 실제 실행·독립 10항목 및 SC6개 analyze/report |

L1 계약/SQL 실행은 서버의 기존 단위/격리 권한 검증으로 대조하며 production 세션 호출과 구분한다. L2/L3는 실제 Electron 합성 흐름이다. root 기본 Turbopack의 worktree 외부 junction 실패는 로그로 기록하고 설정 변경 없이 webpack production build로 보완한다. 합성 결과는 실제 고객 문서 의미 정확도를 증명하지 않는다.

## 9. Clean Architecture

제품 파일 App.tsx/WorkSalesReview.tsx만 예상 변경. WorkTab의 기존 onSeen(id,current?) 계약은 그대로다. renderer→기존 preload/main→companion 공용 lib/SQL 경계를 유지한다. 신규 lib가 필요해지면 TDD와 상위 범위를 먼저 검토한다.

## 10. Coding Convention Reference

기존 TS/React/native label·button/한국어·shared/messages 직접 import·ref 잠금·await 후 current 검사를 따른다. 스타일/다른 기능 리팩터링 없음. AGENTS/AI-DEVELOPMENT와 기존 Electron fixture/verified temporary profile 정리 규칙을 읽는다.

## 11. Implementation Guide and Session Guide

| Module | step | 담당 범위/산출물 |
|---|---|---|
| sources/start | 0 | U1~4·U8 관련 App/WorkSalesReview 및 followup.spec.ts targeted red/green 로그/summary |
| status/open | 1 | U5~8·동일 파일 이어 구현/targeted 로그/summary |
| verification | 2 | 전체 회귀·도구·독립 U1~8/S1~2 및 SC1~6·analysis/report/최종 summary |

각 step은 앞선 완료 summary와 design 전체를 읽고 순차 서브에이전트로 수행한다. 모든 실행 기록은 docs/verification/47-desktop-sales-flow/에 두며 실패/수정/최종 통과를 구분한다. 일치율 90% 미만은 보완·재분석, 이상은 report. Graft 실제 실패는 수동 관계 범위와 누락을 함께 남긴다. 운영 미반영/SMTP 보류는 완료 보고에 명시한다.

## Version History

0.1 · 2026-10-03 · phase47 비교 목록 10개와 SC1~6.
