# 잔여 Slack ASK 개발 및 사용자 테스트 인계 — 2026-09-16

입력: PRD §3·§6-5·§8·§11, ADR-051, [phase 15](../../phases/15-slack-completion/step0.md).

## 개발 내용

- DM 질문: 단일 소속 자동 선택, 복수 소속은 `부서 이름: 질문`(동명이면 ID)으로 선택한다. 같은 Slack 계정을 같은 웹 사용자의 여러 부서에 연결할 수 있으며 타인 계정과의 중복 매핑은 DB에서 거부한다.
- 안내: 미연결·미동의·5자 미만·1,000자 초과·일일 한도를 안내한다. 미동의 본문은 RPC에도 보내지 않는다. 채널 안내는 질문자만 보는 ephemeral 메시지다.
- 전달: 고정 처리 안내의 timestamp를 먼저 저장하고, 완료·거절·실패 결과로 같은 메시지를 갱신한다. 답변 종료와 전달 job 예약은 원자적이다. 모델 생성과 전달 재시도를 분리했다.
- 복구: Slack Retry-After를 지키고 lease 경합 때 기다린다. 갱신 실패는 자동 재시도하며, 최종 실패는 웹의 **내 Slack 질문 → Slack에 다시 보내기**로 복구한다. 삭제된 Slack 메시지는 수동 재전송에서 새 안내를 만든다.
- 권한: 전달 직전 SQL에서 현재 멤버십·동의·채널 연결과 모든 인용을 재검증한다. 채널은 `dept` 근거만, DM은 질문자 권한이다. 원문 변경·권한 회수 뒤 저장된 답변 재열람은 restrictive RLS 정책에서도 차단한다.
- 웹: 자신의 최근 Slack 질문 10건과 전송 상태만 조회한다. 선택한 답변에는 현재 볼 수 있는 인용이 모두 있어야 한다. 웹 ASK의 2분 대기 종료·중복 폴링 방지·이전 요청의 늦은 화면 덮어쓰기 차단을 추가했다.
- 기존 phase 14의 인용 표시와 설정·문서·관리자 UI 개선이 같은 로컬 소스에 포함되어 있다.

## 자동 검증

최종 소스의 자동 검증은 아래 실행 기록을 기준으로 통과했다. 운영 완료를 뜻하지 않는다.

| 검증 | 기록 |
|---|---|
| ESLint | 경고·오류 0, [lint.txt](slack-completion-2026-09-16/lint.txt) |
| 프로덕션 빌드·TypeScript | 통과, [build.txt](slack-completion-2026-09-16/build.txt) |
| Vitest | **72파일·970개 통과**, [unit.txt](slack-completion-2026-09-16/unit.txt) |
| 격리 SQL | **121개 + 권한 조합 2,016개 통과**, [sql.txt](slack-completion-2026-09-16/sql.txt) |
| Playwright | **30/30 통과**, 데스크톱·모바일, [e2e.txt](slack-completion-2026-09-16/e2e.txt) |
| 로컬 동시 사용자 부하 | **100/100 완주·601요청·실패 0**, p95 2,456ms, [load.txt](slack-completion-2026-09-16/load.txt) |

TDD 기록: 질문 준비 모듈과 전달 모듈이 없는 상태에서 각각 import 실패를 확인한 뒤 구현했다. 저장 답변 재열람은 비공개 근거 제거·인용 0개·원문 변경의 회귀 테스트 3개 실패를 재현한 뒤 수정했다.

초기 검증에서 테스트 매개변수의 배열 해석 때문에 TypeScript가 실패했다. 명시적인 객체 fixture로 수정했다. 기존 SQL fixture의 `done` 답변에는 `verified=true`가 빠져 새 경계에 차단되었으며, 실제 완료 RPC와 같은 검증 완료 상태로 fixture를 보완했다. Retry-After 단위 테스트의 고정 시각 가정도 실행 시각 기준으로 고쳤다.

브라우저 1차는 28/29 통과했다. 실패 1건은 Next.js의 숨겨진 route announcer도 `role=alert`로 선택한 테스트 선택자 오류였다. 새 패널 안으로 선택자를 한정하고, 2분 대기 종료 검사를 추가했다. 스크린샷은 합성 API 응답 기반 [1440px](slack-completion-2026-09-16/fixture-slack-questions-1440.png)·[390px](slack-completion-2026-09-16/fixture-slack-questions-390.png)이며 실제 Slack 캡처가 아니다.

