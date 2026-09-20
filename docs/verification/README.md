# 검증 기록

PRD §11 검증표의 각 행을 **실제로 실행한 기록**을 여기에 둔다 (ADR-026). 에이전트의 "완료했습니다"는 완료 신호가 아니다.

- 파일명: `d{N}-{항목}.md` (예: `d3-vertical-slice.md`, `docs/verification/quality-design-review.md`·`quality-test-results.md` (D8 리뷰 기록)). 스크린샷은 같은 이름의 폴더에.
- 각 파일에 남길 것: 날짜·시각 · 실행한 커맨드/쿼리 · 결과 원문(요약하지 않는다) · PRD §11의 어느 행을 만족하는지 · 판정(통과/미달/강등).
- D3(9/10) 세로 슬라이스 게이트부터 생성된다. 제출서의 "AI 활용 증거"(submission-checklist §9)가 이 폴더를 가리킨다.
- 이 폴더는 `docs/` 하위라 Harness 가드레일에 주입되지 않는다. step이 참조하려면 경로를 명시한다.
