# sales-source-review-history Plan

> 2026-10-01 · 사수 · Plan Plus · 사용자 다음 개발 요청/이력·재열람 선택. 승인된 범위의 일상 설계 선택으로 진행.

## Executive Summary
| 관점 | 내용 |
|---|---|
| Problem | 이전 실자료 검토를 화면 재방문 후 찾기 어려움. PRD AG-08. |
| Solution | 본인 작업 목록과 현재 근거의 재열람. ADR-081 C안. |
| Function UX Effect | 최신순/더 보기 → 기존 결과 → 원문 연결. |
| Core Value | 모델 재호출 없이 현재 권한으로 업무를 이어 감. |

## Context Anchor
| Key | Value |
|---|---|
| WHY | 화면을 떠난 뒤 기존 검토 찾기 |
| WHO | 동의한 비데모 lead 본인 |
| RISK | 오래된 근거·권한 회수·페이지 중복·응답 순서 |
| SUCCESS | 재접속 재열람·현재권한·열람 쓰기 0 |
| SCOPE | PRD AG-08·§8·§11, ADR-081 |

## 1. User Intent Discovery
PRD §3 AG-08이 목적·이용자·완료 조건의 원천이다. [PRD](../../PRD.md) → [구조](../../ARCHITECTURE.md) → [ADR](../../ADR.md).

### 1.5 Premise Challenge
수요: 사용자가 이력·재열람을 선택했다. 현재 대안: 화면의 작업 ID를 기억하거나 새 검토를 요청해야 한다(코드 확인). 최소 흐름: 본인 목록에서 기존 검토 다시 열기. 만들지 않으면 재방문 경로 부재가 남는다. 실제 팀장의 시간 절감·시장 수요는 미측정이다.

## 2. Alternatives Explored
기존 상세에 목록 분기(A), 새 스냅샷 저장(B), 별도 읽기 목록+상세 재사용(C). ADR-081 C안 매핑.

## 3. YAGNI Review
Hold. 기존 작업/RLS/인용 복원만 사용한다. 검색·공유·확인 기록·업무 승인·발송·운영은 PRD §8에서 제외한다.

## 4. Scope
PRD AG-08 본인 이력 페이지·현재 상세 복원·실패 안내.

## 5. Requirements
| ID | 상위 매핑 |
|---|---|
| FR1 | AG-08 세션 최신순 20건·커서 더 보기 |
| FR2 | AG-08 기존 상세·진행·무근거·실패 재열람 |
| FR3 | AG-08 원문/권한 변화·포커스·응답 순서에서 표시 제거 |
| NFR1 | §8 작업/job/LLM 쓰기 0·무스냅샷·게스트 무호출 |

## 6. Success Criteria
| ID | 실행 조건 |
|---|---|
| SC1 | API 형식/guard/순서/커서/최소 응답·오류 테스트 |
| SC2 | 격리 인증 E2E 재접속·20건+더 보기·상태·원문·390px |
| SC3 | 현재 원문/권한 숨김·응답 지연 회복·읽기 전후 쓰기 0 |
| SC4 | lint/build/full unit/기존 SQL·영업/게스트 회귀·독립 분석 |

## 7. Risks and Mitigation
PRD §11의 변경·권한 회수·동일 시각·조회 실패를 실행한다. 이력은 현재 접근 가능한 작업만 표시하며 제외 수를 노출하지 않는다.

## 8. Architecture Considerations
Dynamic, ADR-081 C안. API→세션 RLS→최소 목록, UI→AG-07 상세→현재 인용. 실패 맵: 400커서,403멤버/데모,500통신,404상세 폐기,2분 조회 종료.

## 9. Convention Prerequisites
AGENTS·AI-DEVELOPMENT를 따른다. 새 lib 모듈·환경변수 없음. Graft/Archify MCP/CLI 미노출 확인, 실제 import 추적과 Mermaid로 확인한 범위·도구 누락 기록.

## 10. Next Steps
design→harness step→API/UI/검증→analyze/report.

## Appendix: Brainstorming Log
이력·재열람(선택), 질문에 확인내용 기록(후속), 고객 회신 초안(후속). 사용자 선택은 핵심 범위 승인, 세부 구현은 개발 위임으로 처리.

## Version History
0.1 · 2026-10-01 · PRD AG-08 매핑
