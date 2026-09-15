# Step 0 — Slack ASK 완주

## 입력
- PRD §3·§6-5·§8·§11, ARCHITECTURE §6·§8, ADR-051.
- `app/api/slack/events/route.ts`, `lib/pipeline/answer.ts`, `lib/jobs.ts`, `lib/slack/post.ts`.

## 작업
- 단일 부서 DM 질문과 복수 부서 `부서 이름: 질문` 선택을 지원한다. 소속·동의는 SQL에서 재검증한다.
- 미연결·미동의·잘못된 질문은 원문을 저장하지 않고 안내한다. 채널 안내는 질문자에게만 표시한다.
- 처리 안내 메시지를 만들고 저장된 답변으로 갱신한다. 답변 완료와 전송 작업 예약은 DB 트랜잭션으로 묶는다.
- 전송 워커는 매번 SQL can_see와 인용을 검증하고, 기존 메시지를 갱신하며 재시도한다. LLM 재실행은 없다.
- 신규 lib 모듈은 실패하는 테스트를 먼저 작성한다. 운영 반영은 사용자 테스트 이후의 별도 단계다.

## 검증
`npm run lint`, `npm run build`, `npm run test`, 격리 SQL 하니스, 로컬 브라우저 회귀.
DM/채널 범위·멤버십/동의 회수·중복·DB 실패·전송 실패·스윕·게스트 무쓰기를 검증한다.
