# 부서별 당일 회고 자동화 — 외부 API 연동 가능성 조사 (개발·마케팅·인사)

- **조사일**: 2026-09-19
- **대상**: 사수(SASU) "부서별 당일 회고 자동화" 설계를 위한 개발팀·마케팅팀·인사팀 외부 서비스 API 조사
- **방법**: 1차 출처(공식 문서·공식 저장소)만 근거로 사용. WebFetch/WebSearch로 원문 직접 확인. 블로그·뉴스·튜토리얼은 근거로 쓰지 않음. 렌더링 실패·정보 부재는 "확인 못 함"으로 명시.

## 결론 3줄

1. 개발팀은 GitHub REST/Search API, Jira Cloud REST v3, Linear GraphQL API 모두 시간 필터(업데이트 시각 기준)를 공식 지원하므로 "당일 활동"을 안정적으로 뽑아낼 수 있다. 단 Jira는 `/rest/api/3/search`가 이미 제거되어 `/rest/api/3/search/jql`로만 조회해야 하고, Linear는 필드 단위 변경 이력(issueHistory) 존재를 공식 문서에서 확인하지 못했다.
2. 마케팅팀은 GA4·Meta·YouTube 모두 날짜 범위 조회를 공식 지원하지만, Meta는 페이지/광고 소유 여부에 따라 App Review(Advanced Access)가 필요해질 수 있고, 국내 서비스(스티비·네이버 검색광고)는 공식 API가 존재하되 이번 조사에서는 시간 필터 파라미터 원문을 확인하지 못했다(문서가 JS 렌더링 SPA라 자동 조회 실패).
3. 인사팀은 Greenhouse·Lever·Workable 모두 "업데이트 시각 이후" 필터를 공식 지원해 그날의 채용 활동을 뽑기 좋고, Google Calendar도 시간 범위 조회가 가능하다. 다만 Greenhouse는 `updated_after`가 아니라 `last_activity_after`이고, Google Admin SDK Reports API는 감시 성격이 맞다는 것을 문서 취지상 확인했으나 "슈퍼관리자 필수"라는 명시적 문구는 찾지 못했다. 국내 원티드는 채용 정보 제공용 OpenAPI 포털은 있으나 지원자·활동 이력 API 존재 여부는 확인하지 못했고, 플렉스(flex.team)는 공개 개발자 API 문서를 찾지 못했다.

---

## 1. GitHub REST API (개발)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 사용자 활동 이벤트 | `GET /users/{username}/events` — CreateEvent, PushEvent, IssuesEvent 등 다양한 이벤트 타입 | 최근 30일 이내 이벤트만 포함("Only events created within the past 30 days will be included"), 타임라인 최대 300개, 페이지당 최대 100개(기본 30개) | https://docs.github.com/en/rest/activity/events?apiVersion=2022-11-28 |
| PR 목록 | `GET /repos/{owner}/{repo}/pulls` — `sort`(created/updated/popularity/long-running), `direction`; 응답 필드 `created_at`/`updated_at`/`closed_at`/`merged_at`/`user` | `since` 파라미터는 문서에 없음(정렬만 가능, 클라이언트에서 날짜 필터링 필요) | https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28 |
| PR 리뷰 | `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews` — `user.login`, `state`, `submitted_at`, `body` | - | https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28 |
| 검색(이슈/PR) | `GET /search/issues` — `q`에 `is:pr author:@me updated:>=YYYY-MM-DD` 같은 한정자(qualifier) 사용 가능("The query contains one or more search keywords and qualifiers") | 인증 시 분당 30회 | https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28 ; 웹 검색 문법 근거: https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests |
| 커밋 검색 | `GET /search/commits` — "Find commits via various criteria on the default branch" | 레이트리밋 별도 명시 없음(확인 못 함) | https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28 |
| 인증 스코프 | Fine-grained PAT: "Pull requests"(PR 접근), "Contents"(커밋, `GET /repos/{owner}/{repo}/commits`), "Events"(조직 이벤트 `GET /users/{username}/events/orgs/{org}`) | - | https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2022-11-28 |
| OAuth 스코프 | `repo` — "Grants full access to public and private repositories including read and write access to code, commit statuses, ... webhooks"; `read:user` — "Grants access to read a user's profile data." | - | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps |
| 레이트리밋 | 일반 인증 사용자 5,000 req/hour, GitHub Enterprise Cloud 조직 소속 앱 15,000 req/hour | - | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28 |

