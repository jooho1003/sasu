# desktop-sales-flow — Plan

2026-10-03 · phase47 · bkit PDCA / Plan Plus · 기준 12ad4d7

## Executive Summary

| 관점 | 내용 |
|---|---|
| 문제 | 영업 자료 오류·시작 연타·중첩 상태 조회·오래된 결과 열기가 회복되지 않는다. |
| 해결 | 기존 시작/상태 API에 선택별 멱등 시도와 현재 화면의 조회·열기 생명주기를 연결한다. |
| 사용 효과 | 수동 재시도에서 선택을 보존하고 현재 완료 결과만 웹으로 연다. |
| 핵심 가치 | 기존 원문·작업 권한을 유지하면서 같은 작업의 중복 시작을 줄인다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 영업 검토 시작·진행·결과 열기의 회복 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 POST·중첩 폴링·이탈 후 링크/읽음 |
| SUCCESS | SC1~6 실행 증거와 독립 U1~8/S1~2 대조 |
| SCOPE | PRD DC-16·§8 / ARCHITECTURE §6-12 / ADR-086 |

## 1. User Intent Discovery

원천은 [PRD §3-8 DC-09·DC-16·§8](../../PRD.md), [ARCHITECTURE §6-12](../../ARCHITECTURE.md), [ADR-086](../../ADR.md)이다. 사용자가 다음 phase 전체를 step별 서브에이전트로 완료하도록 지시했다. 신규 사업 기능이 아니라 이미 있는 검토의 회복 보완이라 Premise Challenge의 신규 수요 질문은 생략한다. 현재 앱은 네 원문 선택과 시작을 제공하지만 오류·중복·현재 상태 확인이 부족하며 웹 직접 사용이 우회 방법이다. 상위 문서의 확정 범위 안에서 설계·일상 구현 선택을 자율 진행한다. 신규 사용자 수요나 실제 고객 문서 정확도는 추정하지 않는다.

## 2. Alternatives Explored

| 접근 | 이점 | 비용/제약 |
|---|---|---|
| A 선택: 기존 renderer 보완 | 기존 IPC/서버 재사용, 변경 경계 작음 | 비동기 세대/잠금을 명시적으로 관리 |
| B 범용 hook/영구 캐시 | 여러 흐름 분리 가능 | 이번 범위에 새 저장 경로·추상화 과다 |
| C 현행 유지·웹 우회 | 개발 변경 없음 | 중복 시작·오래된 상태·오류 회복 문제 잔존 |

ADR-086의 A를 따른다. 기능별 회복만 필요하므로 Hold로 진행한다.

## 3. YAGNI Review

포함: 자료 조회 회복, 현재 4자료 선택, 선택별 시작 ID, 진행 조회 회복, 현재 완료 결과 열기, 화면/세션 폐기.
후속: 업로드 회복은 별도 phase; 새 전체 이력·검색은 별도 요구가 생길 때 검토.
제외: 새로운 작업 API·IPC·DB·모델 호출·자동 발송 대기열·직접 결과/인용 답·승인/발송. 상위 DC-16·§8의 경계다.

## 4. Scope

제품은 App.tsx의 일 맡기기 nav key와 WorkSalesReview.tsx의 메모리 상태만 보완한다. E14/E15/E16 및 WorkTab/RecentWork/main/preload/서버/SQL 소비자는 재사용·회귀한다. 운영 배포와 설치 파일 게시, Resend SMTP 연결은 포함하지 않는다.

## 5. Requirements

| 요구 | 원천/분석 목록 |
|---|---|
| 자료 loading/empty/error/manual reload·현재 distinct 선택 | DC-16 / U1~2 |
| 시작 잠금·같은 선택 request_id retry·task 접수 뒤 중복 금지 | DC-16·§8 / U3~4 |
| 5초 단일 flight·오류 정지·수동 재조회·terminal 새 검토 | DC-16 / U5~6 |
| 현재 ready 결과만 열고 성공 뒤 읽음·세대 검사 | DC-16·§8 / U7~8 |
| 기존 권한·원문/로그/저장 경계 | ARCH §6-12·ADR-086 / S1~2 |

## 6. Success Criteria

