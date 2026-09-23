# step1 실행 요약

- `AnswerSelection` 번호·연속 문단 범위 계약, offset 원문 추출, 실패 코드 재시도, 단일 JSON 입력, 고정 안내 본문을 구현했다. 카드 계약·`lib/llm.ts`는 이번 작업에서 변경하지 않았다.
- TDD red 실행 후 구현했다. 기존 `verifyAnswerCitations` 이중 방어·완료 RPC·인용 순서를 유지하며 `groundAnswer` 호출은 0개다. 문체 표본 스크립트의 답변 경로도 번호 선택으로 전환했다.
- 실제 Groq 수정 전 A08~A10 2/3 → 최초 변경 9/10 → 일반 예외/기본규칙 선택 지시 1회 보완 후 10/10. 기대값은 유지했다. A08~A10 입력 토큰 6,858 → 4,484, 출력 2,159 → 1,380. 합성 스모크이며 업무 정확도가 아니다.
- 관련 117검사·전체 1,383검사·lint·프로덕션 빌드 통과. 2,400자 인용 8개 Slack 길이 회귀도 통과했다. Slack 실제 발송은 하지 않았다.
- [실행 기록·수정 전후 표](../../docs/verification/grounded-answer-selection-2026-09-23/README.md) · [코드 관계·수동 흐름도](../../docs/verification/grounded-answer-selection-2026-09-23/dependencies.md). Graft/Archify 실행 결과는 도구 부재로 누락이다.