### 가져올 수 없는 것 · 확인 못 한 것

- `GET /repos/{owner}/{repo}/pulls`에는 `since`(수정 시각 필터) 파라미터가 없다 — updated 기준 필터링이 필요하면 `sort=updated`로 정렬 후 클라이언트에서 자르거나 Search API(`updated:>=`)를 써야 한다.
- Search API의 `author:@me updated:>=` 조합이 REST `GET /search/issues`에서 웹 UI와 완전히 동일하게 동작하는지는 REST 전용 문서에서 별도 확인하지 못했다(REST Search 문서는 qualifier 사용을 일반적으로만 언급).
- 커밋 검색(`/search/commits`) 전용 레이트리밋 수치는 문서에서 확인하지 못했다.
- 웹훅: 이번 조사 항목에는 없었으나, PR/PR 리뷰/이벤트 각각에 대응하는 리포지토리 웹훅(`pull_request`, `pull_request_review` 등)이 존재하는 것은 GitHub 웹훅 이벤트 목록에서 일반적으로 알려져 있으나 이번 조사에서 원문 대조는 하지 않았다 — `[추정]`.

### 회고 활동 항목 변환 필드

| 회고 필드 | GitHub 소스 필드 |
|---|---|
| 제목 | PR: `title` / 이벤트: `type` + repo 이름 |
| 시각 | PR: `created_at`/`updated_at`/`merged_at`, 리뷰: `submitted_at`, 이벤트: `created_at` |
| 작성자 | `user.login` |
| 종류 | PR 생성/머지, 리뷰 제출(`state`: APPROVED/CHANGES_REQUESTED/COMMENTED), 이벤트 타입(PushEvent, IssuesEvent 등) |

---

## 2. Jira Cloud REST API v3 (개발)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| JQL 시간/사용자 함수 | `currentUser()`, `startOfDay()` 등 — "currentUser() function finds issues related to the current user"(검색 스니펫 인용, 원문 상세 인용은 페이지 렌더링 실패로 대조 못 함) | 로그인 사용자 기준 | https://support.atlassian.com/jira-software-cloud/docs/jql-functions/ (본문 전체 대조 실패 — 확인 못 함 항목 참조) |
| 이슈 검색 | `GET /rest/api/3/search/jql` (신규) | **`/rest/api/3/search`는 완전히 제거됨** — "The legacy endpoint `/rest/api/3/search` is deprecated and has been fully removed from Jira Cloud." "Please migrate all uses of this endpoint to `/rest/api/3/search/jql`." 페이지네이션은 `nextPageToken` 사용(더 이상 `startAt` 아님) | https://confluence.atlassian.com/jirakb/run-jql-search-query-using-jira-cloud-rest-api-1289424308.html |
| 이슈 changelog | `GET /rest/api/3/issue/{issueIdOrKey}/changelog` | 상태 전이 시각·작성자·필드 변경 내역 포함 — API 그룹 페이지가 너무 커서 이번 조사에서 필드 스펙 원문 전체 대조는 실패(확인 못 함) | https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/ |
| OAuth 2.0 (3LO) 스코프 | `read:jira-work` — "Read Jira project and issue data, search for issues and objects associated with issues like attachments and worklogs." | 이슈 검색·첨부파일·워크로그 조회 포함 | https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/ |

### 가져올 수 없는 것 · 확인 못 한 것