- SC1 자료 로딩·오류·빈 상태·재조회와 현재 distinct 4건/원칙 검사를 실행으로 확인한다.
- SC2 연타 1POST, 선택 불변 수동 retry 동일 request_id·선택 변경 새 ID, 시작 실패 선택 보존/자동 재전송 없음, task 접수 뒤 중복 금지를 확인한다.
- SC3 한국어 5상태·5초 단일 조회·오류 정지/수동 재개·terminal 새 검토를 확인한다.
- SC4 현재 E16 ready→웹 열기 성공→읽음 순서, 다른 상태/오류는 미열기·미읽음을 확인한다.
- SC5 자료/시작/상태/열기/읽음의 이탈·동일 탭 재클릭·로그아웃 늦은 콜백 폐기를 확인한다.
- SC6 기존 25 Electron 회귀와 신규 사례·desktop/root lint/build/unit·SQL·독립 분석 90% 이상·도구/보고 기록을 남긴다.

## 7. Risks and Mitigation

이미 시작한 POST/OS 열기/저장은 취소되지 않는다. current 검사는 늦은 UI 반영과 다음 행동만 막는다. 응답 소실은 서버 멱등을 활용한 같은 ID의 명시적 retry로 회복한다. source/status 권한 철회는 숨김과 서버 read 재검사로 처리한다. 합성 HTTPS API와 실제 Electron의 실행 증거를 실운영 인증·실문서 정확도와 구분한다. Graft native binding이 실행 불능이면 오류와 수동 관계 범위/누락을 기록하며 자동 그래프 생성 자체를 필수 통과 게이트로 삼지 않는다.

## 8. Architecture Considerations and Failure Map

기존 React 메모리 state/ref, renderer→preload/main→E14/E15/E16→공용 lib/SQL을 유지한다. 새 구조 결정을 여기서 만들지 않는다.

| 진입점 | 실패 | 처리 | 사용자 결과 |
|---|---|---|---|
| 자료 조회 | 지연·빈 목록·연결 오류 | U1 | 상태/빈 안내/오류와 자료 다시 불러오기 |
| 선택/시작 | 누락·중복·후보 사라짐·원칙 아님 | U2 | POST 없이 서로 다른 현재 원문 4건 안내 |
| 시작 | 403·demo·consent·503 | U3~4 | 선택 유지·안내·수동 retry, 자동 POST 없음 |
| 시작 자료 회수 | source_unavailable | U4 | 자료/결과 숨김·수동 E14 재검사 |
| 진행 조회 | 지연·실패·not_found | U5~6 | 단일 flight·오류 정지/상태 숨김·수동 E16 재검사 |
| 결과 열기 | 현재 상태 변경·openWeb 실패 | U7 | 상태 반영/오류 안내, 읽음 없음 |
| 화면 종료 | 각 await/읽음 지연 | U8 | 늦은 결과 폐기; 이미 시작한 외부 행동 취소 불가 |

## 9. Convention Prerequisites

AGENTS.md·AI-DEVELOPMENT·기존 TypeScript/React/한국어·native label/button·shared/messages 규약을 따른다. 새 lib·환경 변수·테이블 없음. 영향 소비자 WorkTab/RecentWork·공유 inbox·세션/로그아웃·질문/결정함/기록을 기존 전체 Electron으로 회귀한다.

## 10. Next Steps

design → step0 자료/시작 → step1 상태/열기 → step2 전체 검증/독립 analyze·필요 iterate/report. step은 순차 서브에이전트 실행하고 이전 산출물을 읽는다. 문서만 완성한 시점에 실행 통과나 기능 완료를 선언하지 않는다.

## Appendix: Brainstorming Log

의도는 사용자 전체 phase 완료 요청, 문제·가장 작은 범위는 DC-09 회복, 대안은 ADR-086 A/B/현행 유지, YAGNI는 Hold다. 업로드·범용 캐시/엔진·운영 연결은 보류한다. 상위 PRD/ARCH/ADR를 먼저 갱신했고 이 문서는 매핑/분석 목록만 제공한다.

## Version History

0.1 · 2026-10-03 · phase47 계획, SC1~6.
