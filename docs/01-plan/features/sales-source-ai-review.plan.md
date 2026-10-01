# sales-source-ai-review Plan

> 사수 · 2026-10-01 · 개발 승인: 사용자 운영 반영 후 다음 개발 요청/추천 선택

## Executive Summary
| 관점 | 내용 |
|---|---|
| Problem | 단어 탐색 뒤 실제 문맥에서 확인할 문단을 찾는 부담이 남는다. PRD AG-07. |
| Solution | AI 문단 선택 → 코드 전체 인용·고정 질문 복원. ADR-080. |
| Function UX Effect | 선택한 네 자료로 비동기 검토하고 원문에서 확인한다. |
| Core Value | 현재 권한과 버전으로 근거를 추적하며 사람이 업무 결정을 한다. |

## Context Anchor
| Key | Value |
|---|---|
| WHY | 실제 원문 문맥 확인 부담을 줄임 |
| WHO | 동의한 비데모 부서 lead 본인 |
| RISK | 잘못된 선택·권한 철회·원문 변경·늦은 완료 |
| SUCCESS | 정확한 전체 문단, 현재 SQL 권한, 진행/실패 회복 |
| SCOPE | PRD AG-07·§8·§11, ADR-080 |

## 1. Overview
PRD §3 AG-04~07을 따른다. [PRD](../../PRD.md), [구조](../../ARCHITECTURE.md), [결정](../../ADR.md), [절차](../../AI-DEVELOPMENT.md)가 상위 원천이다.

## 2. Scope
PRD AG-07의 비동기 문단 선택·확인 질문만 구현한다. 제외 사항은 PRD §8을 따른다.

## 3. Requirements
| ID | 매핑 |
|---|---|
| FR1 | AG-07 현재 4자료·전체 문단 검증 |
| FR2 | AG-07 SQL 공통 권한·버전·요청자 본인 |
| FR3 | AG-07 task/job·멱등·10건·2분 정리 |
| FR4 | AG-07 진행/무근거/실패·원문 링크·재선택 |
| NFR1 | §8 원문 무복제·로그 무본문·기존 LLM |

## 4. Success Criteria
| ID | 실행 조건 |
|---|---|
| SC1 | TDD 원문 복원/거절·범위 및 엄격 스키마 검사 |
| SC2 | 격리 SQL 현재권한/버전/폐기/한도/완료 검사 |
| SC3 | 인증·모바일 E2E, 게스트·기존 영업 회귀 |
| SC4 | lint/build/full unit, 실제 Groq 합성 선택 실행·증거 |

## 5. Risks and Mitigation
PRD §11의 부정어·주입·원문 변경·권한 회수를 별도 사례로 검사한다. 실제 고객 문서는 미제공이며 업무 정확도는 이 검증으로 주장하지 않는다.

## 6. Impact Analysis
contracts·새 순수 모듈/pipeline·jobs/worker·세션 API·기존 원문 UI·0068 migration. 기존 합성 task와 결정은 소비자가 아니다. SQL/단위/E2E 회귀로 확인한다.

## 7. Architecture Considerations
Dynamic. ADR-080의 C안, ARCHITECTURE §6-10을 따른다.

## 8. Convention Prerequisites
AGENTS.md·AI-DEVELOPMENT의 TDD/하네스/PDCA. 새 환경변수 없음. Graft/Archify 도구는 현재 미노출이며 실제 파일 관계·Mermaid로 누락 범위를 기록한다.

## 9. Next Steps
design → step/TDD/SQL/배선 → 검증 → analyze/report.

## Version History
0.1 · 2026-10-01 · 사용자 선택을 상위 문서에 매핑