- `startOfDay()`/`currentUser()` JQL 함수의 정확한 공식 정의 문구는 support.atlassian.com 페이지가 너무 커서(콘텐츠 truncated) 원문 대조를 완료하지 못했다. WebSearch 스니펫으로는 "currentUser() 함수는 현재 사용자와 관련된 이슈를 찾는다", "startOfDay()는 특정 시간대 기준으로 이슈를 필터링한다"는 정도만 확인됨 — 정확한 문구는 **확인 못 함**.
- changelog 응답의 필드별 상세 스키마(예: `items[].field`, `items[].fromString`, `items[].toString`)는 API 그룹 페이지 truncation으로 원문 대조 실패.
- 워크로그 API(`/rest/api/3/issue/{issueIdOrKey}/worklog`)는 이번 조사에서 별도 원문 대조를 하지 않음.
- `read:jira-work` 하나로 changelog까지 커버되는지 명시적 문구는 확인하지 못했다(문서는 "이슈와 연관된 객체" 정도로만 언급) — `[추정]`으로 changelog도 포함될 가능성 높음.
- 웹훅: Jira는 Webhook API(`/rest/api/3/webhook`)가 존재하는 것으로 알려져 있으나 이번 조사에서 원문 대조는 하지 않음 — `[추정]`.

### 회고 활동 항목 변환 필드

| 회고 필드 | Jira 소스 필드 |
|---|---|
| 제목 | 이슈 `summary` |
| 시각 | `updated`, changelog `created`(전이 시각) |
| 작성자 | `assignee`/`reporter`, changelog `author` |
| 종류 | changelog의 상태 전이(`status` 필드 변경), 워크로그 등록 |

---

## 3. Linear GraphQL API (개발)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 인증 — API Key | "A Linear API key is ... sent in the Authorization header" (개인 스크립트용), `Authorization: <API_KEY>` | 정적 키, 자동 만료 없음 | https://linear.app/developers/graphql |
| 인증 — OAuth 2.0 | 액세스 토큰을 `Authorization: Bearer <ACCESS_TOKEN>`으로 사용, `client_credentials` grant 지원(서버-서버) | 타 사용자 대상 앱 개발 시 권장 | https://linear.app/developers/graphql ; https://linear.app/developers/oauth-2-0-authentication |
| OAuth 스코프 | `read`(기본, 항상 포함) — "Read access for the user's account. This scope will always be present.", 그 외 `write`, `issues:create`, `comments:create`, `timeSchedule:write`, `admin` | - | https://linear.app/developers/oauth-2-0-authentication |
| 웹훅 | "Linear supports data change webhooks" — issues, issue comments, projects, cycles 등 이벤트 지원 | - | https://linear.app/developers/oauth-2-0-authentication (검색 스니펫 경유, 원문 웹훅 페이지 별도 대조 못 함) |

### 가져올 수 없는 것 · 확인 못 한 것

- **`issueHistory`/`issue.history` 필드의 존재와 스키마를 공식 문서에서 확인하지 못했다.** `developers.linear.app/docs/graphql/working-with-the-graphql-api` 등 GraphQL 스키마 문서를 직접 열람하지 못해(리다이렉트/검색 스니펫 수준) 필드명·인자를 검증하지 못함. GraphQL API는 스키마 자체가 진실이므로, 실제 사용 전 GraphQL introspection으로 직접 확인이 필요하다.
- `updatedAt` 기준 정렬/필터 쿼리 문법(정확한 `filter: { updatedAt: { gte: ... } }` 형태인지)은 원문에서 확인하지 못했다 — `[추정]`(Linear GraphQL API 관례상 지원 가능성 높음).
- 웹훅 이벤트 목록 원문 전체는 별도 페이지 열람 실패로 확인 못 함.

### 회고 활동 항목 변환 필드

| 회고 필드 | Linear 소스 필드(확인된 범위) |
|---|---|
| 제목 | 이슈 `title`(GraphQL `Issue.title`, 스키마 자체는 미대조) |
| 시각 | `updatedAt`(존재 추정, 원문 미확인) |
| 작성자 | `assignee`/`creator`(추정, 원문 미확인) |
| 종류 | 상태 변경, 코멘트(웹훅 이벤트 카테고리 기준) |

---

## 4. Google Analytics Data API (GA4) (마케팅)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 리포트 실행 | `runReport` — `dateRanges`(배열, `DateRange` 객체, "Date ranges of data to read") | - | https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport |
| 지표/차원 예시 | `date`(YYYYMMDD), `eventName`, `country`, `deviceCategory`, `defaultChannelGroup` 등 차원, `activeUsers`/`sessions`/`screenPageViews`/`eventCount`/`conversions` 등 지표 | 정확한 기본값 목록은 별도 "Dimensions & Metrics" 참조 필요 | https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema |
| OAuth 스코프 | `https://www.googleapis.com/auth/analytics.readonly` 또는 `https://www.googleapis.com/auth/analytics` | - | https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport |

