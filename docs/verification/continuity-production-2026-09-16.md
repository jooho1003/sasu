# 후속 기능 운영 반영 및 실제 연동 검증 — 2026-09-16

사용자의 운영 반영·실제 연동 테스트 요청과 기존 Slack 연결 부서장의 조직 관리자 지정 승인을 받아 phase 16~19를 운영에 반영했다. 운영 URL은 https://sasu-alpha.vercel.app 이다.

## 반영 결과

- 애플리케이션 코드: `62b9a0c` (`e942d03`의 후속 기능 + 카드 한국어·한국 시간 보완).
- 최종 배포: `dpl_DAbuoi64MTipScXcqWvLsiodxmMH`, Ready 확인 후 운영 도메인으로 promote 완료.
- DB: `0030_source_lifecycle`~`0033_slack_installations` 적용. 사전 정정 분기·활성 Slack 채널 중복은 모두 0건.
- 기존 Slack 설치를 AES-256-GCM 암호화 저장으로 이전. 활성 설치 1개, scope 10개, source/member 각각 3개 연결. 브라우저 역할의 credential 직접 읽기·저장 함수 호출은 차단됨.
- 사용자 승인 대상인 Slack 연결 부서장 `사수 파일럿 팀장`(`06d389ec-4f73-443e-b3de-9c6b423d99c3`)을 운영 조직 관리자로 지정했다. 현재 Chrome에서 로그인한 `이주호`는 별도 부서장 계정이므로 권한을 추가하지 않았다.
- Production에 Slack client ID·secret·암호화 키를 민감 환경변수로 설정하고 로컬의 git 제외 환경파일에도 동기화했다. 비밀값은 기록하지 않는다.
- Slack callback URL, `app_uninstalled` 이벤트, App Home DM 메시지 입력 설정을 반영했다. 전환 중 Events·cron을 잠시 중지했고 마이그레이션·기존 설치 이전·앱 반영 후 모두 재개했다.

## 실행한 실제 연동 테스트

아래 검사는 합성 표시가 있는 테스트 내용으로 **운영 URL·운영 DB·실제 Slack/Notion/Groq/Voyage**를 사용했다. 웹 쓰기는 일반 사용자 세션 API로 실행했고 service role은 검증 조회·설치 이전에만 사용했다.

| 흐름 | 결과 |
|---|---|
| 실제 Slack 채널 글 → 수집 → 분류 → 결정 카드 DM | 성공. 최종 카드 `7d93b219-c746-4321-9861-a404befcabc7` |
| 채널 @SASU 질문 → 원문 인용 답변 | `done`, Slack 전달 `sent` |
| 실제 DM 질문 → 같은 스레드 후속 질문 | 답변 2개 모두 `done/sent`, 자식의 `parent_id` 일치 |
| Slack 원문 수정 | item version 1→2, 기존 카드 `needs_review/source_invalidated`, 기존 DM 재검토 안내로 수정 |
| 변경된 원문을 인용한 이전 답변 접근 | RLS가 답변을 숨겨 API 404. 기존 답변 본문·인용 미반환 |
| 웹 질문·후속 질문 | 실제 모델 답변과 인용 생성, 부모 질문 연결 확인 |
| 다른 사용자의 질문을 부모로 지정 | 403 |
| 결정 정정 | 원본·정정 2행과 인용 유지, 동일 request 재실행 멱등, 경쟁 정정 409 |
| 예약 알림 → 실제 DM / 재예약·취소 | `sent` 및 취소 200. 배포 후 마감 경과 카드 알림 3건도 `sent` |
| Slack 카드 결정 버튼 → 모달 제출 → 원장 | 결정 `b2886ad3-95ba-4f71-acaa-f8b4f774febe` 1행, 세션에 대응한 담당자, 웹에서 결정 완료 표시 |
| Notion 신규 페이지 실제 가져오기 | 1개 블록 수집, 오류 없음 |
| Notion 본문 편집 → 자동 갱신 | 37→41만원 수정 반영, version 1→2, 다음 5분 갱신 예약 확인 |
| Notion 본문 제거 → 다시 가져오기 | version 3, tombstone과 빈 content 확인 |
| OAuth 시작 API | 관리자 303 → slack.com, HttpOnly·Secure cookie. 일반 멤버 403 |

실행 시각·ID·상태는 [live-results.ndjson](continuity-production-2026-09-16/live-results.ndjson)에 보존했다. Slack 질문 원문·인증값을 실행 로그에 출력하지 않았다. 합성 문서/카드의 화면 증거는 [운영 웹 카드](continuity-production-2026-09-16/web-card-live.png), [Slack 결정 완료](continuity-production-2026-09-16/slack-decision-live.png)에서 확인할 수 있다.

## 발견하고 해결한 문제

