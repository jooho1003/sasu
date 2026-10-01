# Phase 40 step 0 완료 요약 — 2026-10-01

- 선택한 실제 부서 원문 네 건에서 가격·일정·계약·승인 관련 전체 줄을 찾고 고정 질문과 정확한 인용·원문 링크를 보여 준다. 원문·질문은 DB에 저장하지 않으며 매 요청 현재 세션/RLS로 재검사한다. 주제·역할별 3건과 전체 수를 구분하고 큰 입력은 전체 거절한다.
- 관계: 기존 원문 연결 화면→새 세션 checklist POST→membership/demo→items/sources RLS→기존 원문 preview 검증→새 순수 탐색→기존 evidence 화면. [설계 Mermaid](../../docs/02-design/features/sales-review-condition-checklist.design.md#2-architecture-options). Graft·Archify 도구 결과 없음.
- [실행 기록](../../docs/verification/sales-review-condition-checklist-2026-10-01.md): TDD red→green 대상 15, 전체 168파일·1,748, 신규 인증/접근 E2E 2, 기존 게스트·영업 회귀 9, lint 0·문구 차단 0, Webpack 프로덕션 컴파일·TypeScript·정적 생성 통과. 390px 넘침 없음·실제 demo/미동의 lead 403·비활성/권한 회수 뒤 이전 결과 제거·작업/job/LLM 행 수 불변 JSON 확인.
- [PDCA 분석](../../docs/03-analysis/sales-review-condition-checklist.analysis.md) 12/12·성공 기준 4/4, [보고](../../docs/04-report/features/sales-review-condition-checklist.report.md). 기본 Vitest와 Turbopack 지연 중단 후 native 임시 테스트 설정·Webpack으로 검증한 제한을 기록했다.
- 실제 고객 문서의 업무 적합성·의미/충돌 판단·생성형 초안·운영 배포는 이번 범위 밖이다. 과거 회귀 이미지 기록은 그대로 두고 새 실행 화면을 `phase40-regression-*`로 보존했다. 기존 미추적 Supabase 설정은 변경하지 않았다.
