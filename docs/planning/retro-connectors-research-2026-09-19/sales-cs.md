조사일: 2026-09-19
대상: 사수(SASU) 부서별 당일 회고 자동화 — 영업팀·CS팀 외부 API 연동 가능성

## 결론 3줄

1. 휴대전화 통화 메타데이터는 **앱이 직접** 못 가져온다 — Android는 기본 전화/문자 앱이거나 Google Play 예외 승인을 받은 앱만 `READ_CALL_LOG`를 쓸 수 있고([Google Play 정책](https://support.google.com/googleplay/android-developer/answer/9047303)), iOS는 서드파티 앱에 통화 기록 조회 API 자체가 없다(포럼상 "There isn't any API on the system which will give you access to the user call history" — [Apple Developer Forums](https://developer.apple.com/forums/thread/54096)). 현실적 경로는 **VoIP/CTI 서비스(Twilio·RingCentral·Zoom Phone·Aircall)를 통해 걸린 통화**의 메타데이터를 API로 가져오는 것이지, 개인 휴대폰 통화 자체는 아니다.
2. CRM(HubSpot·Salesforce·Pipedrive)과 캘린더(Google/Microsoft Graph)는 시간 필터가 잘 갖춰져 있어 "오늘 활동" 조회에 바로 쓸 수 있고, 이메일도 Gmail `format=metadata`/`gmail.metadata` 스코프, Graph `Mail.ReadBasic`으로 **본문 없이 헤더·메타데이터만** 받는 경로가 공식 문서로 확인된다 — 단 `gmail.metadata`/`gmail.readonly`는 Google의 **restricted scope**라 연 1회 보안 심사(CASA)를 통과해야 프로덕션에서 100명 초과로 쓸 수 있다([Google restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)).
3. 상담 채널 중 채널톡(Channel.io)·Zendesk·Intercom은 시간 기반 조회/증분 export가 공식 문서로 확인되지만, **카카오 비즈니스는 상담 내역을 읽어오는 공개 API가 없다**(developers.kakao.com에 채널 관계·고객파일 관리 API만 있고 대화 조회 API 없음). 국내 SaaS(세일즈맵·리멤버 비즈니스)는 세일즈맵만 공개 개발자 문서가 있고, 리멤버 비즈니스는 공개 API 문서를 찾지 못했다.

---

## 1. 휴대전화 통화 기록

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건(인증·권한·요금제·시간필터) | 웹훅 유무 | 출처 URL |
|---|---|---|---|---|
| Android 통화 메타데이터 | `CallLog.Calls` content provider (NUMBER, TYPE, DATE, DURATION 등, 일반 지식으로 참고만 — 아래 "확인 못 함" 참조) | `READ_CALL_LOG` 권한 필요. Google Play Permissions 정책상 **기본 SMS/Phone/Assistant 핸들러 앱**이거나, 스팸탐지·계정인증·백업복원·연동기기·기기자동화·엔터프라이즈 아카이브·차량용·프록시콜 등 **명시된 예외 사용 사례**로 Google 승인을 받아야만 매니페스트에 선언 가능 | 없음(로컬 API) | [Google Play Console Help – Permissions policy](https://support.google.com/googleplay/android-developer/answer/9047303) |
| iOS 통화 기록 읽기 | 없음 | Apple 공식 API 부재 | 없음 | [Apple Developer Forums #54096](https://developer.apple.com/forums/thread/54096), [CallKit 개요](https://developer.apple.com/documentation/callkit) |

### 가져올 수 없는 것 · 확인 못 한 것

- **Android**: WebFetch로 `developer.android.com/reference/android/provider/CallLog.Calls` 레퍼런스 페이지 본문을 직접 인용하지 못했다(페이지가 네비게이션만 반환). `NUMBER/TYPE/DATE/DURATION` 필드명은 일반 지식 수준이며 **원문 대조로 확인 못 함** — 설계에 반영 시 재확인 필요.
- Google Play 정책 인용은 검색엔진이 요약한 **2차 출처(xda-developers 등) 경유 요약**이 섞여 있었으나, 최종적으로 `support.google.com/googleplay/android-developer/answer/9047303` 원문을 직접 페치해 재확인했다.
- **iOS**: CallKit은 "발신/수신 통화를 시스템 통화 기록에 기록"하는 용도이지 기존 통화 기록을 읽는 API가 아니다. Apple 공식 문서(`developer.apple.com/documentation/callkit`) 페이지 본문 상세는 페치 실패(제목만 확인), 개발자 포럼(Apple 소유 도메인)의 답변으로 "시스템에 통화 기록 접근 API가 없다"를 재확인했다. **완전한 공식 레퍼런스 원문 인용은 확인 못 함** — Apple 프라이버시 정책 문서까지는 못 감.
- **녹음 없이 메타데이터만 얻는 현실적 경로**: 개인 휴대폰 통화 자체에서는 정책상 SASU 같은 서드파티 앱이 직접 가져오기 어렵다. 실질적 대안은 §2의 VoIP/CTI 서비스(팀이 Twilio/RingCentral/Zoom Phone/Aircall 같은 업무용 전화 시스템을 쓰는 경우)로, 이 경우 통화가 애초에 클라우드 서비스를 경유하므로 API로 메타데이터를 받을 수 있다.

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: 상대방 이름/번호 + 방향 (예: "고객 A 발신 통화") — Android 자체 API는 정책상 사용 불가이므로 실제로는 §2 VoIP 서비스 필드를 쓰게 될 가능성이 높음
- 시각 필드: 통화 시작 시각
- 상대방 필드: 전화번호 — SASU 정책상 **개인 연락처는 마스킹 필요** (마지막 4자리만 노출 등)
- 종류: 통화(발신/수신/부재중)

---

## 2. VoIP/CTI 서비스 통화 로그 API

### 가져올 수 있는 것

| 서비스 | 엔드포인트·필드 | 조건 | 웹훅 | 출처 URL |
|---|---|---|---|---|
| Twilio | `GET /2010-04-01/Accounts/{AccountSid}/Calls.json` — 필드 `StartTime`, `Direction`(inbound/outbound-api/outbound-dial), `Duration`(초). 필터: `StartTime`, `StartTime>`, `StartTime<`, `To`, `From`, `Status`, `Direction` (대소문자 구분) | 인증은 OAuth 스코프가 아니라 **Account SID + Auth Token(Basic Auth)** 또는 **API Key/Secret**. OAuth(Client Credentials)는 베타 단계 | Twilio Voice 이벤트 웹훅(status callback) 있음 — 이번 조사에서 문서 원문 직접 확인은 못 함 | [Twilio Call resource](https://www.twilio.com/docs/voice/api/call-resource), [Twilio API requests](https://www.twilio.com/docs/usage/requests-to-twilio), [API Key](https://www.twilio.com/docs/glossary/what-is-an-api-key) |
| RingCentral | `GET /restapi/v1.0/account/~/extension/~/call-log`, 파라미터 `dateFrom`/`dateTo`(ISO 8601), `view=Detailed` | OAuth 스코프 **`ReadCallLog`**(토큰 스코프 문자열은 `CallLog`로 표기되는 사례도 확인됨) | Call Log Sync(webhook/구독) 가이드 존재 (`/guide/voice/call-log/sync`) — 원문 상세는 확인 못 함 | [RingCentral Call Log 가이드](https://developers.ringcentral.com/guide/voice/call-log/quick-start), [Application permissions and scopes](https://developers.ringcentral.com/guide/basics/permissions) |
| Zoom Phone | (신) `GET /v2/phone/call_history/{callHistoryUuid}`, `GET /phone/call_history`(계정 전체 통화 히스토리). (구, 2026-05 폐기 예정) `GET /phone/call_logs`. 필터 `from`/`to`(YYYY-MM-DD) | 스코프(구) `phone:read:list_call_logs:admin`, `phone:read:call_log:admin` — 계정 레벨 OAuth 앱 전용. 신규 v2 스코프명은 이번 조사에서 원문 확인 못 함 | Zoom Phone 웹훅 `phone.callee_call_history_completed`/`phone.caller_call_history_completed`(구 `*_call_log_completed`를 대체) | [Zoom Call History 변경 로그](https://developers.zoom.us/changelog/phone/november-13-2025/), [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/) |
| Aircall | `GET /v1/calls`. 필터 `from`/`to`(UNIX timestamp, 생성일 기준), 페이지당 최대 50건, 전체 10,000건 캡 | OAuth Bearer(파트너) 또는 **Basic Auth `api_id:api_token`**(Aircall 고객) | Aircall 웹훅 존재(문서 원문 직접 확인은 못 함) | [Aircall API Overview 요약](https://developer.aircall.io/docs/work-with-call-data) 경유 확인, 공식 사이트 `developers.aircall.io/api-references` |

### 가져올 수 없는 것 · 확인 못 한 것

- Twilio·RingCentral·Zoom·Aircall 모두 **API 레퍼런스 페이지 자체가 SPA(JS 렌더링)** 라서 WebFetch가 완전한 필드 표를 가져오지 못하는 경우가 많았다. 특히 Twilio의 필드 설명 일부, Zoom v2 신규 스코프 명칭, Aircall 응답 필드 전체 목록은 **검색엔진 요약을 경유**했고 원문 그대로 재확인은 못 했다 — 설계 확정 전 각 서비스 API 콘솔에서 실제 응답 스키마 재확인 권장.
- Zoom은 **레거시 call_logs API가 2026년 5월 폐기 예정**이라 신규 연동은 처음부터 v2 Call History로 설계해야 한다([Zoom changelog](https://developers.zoom.us/changelog/phone/november-13-2025/): "legacy Call Logs APIs (v1) will be fully deprecated in May 2026").
- Twilio는 "OAuth 스코프"라는 개념 자체가 약함 — Account SID/Auth Token 또는 API Key 기반이 표준이라는 점을 그대로 명시함(질문의 전제와 다름).

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: 상대방 번호/방향(inbound/outbound) 기반 자동 생성
- 시각 필드: `StartTime`(Twilio) / call-log 항목의 시작시각(RingCentral) / `from`~`to` 구간(Zoom·Aircall)
- 상대방 필드: 전화번호 — **마스킹 필요** (SASU 정책상 개인 연락처)
- 종류: 통화(발신/수신), duration 포함

---

## 3. CRM 활동 API

### 가져올 수 있는 것

| 서비스 | 엔드포인트·필드 | 조건 | 웹훅 | 출처 URL |
|---|---|---|---|---|
| HubSpot Calls | Calls 엔게이지먼트 객체. 필드 `hs_timestamp`(필수, 타임라인 위치 결정), `hs_call_direction`(INBOUND/OUTBOUND), `hs_call_duration`(밀리초), `hs_call_status`, `hs_call_body` | 스코프: `crm.objects.contacts.read`(+write). Search API로 `hs_timestamp`에 `GTE`/`LTE` 연산자 필터 가능(단, v3 Search API 날짜 필터 버그 커뮤니티 제보 존재) | HubSpot 웹훅(engagement 생성/변경) 있음 — 원문 미확인 | [HubSpot Calls](https://developers.hubspot.com/docs/api/crm/calls), [CRM Search API 가이드](https://developers.hubspot.com/docs/api-reference/search/guide) |
| HubSpot Emails | 필드 `hs_timestamp`, `metadata.html`(본문) | 스코프 `crm.objects.contacts.read` 외 별도 **`sales-email-read`** 스코프 필요 — 없으면 EMAIL/INCOMING_EMAIL/FORWARDED_EMAIL의 본문이 `"The content of this email has been redacted. To include it in the response, your app must require the sales-email-read scope."`로 마스킹됨 | 확인 못 함 | [HubSpot changelog – sales-email-read 스코프 공지](https://developers.hubspot.com/changelog/announcement-new-scope-required-to-get-the-content-of-email-engagements) |
| HubSpot Meetings | `hs_timestamp`, `hs_meeting_title`, `hs_meeting_start_time`/`hs_meeting_end_time`, `hs_meeting_outcome`(scheduled/completed/rescheduled/no show/canceled), `hs_meeting_location`, `hs_meeting_external_url` | 스코프 `crm.objects.contacts.read`(+write) | 확인 못 함 | [HubSpot Meetings](https://developers.hubspot.com/docs/api/crm/meetings) (검색엔진 요약 경유; 직접 페이지 URL은 이번 세션에서 404로 재확인 못 함) |
| Salesforce ActivityHistory | 완료된 Task·Event를 모아 보여주는 **읽기 전용** 관련 리스트. `Select Id, (Select Subject From ActivityHistory) From Account` 형태의 하위 쿼리로만 조회 가능(직접 SOQL 대상 아님). Task/Event는 `WhatId`/`WhoId`로 다형성 연결 | 시간 필터는 SOQL 날짜 리터럴로 가능: `TODAY`, `YESTERDAY`, `LAST_N_DAYS:n` 등(`WHERE LastModifiedDate = TODAY` 같은 패턴) | 확인 못 함(Platform Event/CDC로 가능할 것으로 추정 [추정], 원문 미확인) | [SOQL 날짜 리터럴 공식 문서](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_dateformats.htm)(프록시 경유 재확인 성공), [Last Activity vs Last Modified](https://help.salesforce.com/s/articleView?id=000385365&language=en_US&type=1) |
| Pipedrive Activities | **v1 `/v1/activities`가 아니라 현재 v2 `GET /api/v2/activities`**. 필드/파라미터: `done`(boolean), `due_date`는 명시적 응답 필드로는 확인 못 했으나 `sort_by`에 `due_date` 존재. 필터 `updated_since`/`updated_until`(RFC3339), `owner_id`, `deal_id`, `person_id`, `org_id` | 인증 방식 원문 미확인(일반적으로 API token 또는 OAuth) | 확인 못 함 | [Pipedrive Activities API](https://developers.pipedrive.com/docs/api/v1/Activities) (문서가 v2 엔드포인트로 리다이렉트됨을 확인) |

### 가져올 수 없는 것 · 확인 못 한 것

- **Salesforce**: `developer.salesforce.com` 도메인 전체가 WebFetch에 **403을 반환**(봇 차단으로 추정, REST API 소개 페이지조차 차단됨). `r.jina.ai` 프록시로 SOQL 날짜 리터럴 페이지는 원문을 확보했으나, `ActivityHistory`/`Task` 객체 참조 페이지는 프록시로도 쿠키 배너만 반환되어 **필드 표 원문은 확인 못 함**. ActivityHistory 설명·다형성 관계는 검색엔진이 인용한 공식 페이지 스니펫에 의존했다 — 신뢰도가 직접 페치보다 낮음을 명시한다.
- **Pipedrive**: 질문에서 전제한 `/v1/activities` 엔드포인트는 실제로는 v2로 리다이렉트되었다. 즉 **v1 문서 자체가 최신이 아닐 가능성**이 높다 — 구현 시 v2 스펙 기준으로 설계해야 한다.
- HubSpot Meetings API의 정식 스코프 문자열, Salesforce ActivityHistory의 CDC(Change Data Capture) 웹훅 가능 여부는 확인 못 함.

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: HubSpot은 `hs_call_body`/`hs_meeting_title`, Salesforce는 Task `Subject`, Pipedrive는 activity `subject`(추정, 원문 미확인)
- 시각 필드: HubSpot `hs_timestamp`/`hs_meeting_start_time`, Salesforce `ActivityDate`/`LastModifiedDate`, Pipedrive `due_date`/`updated_since` 기준
- 상대방 필드: 연락처 ID 참조가 대부분이라 실제 개인 식별정보(이름·번호)는 별도 조인 필요 — **조인 후 마스킹 필요**
- 종류: 통화/이메일/미팅/노트(HubSpot은 엔진지먼트 타입으로 명확히 구분됨)

---

## 4. 이메일 메타데이터

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 웹훅 | 출처 URL |
|---|---|---|---|---|
| Gmail API 검색 | `messages.list`의 `q` 파라미터 — Gmail 검색창과 동일한 쿼리 문법(`from:`, `is:unread` 등 확인. `after:`/`in:sent` 조합은 문법상 가능할 것으로 보이나 이 페이지에 **명시적 예시로는 없음**[추정 아님/문서상 미기재]). **`gmail.metadata` 스코프 사용 시 `q` 파라미터 자체를 사용할 수 없음**("Parameter cannot be used when accessing the api using the gmail.metadata scope") | — | Gmail push notification(`users.watch`) 있음 — 원문 미확인 | [messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) |
| Gmail `format` 파라미터 | `minimal`(ID·라벨만, 헤더/본문 없음), `full`(본문 파싱 포함), `raw`(base64url 전체), **`metadata`(ID·라벨·이메일 헤더만, 본문 없음)** | — | — | [Format enum](https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format) |
| Gmail 스코프 분류 | `gmail.metadata`: "View your email message metadata such as labels and headers, but not the email body." `gmail.readonly`: "View your email messages and settings." 둘 다 **Restricted scope** | Restricted scope는 프로덕션에서 테스트유저 100명 초과 시 Google의 **연 1회 CASA 기반 보안 심사**(App Defense Alliance 기준) 통과 필요, LOA 승인일로부터 최소 12개월마다 재인증 | — | [Gmail API auth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) |
| Microsoft Graph 메일 | `GET /me/messages` 또는 `/me/mailFolders/{id}/messages`. `$filter=ReceivedDateTime ge 2017-04-01 and receivedDateTime lt 2017-05-01` 같은 시간 필터 **공식 예시로 확인**. `sentDateTime` 자체의 명시적 `$filter` 예시는 문서에서 못 찾음(같은 DateTimeOffset 타입 속성이라 유사 동작 예상[추정]) | 위임 권한 최소권한: **`Mail.ReadBasic`**(본문·첨부·확장속성 제외 — "get their Mail messages without the body or attachments", Microsoft 365 Developer Blog), 상위 권한 `Mail.Read`/`Mail.ReadWrite`. 애플리케이션 권한 최소치는 `Mail.ReadBasic.All` | Microsoft Graph 변경 알림(subscription) 존재 — 원문 미확인 | [List messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0), [$filter 사용법](https://learn.microsoft.com/en-us/graph/filter-query-parameter), [Mail.ReadBasic 공지](https://devblogs.microsoft.com/microsoft365dev/new-basic-read-access-to-a-users-mailbox/) |

### 가져올 수 없는 것 · 확인 못 한 것

- Gmail `q=after:YYYY/MM/DD in:sent` 조합이 공식 문서에 **정확히 이 형태로 예시화**되어 있는지는 확인 못 함(일반 Gmail 검색 문법 원칙상 동작할 것으로 보이나 검증 안 됨) [추정].
- `format=metadata` 사용 시 `metadataHeaders` 파라미터로 특정 헤더만 선택 가능한지는 이번 조사에서 원문 확인 못 함.
- Graph `sentDateTime` 필드의 `$filter` 지원 여부는 `receivedDateTime` 사례로 유추한 것이며 **직접 예시 문서는 못 찾음**.

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: `Subject` 헤더 (metadata 스코프로도 확인 가능)
- 시각 필드: Gmail `internalDate`, Graph `sentDateTime`/`receivedDateTime`
- 상대방 필드: `To`/`From` 헤더의 이메일 주소 — **마스킹 필요**(개인 이메일 주소는 SASU 정책상 연락처에 해당)
- 종류: 메일(발신/수신) — Gmail은 `in:sent`/`in:inbox`, Graph는 폴더(`sentitems`)로 구분

---

## 5. 캘린더

### 가져올 수 있는 것

| 항목 | 엔드포인트·필드 | 조건 | 웹훅 | 출처 URL |
|---|---|---|---|---|
| Google Calendar `events.list` | `timeMin`(RFC3339, exclusive lower bound — "end time" 기준), `timeMax`(RFC3339, exclusive upper bound — "start time" 기준). `attendees[]`(이메일·응답상태: needsAction/declined/tentative/accepted), `hangoutLink`(읽기전용), `conferenceData`(Google Meet 등 회의 정보) | 스코프 `calendar.readonly`, `calendar.events.readonly`, `calendar.events` 확인됨 | Google Calendar push notification(`events.watch`) 있음 — 원문 미확인 | [events.list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [events 리소스](https://developers.google.com/workspace/calendar/api/v3/reference/events) |
| Microsoft Graph `calendarView` | `GET /me/calendar/calendarView?startDateTime={..}&endDateTime={..}`(ISO 8601, 타임존 오프셋 없으면 UTC로 해석). `$top` 최대 1000. `createdDateTime`/`lastModifiedDateTime`은 `$select` 미지원(전체 조회 시에만 값 확인 가능) | 위임 최소권한 `Calendars.ReadBasic`, 상위 `Calendars.Read`/`Calendars.ReadWrite`. 애플리케이션 권한도 `Calendars.ReadBasic`이 최소 | Graph 변경 알림(subscription) — 원문 미확인 | [List calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0) |

### 가져올 수 없는 것 · 확인 못 한 것

- Graph `calendarView`의 `event` 리소스에서 attendees/onlineMeeting 필드가 `$select`로 항상 제한 없이 반환되는지는 이번 조사 범위 밖(원문에 관련 제약 언급 없음, 다만 `createdDateTime`/`lastModifiedDateTime`는 `$select` 미지원이라는 예외는 확인).
- `Calendars.ReadBasic`이 회의 세부내용(본문·참석자)까지 포함하는지, 아니면 제목/시간만 주는지는 이번 조사에서 원문 확인 못 함 — Mail.ReadBasic과 이름은 유사하지만 동일한 제한 범위인지 검증 필요.

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: `summary`(Google)/`subject`(Graph)
- 시각 필드: `start`/`end`(Google), `start`/`end`(Graph, calendarView 응답)
- 상대방 필드: `attendees[].email`(Google) — **마스킹 필요**(참석자 이메일이 개인 식별정보)
- 종류: 미팅 — `hangoutLink`/`conferenceData`(Google Meet), Graph의 `onlineMeeting`(원문 미확인)로 화상회의 여부 구분 가능

---

## 6. 상담·티켓

### 가져올 수 있는 것

| 서비스 | 엔드포인트·필드 | 조건 | 웹훅 | 출처 URL |
|---|---|---|---|---|
| 채널톡(Channel.io) | `GET https://api.channel.io/open/v5/user-chats`. 파라미터: `state`(closed/opened/snoozed, 필수), `sortOrder`(asc/desc/both, 필수), `since`(커서 기반 페이지네이션 키, **시간 범위 필터 아님**), `limit`(1~500) | 인증: 요청 헤더 `x-access-key`/`x-access-secret`(Channel Desk에서 발급) | 확인 못 함(공식 웹훅 존재 여부 이번 조사에서 미검증) | [List of UserChats](https://developers.channel.io/docs/list-of-userchats-1) |
| Zendesk | `GET /api/v2/incremental/tickets?start_time=`(Unix epoch, 반드시 "1분 이상 과거"). 응답 `end_time`, `next_page`, `count`, `end_of_stream` | "Allowed For: Admins" — 관리자 권한 필요. 인증 방식 세부는 원문 미확인 | 확인 못 함 | [Incremental ticket export](https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/) |
| Intercom | `POST /conversations/search` — 필터 필드 `id`, `created_at`, `updated_at`, `waiting_since`, `snoozed_until`, `state`, `open`, `read`, `tag_ids` 등. 연산자: 정수·날짜에 `>`/`<`, 공통 `=`/`!=`/`IN`/`NIN`, 문자열 `~`/`^`/`$`, 논리 `AND`/`OR` | 인증 Bearer 토큰(`Authorization: Bearer <token>`) | 확인 못 함 | [Search for conversations](https://developers.intercom.com/docs/references/2.7/rest-api/api.intercom.io/conversations/searchconversations) |
| 카카오 비즈니스(카카오톡 채널) | **상담 내역·대화 조회 API 없음.** 공식 REST API는 `GET /v2/api/talk/channels`(채널 관계 조회), `GET /v2/api/talk/channels/multi`, 고객파일(target_user_file) 등록/조회/추가/삭제뿐 | — | — | [카카오톡 채널 REST API](https://developers.kakao.com/docs/latest/ko/kakaotalk-channel/rest-api) |

### 가져올 수 없는 것 · 확인 못 한 것

- 채널톡의 `since` 파라미터는 "첫 조회 대상의 인코딩된 키"로, **날짜/시간 값이 아니라 커서**다. 따라서 "오늘 상담만" 같은 절대 시간 범위 필터는 문서상 확인 못 함 — 클라이언트 측에서 `createdAt` 등을 받아 필터링해야 할 가능성 있음(응답 필드 상세는 확인 못 함).
- Zendesk incremental export의 정확한 인증 헤더(API 토큰 vs OAuth) 원문은 이번 조사에서 못 봄.
- 카카오: **상담톡(1:1 채팅) 자체의 대화 로그를 API로 가져오는 공식 엔드포인트는 developers.kakao.com 문서에서 찾지 못했다.** "없다"로 명시. 카카오톡 채널 API 문서 목차 전체를 훑은 결과 채널 관계·고객파일 관리 기능뿐이었다. 단, 카카오가 상담톡/알림톡을 별도 비즈니스 파트너(카카오워크, 비즈메시지 대행사) 경유로만 제공할 가능성은 [추정]이며 이번 조사에서 추가 확인 못 함.

### 회고 활동 항목으로 변환할 때 쓸 필드

- 제목: Zendesk `subject`(원문 미확인이나 표준 필드로 알려짐[추정]), Intercom 대화 첫 메시지 스니펫(원문 미확인)
- 시각 필드: Zendesk `start_time`/`end_time` 구간, Intercom `created_at`/`updated_at`, 채널톡은 응답 필드 자체를 이번에 확인 못 함
- 상대방 필드: 고객 식별자(이메일/전화번호 등) — **마스킹 필요**
- 종류: 티켓/상담

---

## 7. 한국 SaaS

### 가져올 수 있는 것

| 서비스 | 확인 내용 | 출처 URL |
|---|---|---|
| 세일즈맵(salesmap.kr) | 공개 개발자 문서 존재: `developers.salesmap.kr`(→ `salesmap.gitbook.io/developers`). "CRM API"는 "고객, 회사, 리드, 딜, 노트, 파일, 커스텀 오브젝트 등 CRM 데이터 연동"을 지원한다고 명시. 별도 "SeA API"(AI SDR 위젯·대화·리드수집)도 있음. 인증은 개인 설정 → 연동 메뉴에서 토큰 발급 | [Salesmap Developers](https://developers.salesmap.kr/), [API Reference](https://salesmap.gitbook.io/developers/api-reference) |
| 리멤버 비즈니스(리멤버 팀 명함첩 등) | **공개 API 문서 확인 못 함.** 리멤버 공식 도메인(`rememberapp.co.kr`, `corp.remember.co.kr`, `teambook.rememberapp.co.kr`)에서 개발자/API 문서 페이지를 찾지 못했고, 커뮤니티에서 발견한 "API key" 게시글도 리멤버 자체 API가 아니라 일반적인 소셜 로그인 API 키에 대한 질문이었다 | 확인 시도: [리멤버 커뮤니티 게시글](https://community.rememberapp.co.kr/post/75522) — 리멤버 자체 API 문서 아님 |

### 가져올 수 없는 것 · 확인 못 한 것

- 세일즈맵 CRM API에 "활동(activity)/통화 로그"에 해당하는 전용 엔드포인트가 있는지는 목차 페이지 접근 제약(JS 렌더링)으로 **확인 못 함**. "노트(Notes)"는 확인됨. 시간 필터 파라미터명·인증 헤더 형식(Bearer 등) 세부도 확인 못 함.
- 리멤버 비즈니스는 공개 문서를 찾지 못했으므로 "없다"고 단정하지 않고 **"공개 문서 확인 못 함"**으로 남긴다. 비공개 파트너 API(영업 문의 후 제공)가 존재할 가능성은 [추정].

### 회고 활동 항목으로 변환할 때 쓸 필드

- 세일즈맵: 리드/딜/노트 객체를 CRM API로 가져올 수 있는 것은 확인되나, 구체 필드명은 이번 조사에서 확보 못 함 — 설계 전 실제 API 콘솔/Postman 컬렉션으로 스키마 확인 필요.
- 리멤버 비즈니스: 연동 불가로 간주하고 설계에서 제외 권장(공식 채널 문의 전까지).

---

## 출처 목록

- https://support.google.com/googleplay/android-developer/answer/9047303
- https://developer.apple.com/forums/thread/54096
- https://developer.apple.com/documentation/callkit
- https://developer.android.com/reference/android/provider/CallLog.Calls (접근 시도, 본문 확보 실패)
- https://www.twilio.com/docs/voice/api/call-resource
- https://www.twilio.com/docs/usage/requests-to-twilio
- https://www.twilio.com/docs/glossary/what-is-an-api-key
- https://developers.ringcentral.com/guide/voice/call-log/quick-start
- https://developers.ringcentral.com/guide/voice/call-log
- https://developers.ringcentral.com/guide/basics/permissions
- https://developers.zoom.us/changelog/phone/november-13-2025/
- https://developers.zoom.us/docs/phone/understanding-call-history/
- https://developer.aircall.io/docs/work-with-call-data
- https://developers.aircall.io/api-references
- https://developers.hubspot.com/docs/api/crm/calls
- https://developers.hubspot.com/docs/api/crm/meetings
- https://developers.hubspot.com/docs/api-reference/search/guide
- https://developers.hubspot.com/changelog/announcement-new-scope-required-to-get-the-content-of-email-engagements
- https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_dateformats.htm
- https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_activityhistory.htm (접근 시도, 403/쿠키 배너로 본문 확보 실패)
- https://help.salesforce.com/s/articleView?id=000385365&language=en_US&type=1
- https://developers.pipedrive.com/docs/api/v1/Activities (v2로 리다이렉트됨)
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/Format
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages#Message
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/graph/filter-query-parameter
- https://learn.microsoft.com/en-us/graph/query-parameters
- https://devblogs.microsoft.com/microsoft365dev/new-basic-read-access-to-a-users-mailbox/
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://developers.google.com/workspace/calendar/api/v3/reference/events
- https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0
- https://developers.channel.io/docs/list-of-userchats-1
- https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/
- https://developers.intercom.com/docs/references/2.7/rest-api/api.intercom.io/conversations/searchconversations
- https://developers.kakao.com/docs/latest/ko/kakaotalk-channel/rest-api
- https://developers.salesmap.kr/
- https://salesmap.gitbook.io/developers/api-reference
- https://community.rememberapp.co.kr/post/75522
