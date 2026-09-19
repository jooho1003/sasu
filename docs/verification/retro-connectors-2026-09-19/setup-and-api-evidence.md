# 회고 연결 설정·공식 API 근거 — 2026-09-20

## 설정과 실행 범위

회고는 서버의 `SASU_RETRO_ENABLED=true`로 켠다. 전용 `RETRO_CONNECTION_ENCRYPTION_KEY`는 32바이트 난수를 base64로 인코딩한 값이며 서버 비밀 저장소에만 둔다. 사용자·부서·제공자에 묶은 AES-256-GCM 암호문을 저장한다. 키를 잃거나 바꾸면 기존 연결을 다시 인증해야 한다. 예시 환경 파일에는 값이 없다.

OAuth 제공자는 `.env.example`의 해당 `RETRO_<PROVIDER>_CLIENT_ID/SECRET`을 설정하고 공개 HTTPS 주소의 `/api/retro/connect/<provider>/callback`을 등록한다. `NEXT_PUBLIC_APP_URL`은 공개 주소이며 비밀 키는 `NEXT_PUBLIC_`에 넣지 않는다. 서버 설정이 없는 OAuth 선택지는 제공하지 않는다. GitHub·Figma·세일즈맵의 개인 키와 원티드·스티비의 승인된 회사 요약 키는 사용자가 설정 화면에서 입력한다. 임의 API URL을 입력하는 방식은 지원하지 않는다.

Atlassian은 `RETRO_ATLASSIAN_*` 한 쌍을 사용한다. Zendesk는 SaaS용 **global OAuth**의 `RETRO_ZENDESK_GLOBAL_CLIENT_ID/SECRET`이며 고객의 로컬 OAuth 앱이나 관리자 API 토큰으로 대체하지 않는다. HubSpot은 아래의 user-level 앱이어야 한다. Google은 Calendar·YouTube·GA4의 필요한 읽기 권한을 개별 요청한다.

Vercel CLI가 설치되지 않았다. 환경변수 확인·배포·로그 작업을 이어갈 환경에는 `npm i -g vercel` 설치를 권장한다. 이번에는 CLI 설치·배포·운영 환경변수 변경을 하지 않았다. 기존 marketplace discovery에서 해당 개인 회고 연결의 관리형 대체 통합을 찾지 못해 승인된 제공자 API 어댑터를 사용했다.

## 구현한 제공자 17개

공식 계약을 읽고 합성 응답으로 검증한 목록이다. **실계정 권한·요금제·OAuth 교환·실제 응답 확인은 별도 필요**하다. 조직 소유권과 실제 작성자를 혼동하지 않으며 작성자 확인 필드가 없으면 개인 활동을 만들지 않는다.