### 가져올 수 없는 것 · 확인 못 한 것

- "기본으로 제공되는 지표"라는 개념 자체가 GA4 Data API에는 없고(요청 시 지표를 명시적으로 지정해야 함), 이번 조사에서 "기본값" 목록 원문은 확인하지 못했다.
- 웹훅: GA4 Data API는 풀(pull) 방식 리포팅 API이며 웹훅을 제공하지 않는 것으로 보이나, 이번 조사에서 "웹훅 없음"을 명시하는 원문 문구는 찾지 못했다 — `[추정]`.

### 회고 활동 항목 변환 필드

| 회고 필드 | GA4 소스 필드 |
|---|---|
| 제목 | 채널/캠페인 차원(`defaultChannelGroup` 등) + 지표 요약 |
| 시각 | `date` 차원(일 단위, 시각 단위 아님) |
| 작성자 | 없음(집계 데이터, 개인 작성자 개념 없음) |
| 종류 | 방문/전환/이벤트 등 지표 카테고리 |

---

## 5. Meta Graph API (마케팅)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 페이지 게시물 목록 | `GET /{page-id}/posts` — 필드: `created_time`("게시물이 최초로 게시된 시각"), `updated_time`, `from`(작성 페이지/그룹), `message` | 필요 권한: `pages_read_engagement`, `pages_read_user_content`(페이지 소유자 아닐 시 추가 조건) | https://developers.facebook.com/docs/graph-api/reference/page/posts/ |
| 인스타그램 미디어 | `GET /{ig-user-id}/media` — "supports time-based pagination. Include `since` and `until` query-string parameters with Unix timestamp or `strtotime`" | 필요 권한: `instagram_basic` + (`pages_read_engagement` 또는 `pages_show_list`), Business Manager 경유 시 `ads_management`/`business_management` 추가 필요할 수 있음 | https://developers.facebook.com/docs/instagram-api/reference/ig-user/media |
| 광고 캠페인 성과 | `GET /{ad-account-id}/insights` | 필요 권한: `ads_read` | https://developers.facebook.com/docs/marketing-api/insights |
| 접근 수준 | Standard Access: 앱에 역할이 부여된 사용자만 대상, 모든 앱에 자동 승인 / Advanced Access: 모든 앱 사용자 대상, 비즈니스 인증 필수, "경우에 따라서 개별적인 권한과 기능에 따라 추가적인 앱 검수(App Review)가 필요할 수 있습니다" | 우리 회사 소유 페이지/광고 계정만 다룬다면 Standard Access로 충분할 가능성 높음(권한별 App Review 여부는 개별 확인 필요) | https://developers.facebook.com/docs/graph-api/overview/access-levels/ |

### 가져올 수 없는 것 · 확인 못 한 것

- `/{page-id}/posts`에 `since`/`until` 파라미터가 있는지는 원문에서 명시적으로 다루지 않아 **확인 못 함**(페이징은 cursor 기반으로만 설명됨). 시간 필터가 필요하면 응답을 클라이언트에서 `created_time` 기준으로 잘라야 할 수 있다.
- `/{ad-account-id}/insights`의 `time_range` 파라미터 정확한 문법(예: `{'since':'2026-09-19','until':'2026-09-19'}`)은 해당 페이지가 `date_preset` 예시만 보여주고, 전용 파라미터 문서(`/docs/marketing-api/insights/parameters`)는 404로 원문 대조 실패.
- `pages_read_engagement`/`instagram_basic`/`ads_read` 개별 권한 페이지(`/docs/permissions/reference/...`)는 서버 500 에러로 반복 접근 실패 — 권한별 App Review 필요 여부는 위 access-levels 문서의 일반 원칙으로만 대체 확인.

### 회고 활동 항목 변환 필드

| 회고 필드 | Meta 소스 필드 |
|---|---|
| 제목 | 게시물 `message`(요약), 캠페인명 |
| 시각 | `created_time`(게시물), `timestamp`(IG 미디어) |
| 작성자 | `from.name`(페이지/계정) |
| 종류 | 게시물 발행, IG 미디어 업로드, 광고 성과 리포트 |

