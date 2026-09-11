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

## 실환경 검증 결과 — 2026-09-11 (새 워크스페이스)

- [x] Interactivity Request URL 확인 — `https://sasu-alpha.vercel.app/api/slack/interactions` 활성화
- [x] 실제 채널 이벤트 수신 — `#소셜`의 테스트 메시지가 `/api/slack/events`를 거쳐 `items`에 저장됨
- [x] 분류·카드 생성 — `decision`, confidence `0.9`; `make_card` 완료
- [x] 결정 카드 DM — 담당자 1명에게 도착, `slack_delivery_status=sent`
- [x] DM 버튼·모달 — [결정] → 결과·사유 입력 모달 → [결정 기록] 동작
- [x] 원장 기록 — request 상태 `decided`, `decisions` 1건, lead time `1분`
- [x] 중복 결정 방지 — 재제출 시 `이미 사수 파일럿 팀장이(가) 결정한 카드입니다.` 응답, `decisions`는 1건 유지
- [ ] 7일 백필 및 미동의 멤버 제외 — 별도 검증 필요
- [ ] Slack API 429·DM 불가 장애 경로 — 별도 검증 필요

### 검증 중 발견한 후속 이슈

- 결정 후 원본 `#소셜` 스레드에는 결과 공지가 생성되지 않았다. 현재 `app/api/slack/interactions/route.ts`는 DM 메시지만 갱신한다.
- DM의 [원장에서 보기] 링크가 `http://localhost:3000/...`로 생성됐다. Production 환경 변수 `NEXT_PUBLIC_APP_URL` 설정이 필요하다.
- 이번 입력의 `embed` job은 3회 재시도 후 `failed(job_failed)`가 됐고 `items.embedding`은 비어 있다. 카드 경로에는 영향이 없었지만 Q&A·유사검색 전에는 원인 확인이 필요하다.

## 사람 확인 — Slack 앱 설정 후 진행

- [x] Interactivity Request URL을 `https://sasu-alpha.vercel.app/api/slack/interactions`로 등록
- [x] 실제 결정 카드 DM이 담당자 한 명에게만 도착
- [x] DM의 결정 버튼이 모달을 열고, modal submission이 원장에 1건만 기록
- [x] 같은 버튼을 두 번 눌렀을 때 중복 결정 없이 이미 처리된 카드 안내
- [ ] source 연결 후 백필을 시작해 7일 메시지가 저장되고 미동의 멤버 메시지는 저장되지 않음
- [ ] Slack API 429 또는 DM 불가 시 `slack_delivery_status=failed`와 안전한 error code만 남음

실제 Slack 워크스페이스 호출은 Slack 앱 Request URL·채널 초대·동의 상태가 사람 설정으로 확인되기 전에는 실행하지 않는다.
