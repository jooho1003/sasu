# Phase 23 · step 4-B6 문서 요약 병합

2026-09-29. 입력: PRD ACC-03, 상세 설계 §11.4·V16, [설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md), [step](../../../phases/23-browser-meeting-recording/step4b6-summary-merge.md).

- chunk 추출을 각 원문으로 먼저 검증한다. 두 개 이상 유효 chunk이면 검증된 추출 결과만 `llm.structured("summarize_document", …)`에 한 번 병합 요청하고, 병합 결과를 전체 원문으로 재검증한다. 인용이 0개면 `summary_failed`로 저장한다.
- 같은 item의 서로 다른 원문 문장은 보존하고, 동일 문장만 중복 제거한다. 추출·병합 지시문에 자료 속 명령을 따르지 말라고 명시했다.
- TDD 실패를 먼저 확인했고 `tests/pipeline/document-summary.test.ts` 5건이 통과했다. 거짓 인용은 추출 입력과 최종 출력에서 각각 제거하는 사례, 단일 chunk에서 불필요한 병합이 없는 사례를 포함한다.
- 최종 `npm run test` 159파일·1,704건, 격리 SQL 280건, build·변경 파일 ESLint·문구 검사 통과. 전체 lint 마지막 실행은 파일 스캔 정체로 중단했다. [최종 범위](README.md)에 기록했다.
- 실제 Groq를 이용한 V16 지시문 문서의 의미 판정은 이번 로컬 단위 검증으로 대체할 수 없다. 모델 출력의 인용 문자열 검증과 사람이 보는 내용 정확도는 별도 판정한다.

코드 관계는 `document_summaries` job → service role `items`/`dept_glossaries` 읽기 → chunk 추출 → 원문 검증 → 병합 1회 → 원문 재검증 → 요약 행 쓰기다. 현재 세션에서 Graft·Archify 실행 도구를 찾지 못했다. 이 흐름은 수동 코드 대조이며 도구 출력으로 주장하지 않는다.
