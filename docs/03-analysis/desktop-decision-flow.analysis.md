# desktop-decision-flow — Analysis

2026-10-03 · bkit PDCA analyze · [Plan](../01-plan/features/desktop-decision-flow.plan.md) · [Design](../02-design/features/desktop-decision-flow.design.md) · [실행 기록](../verification/46-desktop-decision-flow/verification.md)

## Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| 결정함 오류/처리 회복 | 동의한 부서 구성원 | 늦은 콜백·중복 행동·근거 없는 내용 | SC1~5 | PRD DC-15·§8 / ADR-085 |

## 상위 문서·전략 대조

PRD DC-07/DC-15·§8 → ARCHITECTURE §6-12 → ADR-085 → plan/design → phase46 step을 읽고 대조했다. 조회 실패와 성공 후 오래된 상세를 기존 API로 회복하는 목표를 충족한다. 새 결정 자동 실행·권한 판정·DB·이력 저장소·SMTP 범위 확장 없음.

## 독립 정적 대조

bkit gap-detector 역할의 `desktop_gap_check`가 독립 검토했다. 첫 6/8에서 (1) U4 선행 E05 스냅샷 재사용, (2) U5 현재 결정함 탭 재클릭의 읽음 세대 유지 두 갭을 발견했다. App refreshAfterDecision은 선행 응답을 무효화하고 종료 후 새 E05를 시작하며 CardsTab 성공 전용 onProcessed로 연결했다. App nav key로 동일 탭 복귀도 cleanup한다. 재검토 **8/8**, 확인된 잔존 코드 갭 없음.

| 항목 | 근거 | 정적 결과 |
|---|---|---|
| U1 | CardsTab loading/error/empty/status/수동 갱신 | 일치 |
| U2 | CardsTab E09 ref 잠금·generation·onSeen(current) | 일치 |
| U3 | CardView 인용 0 복귀만·CardsTab 읽음 생략 | 일치 |
| U4 | CardView E10 ref 잠금·CardsTab back/onProcessed·App 새 E05 | 수정 후 일치 |
| U5 | CardView/CardsTab await current·cleanup·App nav key/읽음 검사 | 수정 후 일치 |
| U6 | 기존 주기·처리 가능한 상태 form·기존18 회귀 | 일치 |
| S1 | E05/E09/E10·원장/RLS/담당자·팀장/멱등 무변경 | 일치 |
| S2 | 메모리만·새 로그/토큰/원문 저장/LLM 없음 | 일치 |

구조(기존 renderer 3파일), 기능(위 목록), 계약(design API↔기존 server route/helper↔preload parser/renderer) 각 100%. 자동 Graft 그래프는 없으며 수동 경계 대조 범위를 실행 기록에 남겼다.

## Runtime plan과 성공 조건

독립 검토가 요구한 선행 E05 지연+처리 성공, 읽음 지연+복귀/현재 탭, 이미 처리된 상세 행동 없음 사례를 추가했다. 합성 HTTPS와 실제 Electron은 UI/IPC/renderer 사용 흐름을 확인하고, 실제 권한/원장/멱등은 공용 단위와 isolated SQL 실행으로 구분한다.

| 조건 | 상태 | 근거 |
|---|---|---|
| SC1 | 충족 | 지연/503/빈 목록/상태 사례 |
| SC2 | 충족 | 연타/인용0/403/현재 상세·읽음 |
| SC3 | 충족 | 결정/보류/반려/duplicate·실패 초안·선행 스냅샷 |
| SC4 | 충족 | 늦은 상세/POST/읽음·복귀/같은 탭/로그아웃 |
| SC5 | 충족 | 전체25 E2E·desktop78/root1834 단위·lint/webpack build·SQL316/권한2016·독립 대조·도구 기록 |

최종 실제 Electron 신규7+기존18 =25/25 PASS(exit0,1.5분). 정적 항목8/8, 성공 조건5/5, 대상 runtime100%. 구조100×0.15+기능100×0.25+계약100×0.25+runtime100×0.35 = **100%**. 이 비율은 대상 설계/테스트만의 값이며 운영 정확도나 모든 권한 조합 보증이 아니다. Windows 임시 프로필 정리 실패를 비동기 bounded retry로 보완한 뒤 전체 재실행이 통과했다. 90% 기준을 넘었으며 확인된 코드 갭을 모두 수정했다.

## 한계와 진행

기본 Turbopack은 worktree 외부 junction을 거부하여 webpack을 별도 실행한다. Archify delivery9/9/browser containment PASS, visualReview not-requested. Graft 전후 native binding 실패/수동 경계 대조. 성공 후 queued 갱신 중 탭 전환/로그아웃 조합의 별도 실행 없음과 시작된 POST 취소 불가를 기록했다. 운영/SMTP/설치 범위는 보류 상태로 유지한다.
