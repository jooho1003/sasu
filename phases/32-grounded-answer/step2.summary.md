# step2 실행 요약

- `0054_decision_search_terms.sql`로 한국어 조사 한 번 제거와 마지막 위치 기준 최근 32개 단어 선택을 구현했다. 두 글자 미만으로 줄어드는 단어는 원래 형태를 유지한다.
- 기존 0053은 변경하지 않았다. 후보 권한 WHERE부터 점수·정렬·한도·grants까지 원문 문자열 동일 비교를 통과했다. can_see/RLS 판정은 SQL에 유지한다.
- SQL 회귀 먼저 추가 → 조사 질문 red → 0054 구현 → 최종 PGlite 243검사·2,016권한 조합 통과. 최신 질문 누락·security definer·실행 권한도 확인했다.
- 초기 SQL 생성 시 JavaScript 치환 문자열 처리 실수는 격리 하니스에서 실패해 수정했고 실패 기록도 보존했다. 운영 DB는 변경하지 않았다.
- [실행 기록](../../docs/verification/grounded-answer-selection-2026-09-23/README.md) · [권한/점수 동일 비교](../../docs/verification/grounded-answer-selection-2026-09-23/sql-permission-comparison.txt) · [최종 SQL](../../docs/verification/grounded-answer-selection-2026-09-23/sql-final.txt).
