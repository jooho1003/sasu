# desktop-recent-work — Design

2026-10-03 · bkit PDCA · [Plan](../../01-plan/features/desktop-recent-work.plan.md)
원천: PRD DC-14·§8 → ARCHITECTURE §6-12 → ADR-084.

## Context Anchor

WHY 작업 재열람 / WHO 동의한 팀장 / RISK 늦은 요청·권한 회수 / SUCCESS SC1~5 / SCOPE 최근 24시간, 기존 API/웹 인계.

## 1. 개요

기존 작업을 다시 찾는 renderer 확장. 권한·기간·운영 경계는 상위 문서를 따른다.

## 2. 구조와 대안

| 안 | 변경 | 위험 |
|---|---|---|
| A | WorkTab에 목록/요청 로직 모두 삽입 | 시작 UI와 결합 |
| B | 새 이력 API/저장소 | 범위·권한 경로 증가 |
| C 선택 | RecentWork와 App 공유 갱신 | 기존 소비자 회귀 필요 |

흐름: App→inbox.get(E05)→RecentWork. 선택→자료 E05 존재 재확인 또는 영업 E16 상태→app.openWeb→성공 후 markSeen. 탭 이탈/세션 변경은 UI 세대 검사로 폐기.

## 3. 데이터

CompanionInbox.reviews {id,kind,title,status}, sales {id,status} 그대로. 별도 캐시/테이블 없음. App은 inbox|null, loading/error 및 진행 중 Promise를 관리한다. RecentWork는 선택 잠금과 요청 세대만 보관한다.

## 4. API/IPC

E05 GET /api/companion/inbox, E16 GET /api/companion/sales-review/:taskId 재사용. 자료 현재 존재는 현재 E05 응답으로만 확인한다. app:openWeb·settings:markSeen 기존 allowlist/출처 제한 유지. 새 endpoint/job 없음.

## 5. UI 체크리스트

U1 팀장 WorkTab 상단 ‘최근 맡긴 작업’·‘최근 24시간’·자료/영업 구분, 한국어 상태, 원본 ID 비표시.
U2 로딩·빈 목록·오류/재시도 구분. 오류 시 이전 목록 숨김. 새로고침은 공유 요청 1회.
U3 선택 때 현재 존재/영업 상태 확인 후 웹 상세 인계. 읽음은 openWeb 성공 후.
U4 전환 중 ref 잠금과 버튼 disabled로 연타 1회. 에러 안내·재시도 허용. 실패/취소는 조회만 한다.
U5 탭 이탈/로그아웃 후 늦은 조회 응답이 새 링크/읽음을 요청하거나 notice를 바꾸지 않는다. 각 await 경계 세대 검사. 읽음 콜백에도 발신 화면의 세대 검사를 전달한다. 이미 시작한 OS 열기/저장 요청 자체는 취소할 수 없으며 종료된 화면에 그 결과를 반영하지 않는다.
U6 기존 30초 갱신 재사용, 작업 시작 UI/질문/결정함/세션 종료 회귀.

## 6. 오류

inbox 실패는 별도 오류/재시도. 선택한 자료가 최신 응답에 없으면 열지 않고 안내한다. 영업 403/404는 열지 않는다. shell 열기 실패는 읽지 않는다. 읽음 저장 실패는 열기 성공을 되돌리지 않으며 오류 안내. 로딩/중복 갱신은 함께 기다린다.

## 7. 보안

S1 기존 서버 Bearer·본인/부서/lead·RLS와 웹 재검사 유지. UI 권한 로직 복제 없음.
S2 메모리 요약만, 원문/기기토큰 노출·영구 이력/새 로그 없음. 기존 main 출처 제한과 세션 종료 보존.

## 8. 테스트 계획

실제 Electron main/preload/renderer+합성 HTTPS Auth/API로 팀장 목록/상태·팀원 숨김·503 재시도·자료 현재 존재·영업 상세 403·웹 인계/읽음·연타·탭 이탈/로그아웃 지연·shell 실패를 검증한다. 신규 UI 테스트를 먼저 추가해 기능 누락을 확인한다. 기존 followup 12개 회귀. desktop lint/unit/build 및 root lint/build/unit, 기존 companion inbox/sales/SQL 권한 검사 기록. 외부 모델/운영 권한 실측과 합성 fixture를 혼동하지 않는다.

## 9. 파일과 의존

제품 변경: desktop/src/renderer/src/App.tsx, components/WorkTab.tsx, 신규 components/RecentWork.tsx. 기존 preload/main/server/contracts/SQL 변경 없음.

## 10. 규약

기존 TS/React/IPC·한국어·신규 의존성 없음. UI만 새 모듈이며 lib TDD 대상 없음.

## 11. 구현 가이드

step0 renderer+실행 가능한 E2E → step1 회귀/도구/독립 gap 분석·report. 구조 비교 U1~6/S1~2 8개와 SC1~5를 별도로 보고한다. 자동 그래프 실패는 수동 확인 범위/도구 공백을 명시한다.