## 사용자 실사용 테스트 준비

초기 개발 단계에서는 운영 DB 마이그레이션·배포·Slack 실발송을 실행하지 않았다. 이후 사용자 요청으로 아래 「운영 반영」의 마이그레이션·머지·배포를 완료했다. 아래 1·2번은 운영 환경에서 완료된 상태이며, 실제 Slack 발송 검증은 사용자 테스트로 남아 있다.

1. 테스트할 Supabase 환경에 `0029_slack_ask_completion.sql`을 적용한다. 마이그레이션은 기존 자료를 삭제하지 않는다. 기존 앱은 유지할 수 있으나 저장 답변 읽기 정책은 즉시 강화된다.
2. 새 앱을 실행한다. 로컬은 `npm run dev`, 외부 Slack 이벤트 검증은 접근 가능한 테스트 배포 URL을 사용한다.
3. Slack 앱의 `im:history`, `message.im`, App Home의 메시지 입력 허용을 확인한다. 필요하면 앱을 재설치한다. 채널 멘션은 `app_mention` 구독과 채널 초대가 필요하다. [공식 DM 이벤트](https://docs.slack.dev/reference/events/message.im/), [App Home](https://docs.slack.dev/surfaces/app-home/).
4. 테스트 부서에 본인 Slack 계정을 연결하고 수집 동의 후 아래 순서로 확인한다.

| 순서 | 동작 | 기대 결과 |
|---|---|---|
| 1 | 연결 채널에서 `@사수` 질문 | 처리 안내 → 답변·인용·작성자·KST·원문 링크로 갱신 |
| 2 | 같은 질문을 팀장 DM으로 질문 | 질문자 권한으로 답변, 채널용 공개 범위 문구와 구분 |
| 3 | 복수 소속으로 DM 질문 | 부서 선택 안내, `개발팀: 질문`은 선택한 소속만 검색 |
| 4 | 미연결 또는 미동의 계정으로 질문 | 설정/동의 안내, 질문·업무 본문 저장 0 |
| 5 | 웹 묻기 → 내 Slack 질문 → 최근 질문 확인 | 자신의 최근 질문과 전송 상태, 답변 보기 가능 |
| 6 | 전달 실패를 복구한 테스트 환경에서 다시 보내기 | 생성 모델 재호출 없이 저장 답변 갱신, 연타 중복 예약 0 |
| 7 | 인용 소스를 비공개/삭제하거나 질문자의 권한·동의를 회수 | 전달 중단 또는 고정 거절, 이전 생성 본문 재열람 차단 |
| 8 | 메인·게스트·관리자·문서·설정 화면 | 기존 동선 유지, 게스트는 쓰기·LLM 호출 0 |

실패 유도는 테스트 환경에서만 한다. 운영 키를 일부러 잘못 설정할 필요는 없다. 실제 Slack 스크린샷은 합성 질문·합성 근거만 사용한다. 제출 캡처 교체·참가 접수·최종 제출·심사 기간 헬스체크는 사용자 검증/운영 작업이다.

전체 제품 인수 테스트에는 실제 채널 20건 분류 라벨 비교, Slack 카드 버튼→원장, 전사/문서 업로드, Notion 가져오기, 관리자 초대→로그인→동의, 합성 예고편 발행·철회도 포함한다. 이번 변경은 이미 있는 해당 기능을 새로 만들었다고 집계하지 않는다. 100명 부하는 로컬 서버 결과이며 운영 URL의 부하 검증을 대체하지 않는다.

운영 반영 시 설치된 Vercel CLI 59.17.0과 Supabase CLI 2.117.0을 사용했다.

## 운영 반영 — 2026-09-16, 사용자 요청

- 기능 커밋: `ac4b49a`. `feat/slack-ask-completion`을 `main`에 머지한 커밋은 `cda9971`이며 GitHub `origin/main` 푸시를 완료했다. 기존 로컬 선행 8개 커밋도 함께 반영했다.
- 이전 운영 배포(앱 롤백 대상): `dpl_Hq6oWYaRH9BqxRZD3ScRzZQgQLMq`.
- 새 운영 배포: `dpl_FY5yvhZdEVQHoRNB4L7bpZePDBL3`, 소스 `ac4b49a`, [운영 주소](https://sasu-alpha.vercel.app). Git 메타데이터 없는 커밋 스냅샷을 `--prod --skip-domain`으로 선빌드하고 READY를 확인했다. 앱 소스는 머지 커밋과 동일하다.
- DB: 대상 프로젝트 `fzpnidoyhejrmhymggpp`를 확인하고 dry-run에서 `0029`만 예정된 것을 확인한 뒤 적용했다. 시드 실행 없음. [마이그레이션 실행 기록](slack-completion-2026-09-16/production-migration.txt).
- 순서: 새 앱 선빌드 → `0029` 적용 → `main` 머지·푸시 → 새 배포 promote → 운영 주소가 새 배포를 가리키는지 재확인.
- DB 확인: 최신 `0029`, 전달 테이블 RLS, 사용자 직접 조회 거부, 익명 RPC 실행 거부, 세션 조회 허용, 수집 RPC는 서비스 역할만 허용, 답변 restrictive 정책 1개. 활성 cron 1개, 최근 5분 실행 성공 5건. [SQL 실행 기록](slack-completion-2026-09-16/production-sql.txt). 최초 조회 명령은 Windows CLI의 여러 줄 인자 전달 오류로 실패했으며 SQL 파일 입력으로 바꿔 성공했다. 마이그레이션 오류가 아니다.
- 공개 페이지·데모·로그인·데모 관리자·공개 예고편 200, 관리자 비로그인 307, 워커·Slack 무인증 401: [8개 스모크 결과](slack-completion-2026-09-16/production-smoke.json).
- 운영 읽기 E2E: 최초 **14/16 통과(2.9분)**. 게스트 전체 순회의 기본 30초 한도와 묻기 화면 전환 전 5초 인용 검사에서 2건이 실패했다. 실패 캡처는 아직 원장 화면이었다. 게스트 전체 검사 한도를 120초로 맞추고 묻기 URL 전환 완료를 명시적으로 기다리도록 테스트만 보완했다. 해당 **2건 재실행 모두 통과(21.4초)**, 게스트 열람 전후 AI·업무 테이블 행 수 동일. [최초 기록](slack-completion-2026-09-16/production-e2e.txt), [재검사 기록](slack-completion-2026-09-16/production-e2e-recheck.txt). 수정한 테스트의 ESLint·diff 검사도 통과했다. 이 보완은 배포 앱 소스를 바꾸지 않는다.
- 새 Slack 질문 패널: 실제 QA 세션 → 운영 GET → 실제 DB RPC를 1440px·390px에서 확인했다. 자신의 질문 0건 응답과 빈 상태 표시, 업무 쓰기 요청 0, 브라우저 오류 0, 응답 모킹 0. [실행 결과](slack-completion-2026-09-16/production-slack-read.json), [1440px](slack-completion-2026-09-16/production-slack-questions-1440.png), [390px](slack-completion-2026-09-16/production-slack-questions-390.png).
- 로컬에 설정된 Slack 봇 토큰의 인증과 `im:history`·`chat:write` scope를 읽기 API로 확인했다. `message.im` 구독·App Home 입력 허용·실발송은 이번 배포 검증에 포함하지 않았다.
- 새 배포의 최근 10분 error 로그 조회: 0건(조회 시점 기준).

앱 롤백은 위 이전 배포로 수행할 수 있다. `0029`를 파괴적으로 되돌리는 SQL은 실행하지 않는다. 기존 앱과 호환되지만, 강화된 저장 답변 조회 정책은 DB에 유지된다.

## 검증의 경계

- SQL은 PGlite의 격리 DB에서 실행했다. 운영 PostgreSQL 다중 연결 동시성·pg_cron/pg_net·실제 Slack은 별도 실사용 검증 대상이다.
- 새 Slack 질문 UI 브라우저 테스트는 합성 API 응답을 사용한다. 로그인·기존 게스트 조회는 기존 QA 환경을 사용한다. 새 기능의 실제 외부 DB 쓰기·Slack 발송·LLM 실행을 통과했다고 주장하지 않는다.
- Slack과 DB 사이 원자적 커밋은 없다. 최초 안내 POST의 응답이나 DB 기록을 잃으면 안내가 중복될 수 있다. 인용 답변은 timestamp 저장 후 update로만 전송한다.
- ephemeral 안내는 Slack 자체에서도 전달을 보장하지 않는다. 안내 실패는 질문 원문을 저장하거나 무한 재전송하는 이유로 쓰지 않는다. [Slack 문서](https://docs.slack.dev/reference/methods/chat.postEphemeral/).
