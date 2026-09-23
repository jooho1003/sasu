# step3 실행 요약

- 내부 원문 링크에 답변 ID만 전달하고, 원문 API가 세션 items/citations RLS를 순서대로 적용해 본인의 인용 범위만 강조한다. 조회 실패·미일치·타인 인용은 원문을 강조 없이 제공한다.
- 페이지의 Promise searchParams와 컴포넌트 요청/상태 key를 연결했다. React `<mark>` 텍스트 노드와 중앙 스크롤을 사용한다. 긴 자료의 한 조각임을 안내한다.
- API TDD red → 관련 117검사 통과. 실제 컴포넌트·합성 응답 화면 12검사 통과(1440/390px·정확한 강조·HTML 비실행·강조 없이 읽기·권한 차단·넘침 없음). 문구 검사 2파일, 차단/경고 0.
- 콜드 Vite 탐색 제한과 테스트의 `<blockquote>` 가정 오류를 수정한 실패 기록을 보존했다. 제품 근거·권한 검증을 완화하지 않았다.
- [실행 기록·화면](../../docs/verification/grounded-answer-selection-2026-09-23/README.md) · [코드 관계·수동 흐름도](../../docs/verification/grounded-answer-selection-2026-09-23/dependencies.md). Graft/Archify 결과는 누락이다.