---

## 6. YouTube Data API / Analytics API (마케팅)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 검색 | `search.list` — `publishedAfter`("resources created at or after the specified time"), `publishedBefore`, RFC 3339 형식 | `forMine=true`는 인증된 요청에서만 사용 가능하며 이때 `type=video` 필수. 쿼터 비용 1 unit/call, "Search Queries quota bucket"의 일일 한도 100회 | https://developers.google.com/youtube/v3/docs/search/list |
| 채널 정보 | `channels` 리소스 | 이번 조사에서 별도 필드 원문 대조는 안 함 | https://developers.google.com/youtube/v3/docs — 확인 못 함(세부 미대조) |
| Analytics 리포트 | 날짜 범위(startDate/endDate 개념), dimensions/metrics 지정 — "Each API request specifies the date range for which data will be returned" | "All YouTube Analytics ... requests must be authorized by the channel or content owner" | https://developers.google.com/youtube/analytics/reference/reports |

### 가져올 수 없는 것 · 확인 못 한 것

- `search.list`의 필수 OAuth 스코프가 문서에 명시적으로 나열되지 않음(공개 데이터는 API 키만으로도 가능한 것으로 보이나 원문에 스코프 표가 없어 확인 못 함).
- YouTube Analytics API의 정확한 파라미터명(`startDate`/`endDate`인지)과 스코프 목록은 별도 Authorization 가이드 페이지를 열람하지 못해 확인 못 함.
- `channels` 리소스의 필드 목록은 이번 조사에서 대조하지 않음.

### 회고 활동 항목 변환 필드

| 회고 필드 | YouTube 소스 필드 |
|---|---|
| 제목 | 영상 `title` |
| 시각 | `publishedAt` |
| 작성자 | 채널명 |
| 종류 | 업로드, 조회/시청 지표(Analytics) |

---

## 7. 이메일 마케팅 — Mailchimp / 스티비 (마케팅)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| Mailchimp 캠페인 목록 | `GET /campaigns` — "Get all campaigns in an account" | 세부 파라미터(`since_send_time`)·인증 방식은 이번 조사에서 원문 대조 실패(개요 페이지만 로드됨) | https://mailchimp.com/developer/marketing/api/campaigns/list-campaigns/ |
| 스티비 공식 API 존재 | `https://developers.stibee.com/` — 공식 개발자 포털, Base URL `https://api.stibee.com/v2`, AccessToken 발급(워크스페이스 설정 > API 키) | 제공 API: 구독자 관리, 이메일 생성/편집/발송, 그룹 관리, 주소록 관리 | https://developers.stibee.com/ ; https://help.stibee.com/api-webhook/overview |

### 가져올 수 없는 것 · 확인 못 한 것

- Mailchimp `GET /campaigns`의 `since_send_time` 파라미터, 반환 필드(제목/발송시각/상태), 인증 방식(API 키) 원문은 상세 페이지가 로드되지 않아 **확인 못 함**. (Mailchimp Marketing API는 일반적으로 API 키 기반 Basic Auth를 쓰는 것으로 알려져 있으나 이번 조사에서 원문 인용은 못 했음 — `[추정]`)
- 스티비 API의 캠페인/발송 이력 조회에 시간 필터 파라미터가 있는지는 개요 페이지 수준에서는 확인하지 못함(엔드포인트별 상세 페이지 미대조).
- Mailchimp/스티비 모두 웹훅 존재 여부는 이번 조사에서 원문 대조 안 함.

### 회고 활동 항목 변환 필드

| 회고 필드 | 소스 필드(확인 범위 내) |
|---|---|
| 제목 | 캠페인명(양쪽 서비스 공통, 정확한 필드명 미확인) |
| 시각 | 발송 시각(정확한 필드명 미확인) |
| 작성자 | 발송 계정/워크스페이스 |
| 종류 | 캠페인 발송 |

---

