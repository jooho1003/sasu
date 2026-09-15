# Step 0 — Slack 답변 인용 표시

## 읽어야 할 파일
- `docs/PRD.md` §6-5·§8·§11, `docs/ARCHITECTURE.md` §6·§8, ADR-015·034·035·049·050.
- `lib/pipeline/answer.ts`, `lib/search.ts`, `lib/slack/post.ts`, `tests/pipeline/answer-persistence.test.ts`.

## 작업
- `lib/slack/answer.ts`의 순수 메시지 포매터를 테스트부터 구현한다.
- 답변과 모든 검증된 인용, 발언자/결정자·KST 시각·출처를 Block Kit와 알림/스크린리더용 text에 제공한다.
- 원문과 모델 텍스트는 plain_text로 표시하고 자동 멘션·링크 미리보기를 끈다. Slack 길이·블록 수 상한을 넘으면 본문 일부를 보내지 말고 고정 안내로 대체한다.
- 저장 성공 뒤 채널 범위 검색에서 확인한 인용 ID에 대해서만 worker가 Slack timestamp 메타데이터를 조회한다. `chat.getPermalink` 실패 시에도 인용문은 표시하고 부서 페이지로 연결한다.
- 사용자 경로/RLS/검색 SQL/LLM 호출 수는 그대로 유지한다. Slack DM 묻기·진행 메시지·실패 전달 재시도는 별도 후속 단계이며 구현했다고 기록하지 않는다.

## 검증
```powershell
npx vitest run tests/slack/answer.test.ts tests/slack/post.test.ts tests/pipeline/answer-persistence.test.ts tests/slack-events-route.test.ts
npm run lint
npm run build
npm run test
```
- 채널/사용자 검색 범위, 인용 저장 실패·중복 완료·잘못된 초안·Slack 조회 실패·포맷 주입·길이 경계를 검증한다.
- 스크린샷은 실제 Slack 운영 확인 후에만 제출 자료로 사용한다.

## 운영 반영
- 리뷰와 회귀 검증을 마친 구체적 커밋/변경 목록·롤백 대상을 준비한 뒤 사용자 승인 범위를 확인한다(ADR-049).
- 이 step 자체는 운영 배포·실제 Slack 게시·LLM 실행을 승인하지 않는다.

## 완료 — 2026-09-15
- 포매터·원문 링크·저장 후 Slack 회신 연결 구현 완료.
- lint/build, 단위 937개, 격리 SQL 109개·권한 조합 2,016개, E2E 26개 통과.
- [실행 기록](../../docs/verification/slack-answer-citations-2026-09-15.md). 운영 검증은 step1에서 진행한다.
