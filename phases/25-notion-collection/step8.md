# Step 8: notion-oauth-webhook

노션 OAuth 연결과 webhook을 추가한다. **사람이 먼저 준비해야 하는 외부 설정이 있다. 없으면 코드를 쓰지 말고 `blocked`로 멈춘다.**

## 선행 조건 (사람 작업)

1. 노션 공개 통합(public connection) 생성·심사 제출과 승인 URL 발급, redirect URI 등록.
2. 서버 환경 변수 `NOTION_CLIENT_ID`·`NOTION_CLIENT_SECRET` 준비(값은 리포에 넣지 않는다).
3. webhook을 쓰려면 통합 설정에서 구독 URL 등록과 검증 토큰 입력(고객사 통합마다 수동).

`.env.local`에 위 이름이 없으면 `index.json`의 step 8을 `blocked`, `blocked_reason`에 빠진 항목을 적고 즉시 중단한다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-01), §8 ADR-060 경계, CLAUDE.md의 `/api/slack/oauth/*` 검증 규칙
- `/docs/ADR.md` ADR-052(OAuth callback 규칙), ADR-060
- `/docs/planning/노션_전체수집_설계.md` §3, §5(3차 webhook), §11
- 선례: `app/api/slack/oauth/start`·`callback`, `0033_slack_installations.sql`의 state 테이블·RPC, `lib/slack/installation.ts`
- step 2 산출물: `notion_installations`, `lib/notion-installation.ts`, `lib/notion-workspace.ts`
- 노션 공식 문서: authorization(토큰 응답·refresh), webhooks(이벤트·서명) — 확인일 기록

## 작업

1. OAuth: `notion_oauth_states`(Slack과 같은 구조: state 해시·조직·사용자·10분 만료·단회 소비)와 begin/consume RPC. `/api/admin/notion/oauth/start`(조직 관리자 세션·origin 검증, HttpOnly·Secure·SameSite cookie에 state) → `/callback`(세션·cookie·state 확인 → code 교환 → `complete_notion_installation(..., 'oauth', ...)`). 암호문에는 access·refresh 토큰과 만료 시각을 함께 담는다.
2. 토큰 회전: `withNotion…`이 만료 5분 전이면 조직 단위 advisory lock 아래 refresh 1회 → 새 암호문 저장. 동시에 두 job이 회전하지 않음을 테스트한다. refresh 실패(`invalid_grant`)면 설치를 `active=false`, 소스 `last_error='notion_reauth_required'`.
3. webhook `POST /api/notion/webhook`: `X-Notion-Signature`(HMAC-SHA256, 설치별 검증 토큰) 확인 후에만 처리. 본문을 로그에 남기지 않는다. `page.content_updated`·`page.created` → 해당 조직의 `notion_poll`을 즉시 예약(직접 본문을 읽지 않는다), `page.deleted` → 해당 소스 `notion_import` 예약(404 경로로 정리). 이벤트 id로 멱등(`ingest_events`). 3초 안에 200.
4. 관리자 연결 카드에 [노션으로 연결] 버튼을 추가하고 내부 토큰 방식은 "직접 토큰 입력"으로 남긴다.

## Acceptance Criteria

```bash
npx vitest run tests/notion-oauth*.test.ts tests/notion-webhook*.test.ts
npm run lint && npm run build && npm run test
```

- state 재사용·만료·다른 사용자 세션 → 거부. 서명 불일치 webhook → 401, DB 변화 0. 같은 이벤트 2회 → job 1건.
- 실제 노션 공개 통합으로 연결 1회·토큰 회전 1회·webhook 수신 1회의 실행 기록을 `docs/verification/notion-collection/step8.md`에 남긴다. 자동 테스트 통과를 실제 개통 성공으로 기록하지 않는다(ADR-052와 같은 규칙).

## 금지사항

- webhook payload만 믿고 본문을 갱신하지 마라. 이유: 폴링·직접 조회가 기준이고 webhook은 지연을 줄이는 신호다.
- client secret·토큰을 클라이언트 번들·로그·응답에 넣지 마라.
- 운영 환경 변수 설정·운영 배포·커밋 금지.
