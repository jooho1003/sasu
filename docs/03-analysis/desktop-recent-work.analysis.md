# desktop-recent-work — Analysis

2026-10-03 · bkit PDCA analyze · [Plan](../01-plan/features/desktop-recent-work.plan.md) · [Design](../02-design/features/desktop-recent-work.design.md) · [실행 기록](../verification/45-desktop-recent-work/verification.md)

## Context Anchor

WHY 작업 재열람 / WHO 동의한 팀장 / RISK 늦은 요청·권한 회수 / SUCCESS SC1~5 / SCOPE 최근 24시간, 기존 API/웹 인계.

## 상위 문서와 결정 검토

PRD DC-14·§8, ARCHITECTURE §6-12, ADR-084 → plan/design → phase45 step → 구현을 대조했다. 본인 최근 작업을 다시 찾는 문제를 기존 받은 일로 해결한다. 새 전체 이력/권한 함수/서비스/자동 재실행은 없다. 기존 E05/E16 Bearer·현재 멤버십·RLS·웹 권한 검사를 유지했다. 전략적 이탈은 발견하지 못했다.

## 독립 정적 분석과 수정

bkit gap-detector 역할의 기존 `desktop_gap_check` 에이전트가 구현을 독립 검토했다. 최초 7/8에서 U5 읽음 저장 오류 콜백의 탭 세대 검사 누락을 발견했다. RecentWork가 current 함수를 onSeen에 전달하고 App은 저장 시작·성공·오류에 이를 검사하도록 수정했다. 재검토 결과 **8/8**, 확인된 잔존 코드 갭 없음. 이미 시작한 OS/저장 요청은 취소할 수 없다는 경계를 PRD/ADR/design에 명시했다.

| 항목 | 근거 | 결과 |
|---|---|---|
| U1 | RecentWork 상태 maps·WorkTab lead 분기 | 일치 |
| U2 | App loadInbox Promise 공유·loading/error·재시도 | 일치 |
| U3 | E05 존재 확인 / E16 web_path→openWeb→onSeen | 일치 |
| U4 | locked ref·opening state·disabled·finally 해제 | 일치 |
| U5 | unmount 세대 검사·onSeen current 전달·App callback 검사 | 수정 후 일치 |
| U6 | 기존 30초 interval·작업 시작 UI 재사용·질문/세션 회귀 | 일치 |
| S1 | 기존 inbox/sales route·session/RLS·main allowlist | 일치 |
| S2 | 메모리 요약·새 원문/토큰/로그/캐시 없음 | 일치 |

설계 API §4 ↔ 기존 server E05/E16 ↔ preload/main parser ↔ renderer 호출을 대조했다. 서버 계약 변경 없음. 구조/기능/계약 각 100%, 정적 목록 8/8. 관측되지 않은 보안 결함이 없다는 보증은 아니다.

## 실행 검증과 성공 조건

독립 검토의 runtime plan에 따라 목록·상세·인계·실패·연타·탭 이탈/로그아웃·늦은 읽음 오류를 Electron으로 실행했다. 신규 6/6 + 기존 12/12 = **18/18 PASS**. 실제 SQL 하니스 316/316·권한 조합 2,016 PASS. desktop 78·root 1,834 단위 PASS, lint PASS. 빌드 환경 결과는 실행 기록에서 구분한다.

| 조건 | 결과 | 증거 |
|---|---|---|
| SC1 | 충족 | 신규 목록/상태·빈 목록·member 사례 |
| SC2 | 충족 | 오류 재시도·30초 공유 요청 사례 |
| SC3 | 충족 | 최신 권한 확인·웹 인계/읽음·연타 사례 |
| SC4 | 충족 | 403/사라진 자료/shell 실패·E05/E16 지연·읽음 지연 오류 사례 |
| SC5 | 충족 | 18 E2E·78/1,834 단위·SQL·lint/webpack build·독립 검토·Archify, Graft 도구 공백 명시 |

대상 runtime 18/18 =100%. bkit formula: 구조100×0.15 + 기능100×0.25 + 계약100×0.25 + runtime100×0.35 = **100%**. 이 비율은 명시된 설계 항목/테스트에 한정하며 운영 설치/실자료 정확도/메일 검증률이 아니다.

## 도구와 한계

Archify delivery 9/9·browser-check containment PASS, visualReview not-requested. Graft 전후 실행은 동일 Win32 native binding 오류로 실패하여 수동 호출 대조 범위를 기록했다. root 기본 Turbopack build는 worktree의 외부 node_modules junction을 거부했다. 운영/설치·SMTP·실자료 검증은 이번 완료 조건에 포함하지 않는다.

webpack production build는 exit 0으로 타입 검사·정적 페이지 생성까지 통과했다. 성공 조건 5/5와 90% 기준을 넘었으며 확인된 코드 갭은 수정되었다. 기본 Turbopack 실행 환경 공백을 유지하고 최종 보고서와 phase 완료 기록을 남긴다.
