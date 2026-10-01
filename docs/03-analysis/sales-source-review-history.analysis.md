# sales-source-review-history Analysis

> 2026-10-01 · PRD AG-08 → ARCHITECTURE §6-11 → ADR-081 → [설계](../02-design/features/sales-source-review-history.design.md)

## Context Anchor
| Key | Value |
|---|---|
| WHY | 화면을 떠난 뒤 기존 검토 찾기 |
| WHO | 동의한 비데모 lead 본인 |
| RISK | 오래된 근거·권한 회수·페이지 중복·응답 순서 |
| SUCCESS | 재접속 재열람·현재권한·열람 쓰기 0 |
| SCOPE | PRD AG-08·§8·§11, ADR-081 |

## Strategic Alignment Check
PRD의 본인 이력/현재 근거 재열람 문제를 구현했다. 새 작업·모델 호출·스냅샷·업무 승인을 추가하지 않았으며 시간 절감과 실제 고객 효용은 미평가다. [최종 실행 기록](../verification/sales-source-review-history-2026-10-01.md)이 판정 근거다.

| SC | 상태 | 실행 근거 |
|---|---|---|
| SC1 | 충족 | 신규 API 13건·기존 상세12건, strict/paired cursor·최소 응답·guard/cache |
| SC2 | 충족 | 최종 이력 E2E 3/3: 22건 20+2·동일시각·재접속·5상태·정확 인용·원문·초점·390px |
| SC3 | 충족 | 본문/삭제/비활성/원칙/동의/역할·리스트/상세 숨김, 지연/늦은 응답·count 불변 |
| SC4 | 충족 | unit1788·SQL308+2016·lint/build, 기존 13시나리오 각각 최종 pass·독립 static 리뷰 |

성공 조건 4/4. 기존 모델 회귀의 최초 1실패와 재실행 성공은 실행 기록에 보존하며, 원인이 고쳐졌다고 판정하지 않는다.

## 1. Analysis Overview
독립 gap-detector는 PRD/plan/design·코드를 읽어 static 리뷰와 runtime 검증 계획을 제시했다. 주 세션은 테스트를 실행했다. 독립 리뷰가 찾은 D4 취소된 상세 오류 콜백을 수정했고 재검토에서 중요한 static 간극이 없었다. 도구 결과 없는 Graft/Archify는 미실행으로 표시한다.

## 2. Gap Analysis
| 항목 | 비교·최종 증거 | 판정 |
|---|---|---|
| D1 데이터 | 기존 0068/RLS만 사용, 새 migration/RPC 없음 | pass |
| D2 목록/API 계약 | 세션·본인/부서·21→20·정렬 두 필드·엄격 커서·메타데이터·no-store | pass |
| D3 화면 | 독립 이력·5상태·KST·다시 열기/닫기·읽기 모드·초점/화면 이동 | pass |
| D4 현재성/응답 | focus/교체/선택 때 제거·abort/latest·30초/2분 종료·A404/B보존 E2E | pass |
| D5 오류 | 실패/무근거·500·시간초과·재열람, 이전 인용 제거 | pass |
| D6 권한/무쓰기 | 현재 RLS·lead/consent/demo·owner·부서, 본문 목록/제외 수/새 호출 없음 | pass |
| D7 실행 검증 | API/fullunit/SQL·이력3·기존13 각각 최종pass·스크린샷/count JSON | pass |
| D8 절차 | 상위 문서→plan/design→3step→실행 기록→분석/보고·summary | pass |

구조 100%, 동작 100%, API 계약 100%, 최종 runtime 100%. 가중치 0.15/0.25/0.25/0.35로 설계 일치율 **100% (8/8)**. 이는 최종 설계 항목의 통과 비율이며 최초 회귀 성공률·실고객 정확도·branch coverage가 아니다.

## 3. Code Quality Analysis
사용자 경로 service role·SQL 권한 복제·목록 본문·새 LLM/쓰기·영속 브라우저 저장 없음. 초기 렌더 Date.now를 effect로 옮겼으며 목록/상세 listener와 controller를 정리한다. React lint 종료 0. 목록/상세 서버-클라이언트 호출·응답 필드가 설계와 일치한다.

## 4. Performance Analysis
20건씩 목록·21행 sentinel, 기존 owner index 활용. 실제 SLA/부하/장기 데이터량은 측정하지 않았다. 별도 그래프 도구의 실행 결과는 없다.

## 5. Test Coverage
전체 단위 172파일/1788, SQL308+matrix2016, 신규 인증3, 기존 영업/게스트13 각각 최종통과. 최초 실제 모델 회귀 timeout과 재실행은 분리 기록. 새 이력에서 모델이 관련 문단을 고르는 품질은 재평가하지 않는다.

## 6. Clean Architecture Compliance
목록은 세션 RLS, 상세는 기존 pure 인용 복원을 재사용. 이력 UI의 initialTaskId는 POST를 하지 않으며 기존 새 검토 버튼과 분리된다. 새 lib 로직/SDK/서비스 없음.

## 7. Convention Compliance
한국어 UI·installed Next Promise params/Response·기존 Tailwind, conventional commit, 새 환경변수 없음. 하네스 step/summary와 근거 경로를 연결한다.

## 8. Overall Score
SC4/4·D8/8, 현재 코드의 중요한 설계 간극 없음. 초기 모델 회귀 실패의 원인 미확보, 실제 고객/성능·실시간 철회 push·Graft/Archify 미실행은 한계로 남긴다.

## 9. Recommended Actions
사용자 운영 반영 지시 시 phase41 0068와 코드부터 별도 운영 검증한다. 다음 범위는 실제 사용 피드백에 따라 정한다.

## 10. Design Document Updates Needed
D3에 열린 결과로 초점/화면 이동을 기록했다. 상위 정책 변경은 없다.

## 11. Next Steps
독립 report-generator 최종 증거 대조·보고, phase summary/index 완료·로컬 커밋. 운영 배포는 범위 밖이다.

## Version History
0.1 · 2026-10-01 · 최종 설계 대조와 최초 실패/재실행 보존
