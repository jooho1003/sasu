# Step 1 — history-reopen

- SalesReview의 동의 lead 전용 History 영역과 기존 SalesSourceAiReview의 initialTaskId 읽기 모드. 새 검토는 기존 원문 선택에서 요청한다.
- 새로고침·더 보기·5상태·KST·읽기·닫기·열린 결과로 초점/화면 이동. 목록30초/상세2분·abort/latest·focus 현재 확인.
- 독립 리뷰가 찾은 취소된 A 상세의 늦은 오류 콜백을 JSON 직후 abort 검사로 고쳤다. 초기 Date.now는 effect에서 설정한다.
- 빌드 0/React lint0, 마지막 재검사 신규 이력3건 pass. 원문 변경/삭제/비활성/원칙/동의/역할을 목록/상세에서 숨겼다. 실제 고객 적합성은 미측정.
- History→기존 AI 읽기 컴포넌트→세션 GET→현재 입력 SQL/순수 인용 복원. Graft/Archify 실제 결과 없음. [실행 기록](../../docs/verification/sales-source-review-history-2026-10-01.md).