## 8. 네이버 검색광고 API (마케팅)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| 공식 문서 존재 | `naver/searchad-apidoc` — README에 "NAVER SEARCH ADVERTISER's Center" 명시, 공식 저장소 확인됨 | API 라이선스·비밀키 발급 절차 존재("Create API license") | https://github.com/naver/searchad-apidoc |
| 문서 사이트 | `http://naver.github.io/searchad-apidoc/` | GitHub Pages, JS 렌더링 기반이라 자동 크롤링 실패 | https://naver.github.io/searchad-apidoc/ |

### 가져올 수 없는 것 · 확인 못 한 것

- **stats(성과 리포트) API의 정확한 엔드포인트·파라미터·날짜 범위 문법은 이번 조사에서 원문 대조에 실패했다.** 문서 사이트가 SPA(JS 렌더링)라 WebFetch가 제목만 가져왔고, README에도 상세 스펙이 없다.
- WebSearch로는 GitHub 이슈 트래커(1차 저장소 소속이지만 공식 스펙 문서는 아님)에서 `/stat-reports`, `/stats` 같은 경로와 리포트 타입별 데이터 보존 기간(예: NAVERPAY_CONVERSION 365일, SHOPPINGKEYWORD_CONVERSION_DETAIL 45일)이 언급되나, 이는 **커뮤니티 이슈 게시물이지 공식 스펙 원문이 아니므로 신뢰도가 낮다** — `[추정]`으로만 취급.
- 인증 서명 방식(HMAC 등) 상세는 확인 못 함.

### 회고 활동 항목 변환 필드

- 이번 조사로는 구체적 필드 매핑을 확정할 수 없음. 별도로 문서 사이트를 브라우저로 직접 열람(헤드리스 브라우저 등)해 재조사 필요.

---

## 9. ATS — Greenhouse / Lever / Workable (인사)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| Greenhouse Harvest — 지원서 목록 | `GET /v1/applications` — 지원 파라미터: `created_before`, `created_after`, `last_activity_after`, `job_id`, `status` | **`updated_after`는 지원되지 않음** — 대신 `last_activity_after` 사용 | https://docs.greenhouse.io/harvest.html |
| Greenhouse — 활동 피드 | `GET /v1/candidates/{id}/activity_feed` — "노트, 이메일, 기타 활동을 포함한 후보자 프로필의 활동 목록" | - | https://docs.greenhouse.io/harvest.html |
| Greenhouse — 예정 인터뷰 | List/Retrieve/Create/Update/Delete Scheduled Interviews 엔드포인트 다수 | - | https://docs.greenhouse.io/harvest.html |
| Greenhouse — 인증 | HTTP Basic Auth, API 토큰을 username으로, 비밀번호는 공백 — "Authorization: Basic [Base64(api_token:)]" | - | https://docs.greenhouse.io/harvest.html |
| Lever — 인증 | Basic Auth(API 키를 username, 비밀번호 공백) 또는 OAuth(Bearer 토큰, 파트너 통합용) | - | https://hire.lever.co/developer/documentation |
| Lever — opportunities 시간 필터 | `updated_at_start`, `updated_at_end` — "If only updated_at_start is specified, all Opportunities updated from that timestamp (inclusive) to the present will be included." / "If only updated_at_end is specified, all Opportunities updated before that timestamp (inclusive) are included." | WebSearch로 확인한 공식 사이트(hire.lever.co) 인용 스니펫 — 페이지 직접 열람으로 문맥 전체를 대조하지는 못함 | https://hire.lever.co/developer/documentation |
| Workable — candidates 시간 필터 | `GET /candidates` — `created_after`: "Returns results created after the specified timestamp.", `updated_after`: "Returns results updated after the specified timestamp." (ISO8601 또는 Unix time) | 인증: API 토큰, `Authorization: Bearer [token]`, 필요 스코프 `r_candidates` | https://workable.readme.io/reference/job-candidates-index |

### 가져올 수 없는 것 · 확인 못 한 것

- Greenhouse에는 `updated_after` 파라미터가 없다 — 요청 항목에 있던 `updated_after=`는 실제로는 `last_activity_after`로 대체해야 한다(이는 확인된 사실이지 추정이 아님).
- Lever `updated_at_start`/`updated_at_end`는 WebSearch 스니펫으로만 확인했고, 페이지 전체를 열람해 정확한 파라미터명 철자·응답 스키마까지 대조하지는 못했다 — 재확인 권장.
- 세 서비스 모두 웹훅 지원 여부는 이번 조사에서 원문 대조를 하지 않았다.
- Greenhouse/Lever/Workable의 요금제별 API 접근 제한(예: 특정 플랜 이상에서만 API 제공)은 확인하지 못함.

