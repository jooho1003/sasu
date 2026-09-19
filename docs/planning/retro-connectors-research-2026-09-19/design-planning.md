# 부서별 당일 회고 자동화 — 외부 협업툴 연동 가능성 조사

조사일: 2026-09-19
대상: 사수 부서별 당일 회고 자동화 — 디자인팀·기획팀 외부 협업툴(Figma, Notion, Google Drive/Docs, Confluence, Miro) 연동 가능성

## 핵심 결론 (3줄)

1. **Figma·Notion·Google Drive는 "누가 언제 무엇을 했는지"를 API로 충분히 가져올 수 있다** — Figma는 버전 히스토리(`GET /v1/files/:key/versions`)와 댓글(`GET /v1/files/:key/comments`)에 작성자·시각 필드가 있고([Figma REST API](https://developers.figma.com/docs/rest-api/version-history-endpoints/), [comments-endpoints](https://developers.figma.com/docs/rest-api/comments-endpoints/)), Notion은 페이지 객체의 `last_edited_time`/`last_edited_by`([Notion Page 참조](https://developers.notion.com/reference/page))에 더해 2026-03-11 기준 웹훅으로 `page.properties_updated` 등 실시간 이벤트까지 제공하며([Notion Webhooks 이벤트 타입](https://developers.notion.com/reference/webhooks-events-delivery)), Google Drive Activity API v2의 `activity.query`는 actor·timestamp·target·actionDetailCase(edit/comment/rename/move 등)를 명시적으로 구조화해 반환한다([Drive Activity 데이터 모델](https://developers.google.com/workspace/drive/activity/v2/datamodel)).
2. **Confluence는 CQL 시간 필터와 버전 메타데이터는 확실하지만, 버전 간 본문 diff를 반환하는 공식 엔드포인트는 문서에서 확인하지 못했다** — `lastmodified` 필드는 CQL에서 `>=`, `<=` 등 범위 연산자를 지원하고([CQL fields](https://developer.atlassian.com/cloud/confluence/cql-fields/)), 버전 목록(`GET /pages/{id}/versions`)에는 `authorId`·`createdAt`·`message`가 있지만([api-group-version](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/)) diff 계산 기능은 확인하지 못했다.
3. **Figma의 Activity Logs API는 Enterprise 전용, Notion의 페이지 버전 히스토리 열람은 API로 불가능, Miro 웹훅은 "실험적" 상태였던 것을 2025-12-05에 제거한 이력이 있어 회고 자동화의 실시간 트리거로 의존하기에는 위험하다** — 각각 [Figma Activity Logs](https://developers.figma.com/docs/rest-api/activity-logs/), Notion 공식 문서 어디에도 페이지 히스토리 조회 엔드포인트가 없음(아래 §2 참조), [Miro 웹훅 실험적 기능 제거 안내](https://developers.miro.com/changelog/removed-experimental-webhooks-support)로 뒷받침된다.

---

## 1. Figma REST API

출처: developers.figma.com

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건(인증·권한·요금제·시간필터·웹훅) | 출처 URL |
|---|---|---|---|
| 파일 버전 히스토리 | `GET /v1/files/:key/versions` → 응답 `{"versions": Version[], "pagination": {"prev_page", "next_page"}}`. 커뮤니티 코드 예시 기준 Version 객체는 `id, created_at, label, description, user` 필드를 포함(공식 Types 섹션 원문 미확인, 아래 "확인 못 함" 참조) | `file_versions:read` 스코프 필요, Tier 2 엔드포인트 | [version-history-endpoints](https://developers.figma.com/docs/rest-api/version-history-endpoints/) |
| 파일 댓글 | `GET /v1/files/:key/comments` → `{"comments": Comment[]}`. Comment 필드: `id, message, file_key, parent_id, user, client_meta, resolved_at, created_at, order_id` | `file_comments:read` 스코프, Tier 2 엔드포인트 | [comments-endpoints](https://developers.figma.com/docs/rest-api/comments-endpoints/) |
| 댓글 반응(reactions) | `GET /v1/files/:file_key/comments/:comment_id/reactions` → `reactions` 배열 + pagination | `file_comments:read` 스코프와 동일, Tier 2 | [comments-endpoints](https://developers.figma.com/docs/rest-api/comments-endpoints/) |
| Webhooks V2 이벤트 | `PING, FILE_UPDATE(30분 내 편집 비활성 시), FILE_DELETE, FILE_VERSION_UPDATE(버전 히스토리에 이름 붙여 저장 시), LIBRARY_PUBLISH, FILE_COMMENT, DEV_MODE_STATUS_UPDATE` | 웹훅 생성은 `Can edit` 권한(파일/폴더) 또는 team admin(팀) 기준이며, 특정 요금제가 "필수"라는 명시는 문서에 없음. 다만 **개수 제한**은 파일당 Professional 150개 / Organization 300개 / Enterprise 600개, 팀당 20개·폴더당 5개·파일당 3개 상한 | [webhooks-events](https://developers.figma.com/docs/rest-api/webhooks-events/), [webhooks](https://developers.figma.com/docs/rest-api/webhooks/) |
| OAuth 스코프 | `file_content:read`(파일 내용), `file_comments:read`/`write`, `file_versions:read`, `file_metadata:read`, `webhooks:read`/`write`, `org:activity_log_read`(조직 관리자용), `current_user:read` 등 | 스코프별로 상이. `org:activity_log_read`는 조직 관리자 권한 필요 | [scopes](https://developers.figma.com/docs/rest-api/scopes/) |
| 레이트리밋 | Tier 1(파일/이미지): Dev/Full 시트 기준 Starter 10/분·Professional 15/분·Organization 20/분·Enterprise 30/분. Tier 2(댓글·웹훅 등): 25/50/100/150(분)로 플랜별 증가. Tier 3(Activity Logs 등): 50/100/150/200(분) | "Rate limits are per-minute unless otherwise specified." View/Collab 시트는 더 낮음 | [rate-limits](https://developers.figma.com/docs/rest-api/rate-limits/) |
| Activity Logs API | Enterprise 플랜 조직의 관리자만 접근 가능 | "The Activity Logs API is only available to organizations on the Enterprise plan." | [activity-logs](https://developers.figma.com/docs/rest-api/activity-logs/) |

### 가져올 수 없는 것·확인 못 한 것

- Version 객체(`id, created_at, label, description, user`)의 정확한 필드 정의는 공식 "Types" 섹션 원문을 직접 열람하지 못했다 — WebFetch가 해당 페이지의 타입 정의 테이블을 반환하지 않아, 커뮤니티/서드파티 자료(GitHub `figma-api` 등)가 인용한 필드명을 재확인하는 방식으로만 교차 확인했다. **[추정]** 필드명 자체는 신뢰할 만하나 공식 원문 재확인 필요.
- 웹훅 이벤트 각각(FILE_COMMENT, FILE_VERSION_UPDATE 등)이 "어떤 요금제부터" 가능한지는 문서에 명시 요금제 조건이 없다 — 문서에 있는 것은 웹훅 "개수 제한"뿐이며, 웹훅 기능 자체의 최소 요금제 조건은 확인하지 못했다(문서에 명시 안 됨). 커뮤니티 포럼(비1차 출처)에는 "Professional에서 웹훅 접근이 제거되고 Organization부터 가능하다"는 비공식 언급이 있었으나 인용하지 않는다.
- Comment 객체 필드에 `resolved_at`은 있으나(해결 여부는 이 필드의 null 여부로 판단 가능) 별도의 boolean `resolved` 필드명은 확인하지 못했다.

### 회고 활동 항목으로 변환할 때 쓸 필드

| 회고 항목 | Figma API 필드 |
|---|---|
| 제목 | 버전의 `label`(파일 버전) 또는 댓글의 `message` |
| 시각 | 버전의 `created_at` 또는 댓글의 `created_at` |
| 작성자 | 버전/댓글의 `user` 객체 |
| 종류 | 웹훅 `event_type`(FILE_VERSION_UPDATE / FILE_COMMENT / LIBRARY_PUBLISH 등) 또는 엔드포인트 출처(versions vs comments) |

---

## 2. Notion API

출처: developers.notion.com

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건(인증·권한·요금제·시간필터·웹훅) | 출처 URL |
|---|---|---|---|
| 페이지 최종 수정 정보 | Page 객체 `last_edited_time`("Date and time when this page was updated. Formatted as an ISO 8601 date time string."), `last_edited_by`(Partial User, "User who last edited the page.") | 통합(integration)의 read content capability 필요 | [Page 참조](https://developers.notion.com/reference/page) |
| 검색 시간 정렬 | `POST /v1/search`의 `sort`: `{"timestamp": "last_edited_time", "direction": "ascending"|"descending"}`. `relevance` 정렬도 가능하나 시간 필터(예: 특정 시각 이후만)는 sort로 제공되지 않음 | read content capability | [post-search](https://developers.notion.com/reference/post-search) |
| 댓글 조회 | `GET /v1/comments?block_id=...` (page_size 1~100, start_cursor). 응답: `results`(Comment 배열: `id, created_time, last_edited_time, created_by, rich_text, discussion_id, attachments`), `has_more`, `next_cursor` | "read comment capabilities" 없으면 403 | [list-comments](https://developers.notion.com/reference/list-comments) |
| 댓글 개별 조회 | `GET /v1/comments/{comment_id}` | read comment capability, 없으면 403 | [retrieve-comment](https://developers.notion.com/reference/retrieve-comment) |
| 댓글 생성 | `POST /v1/comments` — `parent.page_id` 또는 `parent.block_id` 또는 `discussion_id`(상호배타) + `rich_text`(최대 100개) | "insert comment capabilities" 없으면 403 | [create-a-comment](https://developers.notion.com/reference/create-a-comment) |
| 데이터베이스 행 변경 추적 | **웹훅**으로 가능: `page.properties_updated`(페이지 속성 변경), `page.content_updated`, `data_source.content_updated`, `data_source.schema_updated`, `database.*`(2025-09-03부터 일부 deprecated) 등 이벤트 구독. 웹훅은 커넥션 설정에서 Webhook URL 등록 → 초기 `verification_token` 검증 → 활성화. `X-Notion-Signature`(HMAC-SHA256)로 페이로드 검증 | 공개(SSL) URL 필요, 이벤트 타입별 구독 선택 가능 | [webhooks](https://developers.notion.com/reference/webhooks), [webhooks-events-delivery](https://developers.notion.com/reference/webhooks-events-delivery) |
| Integration capability 종류 | Content: read/insert/update content. Comment: read comments/insert comments. User: no user info / without email / with email(3단계) | 커넥션 설정에서 부여 | [capabilities](https://developers.notion.com/reference/capabilities) |
| 2025-09-03 버전 변경사항 | `/v1/databases`가 `/v1/data_sources`(개별 데이터 소스 관리)와 `/v1/databases`(컨테이너 관리)로 재구성. 페이지 `parent`가 `database_id` 대신 `data_source_id`. 검색 필터 값이 `"database"` 대신 `"data_source"`. "댓글은 데이터베이스나 데이터 소스가 아닌 블록이나 페이지만을 부모로 가질 수 있으므로 영향을 받지 않음"(댓글 API는 이 마이그레이션에 영향받지 않음) | 마이그레이션 필요 시 `Notion-Version` 헤더 갱신 | [upgrade-faqs-2025-09-03](https://developers.notion.com/docs/upgrade-faqs-2025-09-03) |

### 가져올 수 없는 것·확인 못 한 것

- **페이지 버전 히스토리(edit history)를 API로 읽는 기능은 없다.** [Working with page content](https://developers.notion.com/docs/working-with-page-content) 문서를 확인했으나 버전/이력 조회에 대한 언급 자체가 없었고, 검색한 범위 내 Notion 공식 문서 어디에도 "페이지 버전 히스토리 조회 엔드포인트"가 존재하지 않았다. 웹훅(`page.content_updated`, `page.properties_updated`)으로 "변경이 일어났다"는 이벤트는 받을 수 있지만, Notion UI의 "Page history"처럼 과거 특정 시점의 스냅샷을 API로 되짚어 가져오는 기능은 확인하지 못했다(문서에 명시적으로 "없다"는 문장은 찾지 못했고, 관련 엔드포인트가 부재하다는 정황적 확인만 했다).
- `changes-by-version`(전체 버전 변경 이력) 페이지에서 last_edited 필드 자체의 변경 이력, 그리고 2025-09-03 이전 모든 버전의 상세 변경 내역은 요약만 확인했고 원문 표 전체를 인용하지는 못했다.
- 웹훅의 "aggregated"(`page.content_updated`처럼 배치 처리됨) vs "non-aggregated"(`comment.created`, `page.locked`) 구분의 정확한 배치 주기(예: 몇 초/분 단위로 묶이는지)는 확인하지 못했다 — 문서에 "batched"라는 언급만 있고 수치는 없었다.

### 회고 활동 항목으로 변환할 때 쓸 필드

| 회고 항목 | Notion API 필드 |
|---|---|
| 제목 | 댓글의 `rich_text`(plain_text) 또는 웹훅 이벤트의 대상 페이지 제목(페이지 조회로 별도 획득) |
| 시각 | `last_edited_time`(페이지) 또는 `created_time`(댓글) |
| 작성자 | `last_edited_by`(페이지) 또는 `created_by`(댓글) |
| 종류 | 웹훅 `event_type`(`page.properties_updated` / `page.content_updated` / `comment.created` 등) |

---

## 3. Google (Drive Activity API v2 / Drive API / Docs API)

출처: developers.google.com

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건(인증·권한·요금제·시간필터·웹훅) | 출처 URL |
|---|---|---|---|
| 활동 조회 | `activity.query`(POST) — 요청 필드: `ancestorName`("Return activities for this Drive folder, plus all children and descendants. The format is items/ITEM_ID."), `filter`, `pageSize`, `pageToken`. 응답: `activities[]`(DriveActivity), `nextPageToken` | OAuth 스코프 `https://www.googleapis.com/auth/drive.activity.readonly`("The scope for reading Drive activity.") | [activity.query](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/query), [quickstart](https://developers.google.com/workspace/drive/activity/v2/quickstart/nodejs) |
| 시간 필터 문법 | `filter` 필드는 "field operator value" 표현식을 AND로 연결. time 조건 예: `time > 1452409200000 AND time <= 1492812924310`(밀리초) 또는 `time >= "2016-01-10T01:02:03-05:00"`(RFC 3339). 액션 종류 필터: `detail.action_detail_case:RENAME`, `detail.action_detail_case:(CREATE RESTORE)`, `-detail.action_detail_case:MOVE` | 동일 | [activity.query](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/query) |
| 누가/언제/무엇을 | DriveActivity 구조: `actors: [{"user": {"knownUser": {"personName": "people/ACCOUNT_ID"}}}]`(누가), `timestamp: {"seconds":..., "nanos":...}` 또는 `timeRange`(언제), `targets: [{"driveItem": {"name": "items/ITEM_ID", "title": "TITLE", "file": {}}}]`(무엇), `primaryActionDetail`(예: `{"edit": {}}`, `{"move": {"addedParents":[...], "removedParents":[...]}}`) | 동일 | [Drive Activity 데이터 모델](https://developers.google.com/workspace/drive/activity/v2/datamodel) |
| ActionDetail 종류 | `create`("An object was created"), `edit`("An object was edited"), `move`("An object was moved"), `rename`("An object was renamed"), `delete`, `restore`, `permissionChange`, `comment`("A change about comments was made"), `dlpChange`, `reference`, `settingsChange`, `appliedLabelChange` (union 필드, 하나만 존재) | 동일 | [ActionDetail](https://developers.google.com/drive/activity/v2/reference/rest/v2/activity/actiondetail) |
| 파일 리비전 목록 | `revisions.list` → `{"revisions": [Revision], "nextPageToken", "kind"}`. Revision 필드: `id`("Output only. The ID of the revision."), `modifiedTime`(RFC 3339), `lastModifyingUser`, `exportLinks`("Output only. Links for exporting Docs Editors files to specific formats."), `keepForever`, `mimeType`, `md5Checksum`, `size`, `originalFilename` | Drive API 권한 범위 필요(문서에 스코프명 별도 명시 안 됨, 일반 Drive 스코프 사용) | [revisions.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list), [Revision 리소스](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions) |
| Docs 문서 조회 | `documents.get` — "Gets the latest version of the specified document." 쿼리 파라미터는 `suggestionsViewMode`, `includeTabsContent`, `commentsViewMode`뿐 | 특정 리비전 지정이나 버전 비교 파라미터 없음 | [documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get) |

### 가져올 수 없는 것·확인 못 한 것

- **`revisions.list`/Revision 리소스는 리비전 간 본문(body) diff를 직접 제공하지 않는다.** 문서에는 리비전 목록·메타데이터 조회만 있고, "개별 revision 다운로드나 비교는 별도 방식(`files.get`/`files.export`)을 통해 구현해야 한다"는 정황만 확인했다(diff 기능 자체가 없다는 명시적 문장은 없었지만, diff API의 존재도 찾지 못했다).
- **`documents.get`은 "Gets the latest version of the specified document"라고 명시**되어 있어, 특정 리비전을 지정해 과거 시점 문서를 가져오거나 두 리비전을 비교하는 공식 기능은 없다고 판단한다(직접 인용 문장으로 뒷받침됨).
- Drive Activity API의 요금제 조건(Google Workspace 특정 플랜 필요 여부)은 이번 조사에서 명시적으로 확인하지 못했다 — fetch한 페이지들에는 요금제 제한 언급이 없었다.

### 회고 활동 항목으로 변환할 때 쓸 필드

| 회고 항목 | Google API 필드 |
|---|---|
| 제목 | `targets[].driveItem.title` |
| 시각 | `timestamp`(또는 `timeRange.endTime`) |
| 작성자 | `actors[].user.knownUser.personName`(People API로 이름 resolve 필요) |
| 종류 | `primaryActionDetail`의 union 키(`edit`/`comment`/`rename`/`move` 등) |

---

## 4. Atlassian Confluence Cloud REST API

출처: developer.atlassian.com

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건(인증·권한·요금제·시간필터·웹훅) | 출처 URL |
|---|---|---|---|
| 페이지 버전 목록 | `GET /wiki/api/v2/pages/{id}/versions`, `GET /wiki/api/v2/pages/{id}/versions/{version-number}`(개별 조회). Version 객체 필드: `number, authorId, message, createdAt, minorEdit, contentTypeModified, collaborators, prevVersion, nextVersion` | v2 API, 표준 Confluence Cloud 인증(OAuth 2.0 / API 토큰) | [api-group-version](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/) |
| footer/inline 댓글 | Footer: `GET/POST /footer-comments`, `GET/PUT/DELETE /footer-comments/{comment-id}`, `GET /footer-comments/{id}/children`. Inline: 동일 패턴의 `/inline-comments/*`. 응답 필드: `id, status, title`, `version.{createdAt, message, number, minorEdit, authorId}`, `body`, `_links` | v2 API | [api-group-comment](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-comment/) |
| 시간 필터(CQL) | `lastmodified` 필드: "Search for content that was last modified on, before, or after a particular date (or date range)." 연산자 `=, !=, >, >=, <, <=` 지원(IN/NOT IN 미지원). 함수: `startOfDay(), endOfDay(), startOfMonth(), endOfMonth(), startOfWeek(), endOfWeek(), startOfYear(), endOfYear()`. 예: `lastmodified >= 2014-09-01 and lastmodified < "2014-09-03 09:00"` | CQL 검색 엔드포인트 사용 | [CQL fields](https://developer.atlassian.com/cloud/confluence/cql-fields/) |

### 가져올 수 없는 것·확인 못 한 것

- **버전 간 본문(body) 비교(diff)를 반환하는 공식 API 엔드포인트는 확인하지 못했다.** `GET /pages/{id}/versions/{version-number}`가 해당 버전의 `body`(본문)까지 포함하는지 여부를 공식 문서 원문에서 직접 확인하지 못했다 — WebFetch로 연 페이지가 "Content truncated due to length"로 잘려 상세 응답 스키마를 읽지 못했다. diff 계산 기능(두 버전을 비교해 변경분만 반환)이 있다는 근거는 어디에서도 찾지 못했으며, Confluence UI의 "버전 비교" 기능에 상응하는 API는 확인 못 함으로 남긴다.
- footer comment 응답에 "resolved 여부"에 해당하는 `resolutionStatus` 필드가 있는지 공식 응답 예시에서 명시적으로 확인하지 못했다(문서에 없다고 명시된 것도 아니고, 있다고 확인된 것도 아니다 — "확인 못 함").
- `GET /pages/{id}` 엔드포인트가 특정 버전(version) 쿼리 파라미터를 지원하는지는 WebFetch가 해당 섹션 상세를 반환하지 못해 확인하지 못했다. WebSearch 요약에 "version 파라미터가 있다"는 문장이 나왔으나, 이는 검색 엔진이 생성한 요약(2차 가공)이라 이 문서에서는 근거로 채택하지 않는다.

### 회고 활동 항목으로 변환할 때 쓸 필드

| 회고 항목 | Confluence API 필드 |
|---|---|
| 제목 | 페이지 title(별도 `GET /pages/{id}`로 조회) 또는 댓글 `title` |
| 시각 | 버전의 `createdAt` |
| 작성자 | 버전의 `authorId` (또는 댓글 `version.authorId`) |
| 종류 | 버전 이력이면 "편집", footer-comments/inline-comments 출처면 "댓글" |

---

## 5. Miro REST API (간단 확인)

출처: developers.miro.com

| 항목 | 내용 | 출처 URL |
|---|---|---|
| 웹훅 실험적 기능 | 2025-12-05부로 실험적 웹훅(`/v2-experimental/webhooks/board_subscriptions`)이 제거됨. Miro 측 설명: "You definitely need a way to track board activity programmatically"(필요성은 인정)이나 "This specific architectural approach wasn't meeting the standards of reliability and scalability"(신뢰성·확장성 미달로 폐기), 대체 방안은 "currently exploring other options"로 미확정 | [changelog: removed-experimental-webhooks-support](https://developers.miro.com/changelog/removed-experimental-webhooks-support) |
| 현재 webhooks 문서 | [getting-started-with-webhooks](https://developers.miro.com/docs/getting-started-with-webhooks) 페이지는 "created, updated, deleted" 3종 이벤트와 `createdAt`/`modifiedAt` 필드를 여전히 설명하고 있음 | [getting-started-with-webhooks](https://developers.miro.com/docs/getting-started-with-webhooks) |

**출처 충돌 및 판단**: changelog는 "실험적 웹훅(board_subscriptions) 제거"를 명시하는 반면, getting-started 문서는 webhooks 기능 자체를 여전히 설명하고 있어 두 문서가 같은 기능을 가리키는지 상충한다. changelog가 더 구체적이고 날짜가 명시된 1차 공지이므로 더 신뢰하되, getting-started 문서가 별개의(비실험적) 안정 웹훅 API를 가리키는지는 이번 조사에서 엔드포인트 경로(`v2` vs `v2-experimental`)까지 대조하지 못해 **확인 못 함**으로 남긴다 — 회고 자동화 설계에서 Miro 웹훅을 실시간 트리거로 채택하려면 착수 시점에 반드시 재확인이 필요하다.

---

## 출처 목록

- https://developers.figma.com/docs/rest-api/
- https://developers.figma.com/docs/rest-api/version-history-endpoints/
- https://developers.figma.com/docs/rest-api/comments-endpoints/
- https://developers.figma.com/docs/rest-api/webhooks-events/
- https://developers.figma.com/docs/rest-api/webhooks-types/
- https://developers.figma.com/docs/rest-api/webhooks/
- https://developers.figma.com/docs/rest-api/scopes/
- https://developers.figma.com/docs/rest-api/rate-limits/
- https://developers.figma.com/docs/rest-api/activity-logs/
- https://developers.notion.com/reference/page
- https://developers.notion.com/reference/post-search
- https://developers.notion.com/reference/list-comments
- https://developers.notion.com/reference/retrieve-comment
- https://developers.notion.com/reference/create-a-comment
- https://developers.notion.com/reference/webhooks
- https://developers.notion.com/reference/webhooks-events-delivery
- https://developers.notion.com/reference/capabilities
- https://developers.notion.com/reference/changes-by-version
- https://developers.notion.com/docs/working-with-page-content
- https://developers.notion.com/docs/upgrade-faqs-2025-09-03
- https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/query
- https://developers.google.com/drive/activity/v2/reference/rest/v2/activity/actiondetail
- https://developers.google.com/workspace/drive/activity/v2/datamodel
- https://developers.google.com/workspace/drive/activity/v2/quickstart/nodejs
- https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list
- https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions
- https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/
- https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-comment/
- https://developer.atlassian.com/cloud/confluence/cql-fields/
- https://developers.miro.com/changelog/removed-experimental-webhooks-support
- https://developers.miro.com/docs/getting-started-with-webhooks
