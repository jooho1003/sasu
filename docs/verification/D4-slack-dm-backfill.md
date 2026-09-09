# D4 Slack DM·7일 백필 검증

작성일: 2026-09-10 (KST)

## 자동 검증

- [x] `npm test` — 13개 파일, 102개 통과
- [x] `npm run lint`
- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] `npm run test:rls` — 6개 통과
- [x] `npx supabase db push --db-url $SUPABASE_DB_URL` — `0005_slack_delivery.sql` 적용

## 코드 경로

- 카드 생성: `decision_requests` insert → citations 저장 → `send_slack` job을 카드 ID 기준 dedupe enqueue
- DM: `lib/slack/blocks.ts`와 `lib/slack/post.ts` → `conversations.open` → `chat.postMessage`
- 버튼: `/api/slack/interactions` → signing secret 검증 → 담당자/lead 재검증 → `views.open`
- 모달: Slack 사용자 매핑으로 결정자를 확정 → `decisions.request_id unique` → 카드 상태 갱신 → DM 메시지에 원장 링크
- 백필: `POST /api/d/[dept]/backfill` → lead·source 검증 → `slack_backfill` → 최근 7일 `conversations.history` 페이지네이션 → 동의한 발언만 기존 ingest/classify 경로로 저장

## 사람 확인 — Slack 앱 설정 후 진행

- [ ] Interactivity Request URL을 `https://<배포도메인>/api/slack/interactions`로 등록
- [ ] 실제 결정 카드 DM이 담당자 한 명에게만 도착
- [ ] DM의 결정/보류/반려 버튼이 모달을 열고, modal submission이 원장에 1건만 기록
- [ ] 같은 버튼을 두 번 눌렀을 때 중복 결정 없이 이미 처리된 카드 안내
- [ ] source 연결 후 백필을 시작해 7일 메시지가 저장되고 미동의 멤버 메시지는 저장되지 않음
- [ ] Slack API 429 또는 DM 불가 시 `slack_delivery_status=failed`와 안전한 error code만 남음

실제 Slack 워크스페이스 호출은 Slack 앱 Request URL·채널 초대·동의 상태가 사람 설정으로 확인되기 전에는 실행하지 않는다.
