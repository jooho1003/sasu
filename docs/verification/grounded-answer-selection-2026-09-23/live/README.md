# 실제 로컬 DB 연결 검증

2026-09-23 01:23:28~01:25:23 UTC. **E2E 1건 통과(약 2분), 질문 job 5건 모두 done, 브라우저 오류 0건**. [Playwright 출력](test.txt) · [시나리오 결과](result.json).

`node scripts/review-qa.mjs setup`으로 격리 Docker `review-qa`에 0054를 적용하고, `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs dev`와 `node scripts/review-qa.mjs grounded-answer-test --reporter=line`을 실행했다. 실제 Postgres/Auth/PostgREST/pgvector·Next·Chromium·Groq·Voyage이며 모의 응답은 없다. 운영 DB·배포·Slack은 사용하지 않았다.

합성 문서·회의·비공개 원문·교육 조건/예외와 과거/최근 결정을 위한 Voyage 임베딩 10개를 사용했다. 합성 fixture 준비와 저장 결과 검사는 service client, 사용자 요청은 세션 RLS를 사용했다.

검증한 흐름:

1. 질문 → 202 → 자동 워커 → 고정 안내문과 원문 인용을 한 번씩 표시. DB ordinal 순서를 재열람에서도 유지한다.
2. 최신 무관한 결정들보다 오래된 2020년 결정과 이유를 찾고 원장 링크를 연다.
3. 문서·회의 원문 링크에 답변 ID를 전달한다. 질문자는 정확한 mark, 같은 자료를 읽을 수 있는 다른 멤버는 200/원문/mark 없음이다.
4. 공개 회의는 팀원에게 보이고 비공개 예산·다른 부서·다른 질문자의 답변은 API와 직접 RLS에서 차단된다.
5. 교육비 기본 한도와 필수 교육 예외는 한 인용에 연속 두 문단으로 들어간다. 실제 결과는 done/error_code null로, 허용해 둔 거절 경로를 사용하지 않았다.
6. 팀장 권한 회수와 자료 제거 뒤 기존 답변/원문은 404로 숨겨진다. 390px에서 가로 넘침이 없다.

Groq `openai/gpt-oss-120b` 5회, 입력 **6,102**, 출력 **3,232** 토큰([telemetry](llm-telemetry.json)). 9/22는 질문 4개·호출 5회·입력 5,707·출력 4,094였다. 이번에는 질문과 자료가 늘었으므로 직접적인 성능 개선률로 해석하지 않는다.

화면: [질문과 근거](lead-answer.png) · [문서 강조](document-evidence.png) · [회의 강조](meeting-evidence.png) · [조건과 예외 강조](conditions-exception-evidence.png) · [오래된 결정](old-decision.png) · [팀원 390px](member-answer-mobile.png) · [삭제 차단](deleted-evidence.png).

합성 스모크다. 원문의 업무 정확성, 업로드·수집 입력, 매직링크 이메일 전달, Slack DM/채널 실제 발송, 운영 배포를 검증한 것은 아니다. 로컬 합성 자료는 보존했고 테스트 전용 Next 서버는 검증 후 종료한다.