### 회고 활동 항목 변환 필드

| 회고 필드 | Greenhouse | Lever | Workable |
|---|---|---|---|
| 제목 | 지원자 이름 + 채용공고 | Opportunity 이름/단계 | 후보자 이름 + 채용공고 |
| 시각 | `last_activity_at`(추정 필드명) | `updatedAt` | `updated_at` |
| 작성자 | 활동 수행자(activity_feed 내) | 담당자(owner) | 활동 수행자 |
| 종류 | 지원/인터뷰 예약/노트 등 | 단계 변경(stage change) | 지원/평가 등 |

---

## 10. Google Calendar / Google Admin SDK Reports API (인사)

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 출처 URL |
|---|---|---|---|
| Calendar 이벤트 목록 | `events.list` — `timeMin`("Lower bound (exclusive) for an event's end time"), `timeMax`("Upper bound (exclusive) for an event's start time"), RFC3339 형식 | 반환: `items[]`(이벤트 리스트), 개별 이벤트의 `summary`/`attendees`/`start`/`end`는 별도 Events 리소스 문서에 정의(이번 조사에서 그 페이지는 별도 열람 안 함) | https://developers.google.com/calendar/api/v3/reference/events/list |
| Calendar OAuth 스코프 | `calendar.readonly`, `calendar`, `calendar.events.readonly`, `calendar.events`, `calendar.app.created` 등. 가장 제한적: `calendar.events.readonly` | - | https://developers.google.com/calendar/api/v3/reference/events/list |
| Admin SDK Reports — activities.list 스코프 | `https://www.googleapis.com/auth/admin.reports.audit.readonly` | "활동 보고서 데이터에 대한 읽기 전용 접근 권한" | https://developers.google.com/admin-sdk/reports/v1/reference/activities/list |

### 가져올 수 없는 것 · 확인 못 한 것

- Admin SDK Reports API `activities.list`가 "관리자(슈퍼어드민) 계정 필수"라는 명시적 문구는 이번 조사의 1차 문서에서 찾지 못했다. 문서는 "특정 고객 계정의 활동 목록을 검색"이라고만 되어 있어 조직 수준 접근을 암시하지만, "super admin 필수"라는 정확한 문구는 확인 못 함. 다만 이 API가 Drive/로그인 등 조직 감사 로그를 다루는 것은 스코프명(`admin.reports.audit.readonly`) 자체가 뒷받침하므로, 원래 요청대로 "인사 회고에는 쓰지 않는다"는 방향은 문서 취지상 타당하다고 판단된다.
- Calendar 이벤트의 `attendees`/`summary` 필드 스펙 원문은 Events 리소스 문서를 별도로 열람하지 못해 확인 못 함(다만 Calendar API v3에서 일반적으로 제공되는 필드로 알려져 있음 — `[추정]`).

### 회고 활동 항목 변환 필드

| 회고 필드 | Calendar 소스 필드 |
|---|---|
| 제목 | `summary`(추정, 원문 미대조) |
| 시각 | `start`/`end`(추정, 원문 미대조) |
| 작성자 | `organizer`(추정, 원문 미대조) |
| 종류 | 면접 일정(제목 패턴으로 구분 필요, API 자체에 "면접" 타입 필드 없음) |

Admin SDK Reports API는 감시 성격이 강해 인사 회고 자동화에는 사용하지 않는 것으로 분류(요청 지침대로).

---

## 11. 국내 — 원티드 채용 API / 플렉스(flex.team) (인사)

### 가져올 수 있는 것

