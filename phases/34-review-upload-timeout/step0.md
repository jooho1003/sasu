# Phase 34 step 0 — 방치된 파일 업로드 정리

입력: [PRD IN-04·§8](../../docs/PRD.md), [ADR-073](../../docs/ADR.md), [design](../../docs/02-design/features/review-upload-timeout.design.md). 설계 문서를 읽고 아래 순서로 실행한다.

1. 격리 SQL 검사에 24시간 경계·녹음 제외·상태 제외·반복·권한을 먼저 추가해 실패를 확인한다.
2. migration 0065에 service role 전용 `sweep_abandoned_review_uploads()`를 추가한다.
3. `sweepReviewParts()` 워커 순서에 RPC를 연결하고 검토 화면의 `upload_timeout` 안내를 넣는다.
4. 격리 SQL, 관련 단위/화면 회귀, 변경 파일 lint, build를 실행하고 `docs/verification/review-upload-timeout-2026-09-30.md`에 실제 결과를 적는다.

운영 DB 적용·배포는 이 step에 포함하지 않는다. `execute.py`는 다른 미커밋 파일까지 stage하므로 이 작업에서는 사용하지 않는다.