| 제공자 | 구현한 범위·주요 제한 | 공식 근거 |
|---|---|---|
| GitHub | `/user` 개인 계정·선택 저장소. 본인 PR·리뷰·push. 이벤트 API의 보존 기간·페이지 한도 밖은 수집하지 못함 | [사용자](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), [활동](https://docs.github.com/en/rest/activity/events) |
| Figma | `/me`와 선택 파일의 버전·댓글 작성자 비교. 알려진 파일만 조회 | [인증](https://developers.figma.com/docs/rest-api/authentication/), [파일 버전](https://developers.figma.com/docs/rest-api/version-history-endpoints/) |
| Google Calendar | 본인 기본 달력의 등록 일정. 참석자 이름·이메일 미선택, 등록 사실을 실제 참석·면접 진행으로 표현하지 않음 | [일정 목록](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) |
| Notion | 개인 OAuth 소유자 user ID와 선택 페이지의 `last_edited_by`·댓글 작성자 비교. API에 없는 변경 이력·diff는 만들지 않음 | [OAuth](https://developers.notion.com/docs/authorization), [페이지](https://developers.notion.com/reference/retrieve-a-page) |
| Jira | 개인 3LO·cloud ID·선택 프로젝트. 본인 changelog/worklog. 제한된 최근 issue/페이지를 검사하며 전체 감사 로그를 보장하지 않음 | [3LO](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/), [issues](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/), [worklogs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/) |
| Confluence | 개인 3LO·선택 페이지의 버전·footer comment 작성자. 문서 본문 전체 미수집 | [버전](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/), [댓글](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-comment/) |
| Linear | user OAuth·PKCE·read. 선택 issue의 본인 `IssueHistory.actorId`, 제한된 페이지 | [OAuth](https://linear.app/developers/oauth-2-0-authentication), [GraphQL](https://linear.app/developers/graphql), [IssueHistory](https://studio.apollographql.com/public/Linear-API/variant/current/schema/reference/objects/IssueHistory) |
| HubSpot | platformVersion `2026.09` user-level 앱. introspection의 active/client/user/isUserLevel을 검사. calls/meetings/emails/notes의 작성 사용자 일치 시 기록 생성 사실만 사용. 담당자 지정만으로 개인 활동을 만들지 않음 | [user-level 앱](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/user-level-apps), [introspection](https://developers.hubspot.com/docs/api-reference/latest/authentication/oauth-tokens/token-introspect), [calls](https://developers.hubspot.com/docs/api-reference/latest/crm/activities/calls/guide) |
| Pipedrive | OAuth `/users/me`, 활동 owner와 creator가 모두 본인. 고객 필드·본문 미선택, 생성 사실만 사용 | [OAuth](https://pipedrive.readme.io/docs/marketplace-oauth-authorization), [사용자](https://pipedrive.readme.io/docs/marketplace-getting-user-data), [활동](https://developers.pipedrive.com/docs/api/v1/Activities) |
| 세일즈맵 | 개인 키 `/user/me`, memo owner 일치. 메모 본문·상대 개인정보 미선택 | [me](https://salesmap.gitbook.io/developers/api-reference/crm/user.me), [memo](https://salesmap.gitbook.io/developers/api-reference/crm/memo/memolist) |
| Intercom | 개인 OAuth `/me` admin ID, 본인 conversation part만. 고객·상대 메시지 제외. 지역별 SSO/OAuth 및 API routing은 실계정 확인 필요 | [인증](https://developers.intercom.com/docs/build-an-integration/learn-more/authentication), [OAuth](https://developers.intercom.com/docs/build-an-integration/learn-more/setting-up-oauth), [검색](https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/searchconversations) |
| Zendesk | global OAuth, tenant와 본인 ID를 credential에 함께 묶음. `/users/me/tickets/assigned`에서 본인 명의 Comment만, VoiceComment·일부 자동/대리 표시 제외. 작성자 지정은 대리 작성이 가능하므로 **내 명의 상담 기록**이라고 표시, 실제 처리 완료로 단정하지 않음. audit API 미사용 | [OAuth](https://support.zendesk.com/hc/en-us/articles/4408845965210-Using-OAuth-authentication-with-your-application), [갱신](https://developer.zendesk.com/documentation/authentication/refresh-token/), [댓글](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/) |
| 원티드 | 팀장 회사 키. `wanted-client-id`, `wanted-client-secret`, `Authorization` 헤더. `/stat/application/summary` 숫자 5개만. 지정일 **지원자 집합의 현재 상태**이며 그날 상태 전환 건수로 해석하지 않음. 지원자 목록 미호출 | [현재 OpenAPI 명세](https://openapi.wanted.jobs/v1/openapi.json), [문서](https://openapi.wanted.jobs/api-docs/v1/) |
| 스티비 | 팀장 workspace AccessToken·프로 요금제 이상. `/v2/emails` SENT·sentTime 정렬 후 날짜 필터. id/status/sentTime만, 수신자·제목·작성자 이름 미선택. 개인 귀속 불가 → 부서 요약 | [공식 명세](https://developers.stibee.com/) |
| Mailchimp | 개인 OAuth metadata의 `dc`를 `us숫자`로 검증하고 root `login_id`에 묶음. 캠페인의 발송 시각·발송 수만 `metric_snapshot`으로 사용. 개인 작성자 증거로 쓰지 않음 | [OAuth](https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/), [root](https://mailchimp.com/developer/marketing/api/root/), [공식 OpenAPI](https://github.com/mailchimp/mailchimp-client-lib-codegen/blob/main/spec/marketing.json) |
| YouTube | OAuth `forMine` 영상의 게시 시각·제목. 연결 채널의 게시이며 개별 업로더를 입증하지 않음 | [search.list](https://developers.google.com/youtube/v3/docs/search/list) |
| GA4 | OAuth·선택 property, 하루 집계 3개. 사용자 차원·고객 식별정보 미사용. 관찰 문장만 허용 | [Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/basics) |

HubSpot의 `hs_created_by_user_id` 등 실제 계정별 반환 필드는 sandbox에서 확인해야 한다. 누락 시 임의로 owner ID로 대체하지 않고 해당 행을 버린다. 개인 OAuth라도 원 서비스의 권한이 넓을 수 있으므로 본인 작성자 비교·선택 소스 제한을 함께 적용한다.

## 구현하지 않은 제공자와 재개 조건

| 제공자 | 확인 사실·판정 | 재개 조건 |
|---|---|---|
| 채널톡 | [공식 인증](https://developers.channel.io/en/articles/20516f31)은 Channel Desk에서 발급한 Access Key/Secret을 요구한다. 개인 identity·개인 권한으로 한정되는 서버 인증을 확인하지 못했다. Documents API 인증 문서는 상담 API와 다르므로 근거로 쓰지 않음 | 개인 인증 계약 확인 또는 조직 수집 예외를 PRD·ADR에서 별도 결정 |
| Greenhouse | [Harvest 인증](https://docs.greenhouse.io/harvest.html#authentication)은 조직 credential 관리 권한으로 발급하며 endpoint 접근이 전체/없음 방식이다. 현재 개인 연결 원칙에 맞는 경계를 확인하지 못함 | 개인 OAuth·현재 사용자 확인 또는 별도 범위 결정 |
| Lever | [OAuth](https://hire.lever.co/developer/oauth)는 Super Admin이 조직을 대표해 승인한다고 명시한다. 개인 승인으로 간주할 수 없음 | 조직 단위 수집 허용에 대한 별도 결정 또는 개인 계약 확인 |
| Workable | [공식 OAuth](https://workable.readme.io/page/oauth)는 파트너 등록 후 `resource=user`를 지원한다. 조직 전용이라고 단정하지 않는다. 현 단계에는 승인된 파트너 앱·현재 actor를 입증하는 응답 계약·sandbox가 없음 | 파트너 credential·개인 ID 계약 확인 후 활동 actor 비교 구현 |
| Meta | 설계 §11의 App Review·자사 asset 권한·게시 날짜 필터 확인이 아직 없음 | 승인 앱/asset과 공식 계약 확인 후 구현·실측 |

원티드·스티비의 회사 집계 예외가 다른 조직 관리 API까지 허용하는 것은 아니다. VoIP는 설계의 법률 자문 게이트를 유지한다. 위 대기 항목을 임의 개인 ID 입력·조직 관리자 토큰으로 우회하지 않았다.
