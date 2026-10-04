# desktop-decision-flow — Design

2026-10-03 · bkit PDCA · [Plan](../../01-plan/features/desktop-decision-flow.plan.md)
원천 PRD DC-15·§8 → ARCHITECTURE §6-12 → ADR-085.

## Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| 결정함 오류/처리 회복 | 동의한 부서 구성원 | 늦은 콜백·중복 행동·근거 없는 내용 | SC1~5 | PRD DC-15·§8 / ADR-085 |

## 1. 개요

현재 결정함 renderer의 로딩·오류·처리 결과 생명주기를 보완한다. 제품 동작은 원천 문서를 따른다.

## 2. 구조·대안

| 안 | 접근 | 영향 |
|---|---|---|
| A 선택 | 기존 CardsTab/CardView props·ref·cleanup | 작은 변경, 기존 공유 E05 사용 |
| B | 새 useCardController/캐시 | 경계 분리이나 필요 없는 저장 경로 |
| C | 새 endpoint/낙관 상태 | 서버/원장 계약 증가 |

App의 inbox/loading/error/loadInbox→CardsTab. 선택→E09 현재 상세→onCard→인용 있을 때 onSeen(current). CardView E10→성공 메시지→목록 복귀→App refreshAfterDecision. 선행 E05가 있으면 inboxGeneration으로 그 응답을 폐기하고 종료를 기다린 뒤 새 E05를 한 번 시작한다. 성공 시 현재 화면에서 시작한 갱신은 공유 받은 일의 백그라운드 조회로 이어지되 세션 종료 뒤 새 조회는 시작하지 않는다. 실패는 초안 그대로. CardsTab/CardView cleanup과 결정함 nav key 갱신으로 동일 탭 재클릭 복귀도 무효화한다.

## 3. 데이터

기존 CompanionInbox.cards(id,title,deadline,status open/needs_review), Card(citations/conflicts/decisions), CardDecision(ok,duplicate?,status?,message?) 그대로. renderer에 선택 ID·잠금·세대만 추가하며 새 테이블/영구 저장은 없다.

## 4. API/IPC 계약

E05 GET /api/companion/inbox, E09 GET /api/companion/cards/:id, E10 POST /api/companion/cards/:id/decide {status,outcome,rationale}. 기존 parseCard/parseCardDecision와 담당자/팀장·RLS·인용 검사·원장 멱등을 사용한다. 새로운 인증/요청 필드 없음.

## 5. UI 체크리스트

U1 CardsTab ‘결정할 카드’/‘카드 새로고침’·로딩·빈 목록·오류/재시도 분리, 오류 때 이전 목록 숨김. 상태 open=결정 대기, needs_review=검토 필요와 기존 마감 표시.
U2 E09 상세 선택 ref 잠금·진행 안내·버튼 disabled·현재 응답만 선택. 인용 있는 상세 표시 뒤 onSeen(id,current). 읽음 오류의 늦은 UI 결과 폐기.
U3 인용 없는 상세에는 제목/배경/추천/행동/읽음 없음. 근거 안내와 ‘목록으로 돌아가기’ 제공.
U4 CardView E10 ref 잠금·busy, 성공/중복 성공은 목록 복귀와 공유 E05 갱신. 결정/보류/반려 기존 계약을 유지한다.
U5 E10 실패(403/409/연결 오류)는 입력 유지·명시적 재시도, 자동 재전송 없음. 탭 이탈/목록 복귀/로그아웃 뒤 늦은 조회/읽음/처리 결과는 화면/notice/갱신을 요청하지 않는다. 이미 시작한 서버 행동은 취소할 수 없다.
U6 기존 30초 공유 갱신·질문/최근 작업/세션 종료 회귀, 현재 처리된 상세는 행동 없음. 처리 가능한 카드에만 기존 form 유지.

## 6. 오류

inbox 오류는 alert와 재시도, E09 실패는 목록 유지·안내, 인용 없음은 복귀. E10 오류는 같은 상세/초안, 성공 뒤 E05 오류는 성공한 행동을 재실행하지 않고 목록 오류만 표시한다. API main의 기존 15초 timeout 유지.

## 7. 보안

S1 서버 판정/RLS WITH CHECK/append-only/멱등·기기 Bearer·현재 인용 검사 무변경. UI 역할 표시를 권한 검사로 취급하지 않는다.
S2 메모리 상태만, 새 질문/원문/토큰 로그·캐시·LLM 없음. 기존 main IPC/HTTPS/로그아웃 보존.

## 8. 테스트 계획

합성 HTTPS Auth/API와 실제 Electron에서 (1) 목록 지연/503/재시도/빈 상태·상태/마감, (2) E09 연타 1회·현재 읽음/인용 없음 복귀·권한 오류, (3) 결정/보류/반려/중복 성공 목록 갱신과 결과, (4) POST 실패 초안 유지·재시도/연타, (5) E09/읽음/E10 늦은 응답 중 탭/복귀/로그아웃을 확인한다. 기존18 E2E회귀와 desktop lint/unit/build, root lint/unit/build, isolatedSQL 권한 실행. 실제 원장 권한 증거는 SQL/공용 단위 결과이며 합성 API가 증명하지 않는다.

## 9. 레이어·파일

제품 App.tsx, CardsTab.tsx, CardView.tsx. renderer→기존 preload/main→서버. 신규 lib/TDD 대상 모듈 없음. 새 서비스 경계 없음.

## 10. 규약

기존 native form/label/버튼, 직접 shared/messages import, TS props, ref 잠금·await 후 current 검사. 동작 범위 없는 스타일 리팩터링은 하지 않는다.

## 11. 구현 가이드·Session Guide

module1: CardsTab 조회/읽음 + CardView 처리, App props → step0. module2: 실행 로그/SQL/도구·분석/report → step1. 설계 대조 U1~6/S1~2 8개와 SC1~5를 분리 평가한다. Graft 실패는 수동 호출 범위와 공백을 기록한다.