| 항목 | 내용 | 조건 | 출처 URL |
|---|---|---|---|
| 원티드 OpenAPI 포털 존재 | `https://openapi.wanted.jobs/` — "개발자가 채용 정보와 회사 정보를 쉽게 연동하기 위한" OpenAPI 포털이 존재하며 V1/V2 문서 링크가 있음. 인증 신청 필요, 인증키는 이메일로 3일 내 발급, 테스트/운영 자격증명 구분 제공 | 문서 페이지 자체는 네비게이션만 로드되어(SPA) 세부 API 목록·엔드포인트·시간 필터 원문 대조 실패 | https://openapi.wanted.jobs/ ; https://openapi.wanted.jobs/api-docs/v1/ |

### 가져올 수 없는 것 · 확인 못 한 것

- 원티드 OpenAPI가 지원자·채용 활동(면접 일정, 지원 상태 변경 등) API를 제공하는지, 혹은 채용공고·회사정보 조회 위주인지 이번 조사에서 확정하지 못했다. 문서 페이지가 SPA라 실제 엔드포인트 목록을 가져오지 못함 — **확인 못 함**.
- 플렉스(flex.team)의 공개 개발자 API 문서는 이번 조사에서 찾지 못했다. 검색 결과에는 사용자 가이드(userguide.flex.team)와 마케팅 페이지만 있었고, 개발자용 API 레퍼런스 페이지는 확인되지 않았다 — **공개 API 문서 존재를 확인하지 못함**(없다고 단정할 수는 없으며, 별도 문의나 로그인 후 확인이 필요할 수 있음).

### 회고 활동 항목 변환 필드

- 원티드: 확정 불가(엔드포인트 미확인).
- 플렉스: 확정 불가(공개 API 문서 미확인).

---

## 종합 — 확인 못 한 항목 재조사가 필요한 것 (우선순위)

1. 네이버 검색광고 stats API 엔드포인트·파라미터 원문 (SPA라 헤드리스 브라우저로 재조사 필요)
2. 원티드 OpenAPI V1/V2 문서 상세 (엔드포인트 목록 확보 필요)
3. 플렉스(flex.team) 개발자 API 존재 여부 (회사에 직접 문의 또는 로그인 후 개발자 포털 확인 필요)
4. Jira JQL 함수 정확한 정의 문구, changelog 응답 스키마 (support.atlassian.com/developer.atlassian.com 페이지가 커서 섹션별로 재요청 필요)
5. Linear GraphQL 스키마의 `issueHistory` 실제 존재 여부 (GraphQL introspection으로 직접 검증 필요)
6. Meta 개별 권한 페이지(`/docs/permissions/reference/*`)가 반복적으로 500 에러 — 재시도 또는 다른 경로로 확인 필요
7. Mailchimp `GET /campaigns`의 `since_send_time` 등 상세 파라미터

---

## 출처 목록

- https://docs.github.com/en/rest/activity/events?apiVersion=2022-11-28
- https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28
- https://docs.github.com/en/rest/pulls/reviews?apiVersion=2022-11-28
- https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2022-11-28
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api?apiVersion=2022-11-28
- https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
- https://support.atlassian.com/jira-software-cloud/docs/jql-functions/
- https://developer.atlassian.com/cloud/jira/platform/scopes-for-oauth-2-3LO-and-forge-apps/
- https://confluence.atlassian.com/jirakb/run-jql-search-query-using-jira-cloud-rest-api-1289424308.html
- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
- https://linear.app/developers/graphql
- https://linear.app/developers/oauth-2-0-authentication
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://developers.facebook.com/docs/graph-api/reference/page/posts/
- https://developers.facebook.com/docs/instagram-api/reference/ig-user/media
- https://developers.facebook.com/docs/marketing-api/insights
- https://developers.facebook.com/docs/graph-api/overview/access-levels/
- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/analytics/reference/reports
- https://mailchimp.com/developer/marketing/api/campaigns/list-campaigns/
- https://developers.stibee.com/
- https://help.stibee.com/api-webhook/overview
- https://github.com/naver/searchad-apidoc
- https://naver.github.io/searchad-apidoc/
- https://docs.greenhouse.io/harvest.html
- https://hire.lever.co/developer/documentation
- https://workable.readme.io/reference/job-candidates-index
- https://developers.google.com/calendar/api/v3/reference/events/list
- https://developers.google.com/admin-sdk/reports/v1/reference/activities/list
- https://openapi.wanted.jobs/
- https://openapi.wanted.jobs/api-docs/v1/
