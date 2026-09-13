# 승인된 실제 발송 검증 — 2026-09-12

사용자 승인: “발송 진행하고 다 해줘.” 연결 Supabase 프로젝트와 DB URL의 프로젝트 ref 일치 확인. Slack auth.test 성공, 등록된 lead 수신자 users.info로 이주호/활성/사람 계정 확인 후 실행했다.

## 실제 변경

- Supabase CLI dry-run에서 0012~0015만 미적용으로 확인 후 db push --yes 성공. 네 마이그레이션 모두 연결 DB에 적용됐다.
- 합성 QA 문구가 표시된 이벤트 1건으로 실제 items/jobs/card/decision/citations가 생성됐다. 실제 Slack DM 1건 발송됐다. 테스트 기록은 삭제하지 않았다.
- 카드 ID: `d367bf4c-a9c5-48d3-ad0b-d8c67c3729ab`; DB 재조회 `status=decided`, `slack_delivery_status=sent`, `slack_channel_id=D0C0K5LJEAH`, `slack_message_ts=1789195344.786829`.
- E2E에 발송 상태 sent 및 Slack 메시지 timestamp 존재 검사를 추가했다.
- 공유 DB 쓰기와 게스트 전체 행 수 검사가 겹치지 않도록 Playwright workers=1로 변경했다.
- Vercel 배포 제외 목록에 .codex/outputs/test-results를 추가해 작업 산출물이 업로드되지 않도록 했다.

## 실행 결과 및 한계

- 전체 최초 실행: 실제 세로 슬라이스 통과(약 1.4분), 게스트 3개 통과, 모바일 1개 30초 전체 테스트 타임아웃. 합계 4 pass / 1 fail.
- 게스트 단독 순차 재실행: 4/4 통과, 모바일 10.8초. 1440/390px 완주·비인가 접근 및 잘못된 서명 차단·6개 테이블 행 수 불변 확인.
- 실제 세로 슬라이스는 로그인 → 서명된 합성 HTTP Slack 이벤트 → 분류 → 카드 생성 → 실제 Slack API DM 전송 → 웹 결정 → 원장 → 중복 결정/이벤트 방지까지 통과했다.
- Slack 이벤트 입력은 seed-public-channel/seed-member를 사용하는 합성 HTTP 입력이다. 실제 Slack 채널 작성 → Events API 전달, Slack 메시지 버튼 클릭, 원문 딥링크 유효성까지 검증한 것은 아니다. 로컬 서버 실행이므로 DM 웹 링크의 배포 주소 유효성도 별도 검증해야 한다.
- 실행 전 queued 작업은 없었고 기존 running classify 1건은 재큐잉하거나 수정하지 않았다. lease 복구는 미완료다.
- 기존 단위 452개·격리 SQL 19개·실모델 답변 6개 결과는 이전 보고서의 실행 기록이며 이번에 재실행했다고 집계하지 않는다.

## 배포 상태

Vercel CLI 59.16.0 설치 및 사용자 로그인 완료. 기존 sasu 프로젝트 접근 확인 후 preview 배포와 production --skip-domain 배포를 요청했다. Production 배포 ID는 `dpl_7M5ZK474WC3i9VaZcxjhaequZF8B`다. CLI inspect는 UNKNOWN을 표시했으나, 인증된 API 재조회 결과 `readyState=BLOCKED`, `seatBlock.blockCode=TEAM_ACCESS_REQUIRED`, `isVerified=false`였다. 원인은 Git 커밋 작성자에게 해당 프로젝트 배포 권한이 없기 때문이다. 팀 설정에서 실제 작성자의 연결 계정/권한을 바로잡아야 한다. 작성자 위장이나 도메인 승격은 하지 않았다.

공개 배포 URL의 HTTP 200은 Vercel 로그인 HTML이었으므로 앱 검증 성공으로 집계하지 않는다. 운영 도메인은 변경하지 않았고 공모전 제출도 하지 않았다. 사용자 권한 조정 후 배포 재시도 → 앱 경로 검증 → 운영 주소 반영이 남았다. 최종 lint 및 git diff --check는 종료 코드 0이다. 로컬 QA 서버는 소유 프로세스를 확인한 뒤 종료했다.

잔여 개발은 reliability-hardening.qa-report.md의 워커 lease, 카드/문서 원자 저장 및 권한 경계, 실제 회의 봇 검증을 유지한다. Lindy 직접 비교 계정은 없으며 우위나 모든 기능 완성을 주장하지 않는다.