1. 기존 Slack App Home에서 DM 입력이 꺼져 있어 활성화했다. 새로고침 후 실제 질문·후속 답변까지 확인했다.
2. 첫 실제 카드가 영어로 생성되고 원문의 9/18 16:00을 UTC로 해석하여 한국 화면에 9/19 01:00으로 표시했다. 카드 프롬프트에 한국어 출력, Asia/Seoul 기본 시간대, 명시된 기한만 사용, 원문 작성 시각 기준 상대 날짜 해석을 추가했다. 무관한 프로젝트를 단순 금액 유사성으로 충돌 처리하지 않도록 보완했다.
3. 수정본을 배포한 후 별도의 합성 Slack 글로 재검증했다. 새 카드는 한국어, UTC `2026-09-18T07:00:00.000Z` / 화면 **9월 18일 오후 4시**였고 무관한 과거 결정 충돌 표시는 없었다. 기존 잘못된 카드는 원문 수정 테스트로 무효화됐다.
4. 최초 배포 시 저장소 안의 중첩 snapshot은 Vercel에서 blocked되어 promote하지 않았다. 저장소 밖의 snapshot 배포가 Ready가 된 후 반영했다. 이후 중첩 snapshot이 lint 대상에 들어간 문제도 작업 폴더 밖으로 옮겨 해결했다.
5. 임시 검증 스크립트의 `sync_status`라는 없는 컬럼 조회 때문에 Notion 검사 첫 실행이 timeout이었다. 실제 import는 성공했으며 올바른 컬럼으로 재조회·수정·제거 검사를 통과했다. stale answer 검사도 처음에는 200/refused만 예상했으나 실제 RLS의 404 차단을 확인했다. 해당 실패 기록은 제품 실패와 구분하여 원본 로그에 남겼다.

## 검증 기록

| 검사 | 결과 | 기록 |
|---|---|---|
| 최종 코드 lint → build → unit | 모두 통과, 77 파일 / 1,012개 | [lint](continuity-production-2026-09-16/lint.txt), [build](continuity-production-2026-09-16/build.txt), [unit](continuity-production-2026-09-16/unit.txt) |
| 운영 읽기·게스트·서명·화면 회귀 | 12개 통과, 1.8분. 게스트 DB 쓰기·LLM 증가 없음 | [production-e2e](continuity-production-2026-09-16/production-e2e.txt) |
| 운영 마이그레이션·권한·cron 상태 | 적용·암호화·권한 거절·cron 활성 확인 | [migration](continuity-production-2026-09-16/migration.txt), [SQL](continuity-production-2026-09-16/sql.txt) |
| 새 SQL 격리 하니스 | 앞선 145검사 + 2,016 권한 assertion 통과 기록 유지 | [개발 검증](product-continuity-2026-09-16.md) |
| 배포 후 오류 로그 | 19:03 KST 기준 최근 15분 Vercel error 로그 0건 | CLI 조회 |
| 운영 검증 작업 최종 상태 | 19:08 KST, 전환 이후 40개 job 모두 done, 실패·대기·실행 중 0개 | [live-results](continuity-production-2026-09-16/live-results.ndjson) |

운영 E2E는 최초 기능 배포 후 실행했다. 이후 변경은 카드 프롬프트뿐이며 최종 lint/build/unit 및 실제 운영 카드 생성·Slack 결정·웹 표시로 재검증했다.

## 백업 및 종료 상태

전환 전 schema/data dump는 git 제외 경로 `.vercel/rollout-20260916/`에 보관했다.

- `pre-schema.sql` SHA-256: `2CB459367E391D15291027C920704274F6FEB9156E822D9CFD7EF43CD5A6B53D`
- `pre-data.sql` SHA-256: `4F6D9F370B48DDAD79FC4FBF8F53F90AE7665E2FFCB4F701026FAFE1233A0D1F`

원장 데이터의 자기참조 때문에 복원 시 FK/트리거 처리 계획이 필요하다. 신규 DB 스키마에서 과거 전역 토큰 앱으로 단순 rollback하지 않는다. 최초 새 기능 배포 `dpl_GPk2vt9an7VgU3DUfbHDwUxcSnxx`는 최종 카드 프롬프트 보완 이전의 호환 가능한 배포다.

Notion 테스트 연결은 `active=false/auto_sync=false`로 중지했고 테스트 페이지 본문에 완료 안내를 남겼다. 예약 테스트는 취소했으며 새 카드도 합성 결정으로 종료했다. 기존 결정과 정정은 append-only로 보존한다.

## 남은 외부 검증

- **새 OAuth 설치·해지·재설치의 브라우저 전체 흐름**: 기존 설치 암호화 이전·실제 송수신·관리자 시작 API까지 검증했다. Chrome의 별도 `이주호` 계정은 조직 관리자가 아니어서, 그 계정의 추가 관리자 지정에 대한 사용자 응답을 기다린다. 기존 Slack 연결 부서장 계정에 대한 승인만 다른 계정까지 확대 적용하지 않았다.
- 실제 Slack 메시지 영구 삭제 이벤트, 다른 Slack 워크스페이스를 이용한 고객사 간 전체 흐름은 이번 운영 세션에서 실행하지 않았다. 이 분기는 앞선 단위·격리 SQL 검증 범위다.
- Notion 자동 갱신은 활성화 직후 스케줄러 실행과 다음 5분 예약까지 확인했다. 장시간 반복 운용 관측은 이 기록의 범위가 아니다.
