# Step 3: slack-ask

Slack app_mention은 서명 검증과 event_id 멱등 처리 뒤 채널의 source와 질문자의 동의·Slack 매핑을 확인한다. 질문자의 user_id로 answer job을 만들고 search_as() 권한 검색과 인용 검증을 거쳐 스레드에 답한다.

실제 Slack 전송은 테스트 환경에서 외부 메시지를 만들기 때문에 자동 검증에서 제외한다.
