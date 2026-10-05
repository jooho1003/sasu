# phase 49 운영 전환 기록 (ADR-088, setup-guide §16)

2026-10-05. 단계마다 사용자 승인. 비밀값·토큰은 적지 않는다.

## 승인 1: T1~T4 (사용자 "승인 — T1~T4까지")

| # | 실행 | 확인값 |
|---|---|---|
| T1 | PR #39 preview 빌드 success 확인 → `origin/main`이 `729477f` 그대로인지 확인 → 병합(`bc4dd39`) → Vercel 운영 배포 success | 옛 주소 `/` 200·`/login` 200(이동 없음, env 미설정)·`/demo` 307 `/demo/access`, `/auth/confirm` 302 `/login?error=auth_callback` + `referrer-policy: no-referrer` + `cache-control: private, no-store` → 새 코드 운영 동작 |
| T2 | Vercel CLI(wadelee1005): `vercel domains add getsasu.com sasu`, `vercel domains add www.getsasu.com sasu`, `PATCH /v9/projects/<sasu>/domains/www.getsasu.com` `redirect=getsasu.com`·`redirectStatusCode=308` | 두 도메인 `attached`·`verified`. 권장 레코드: `@`·`www` CNAME `2c8f85545dcbf5b2.vercel-dns-017.com`(DNS only), 대안 A `76.76.21.21` |
| T3 | 변경 전 백업(레코드 ID·Redirect 규칙 전체 설정, 세션 scratchpad `cloudflare-backup-before-T3.json`). 대시보드 API 쓰기는 Cloudflare가 403으로 막아(변경 없음 확인) 대시보드 화면에서 진행: `@`·`www`의 A `192.0.2.1`(프록시 켬) → CNAME `2c8f85545dcbf5b2.vercel-dns-017.com` DNS only. Single Redirect 규칙 "getsasu.com → sasu 운영 웹"(302 → `https://sasu-alpha.vercel.app` + 경로, 쿼리 유지) 삭제 | 대시보드 API 재조회: `@`·`www` CNAME proxied=false, `rsend`·`send` CNAME·`_dmarc`·`resend._domainkey` TXT 그대로. Redirect 규칙 0개 |
| T4 | 새 주소 확인 | `getsasu.com` → 216.198.79.1·64.29.17.1, TLS `CN=getsasu.com` Let's Encrypt(만료 2027-01-03). `https://getsasu.com/`·`/login`·`/sitemap.xml` 200, `/demo` 307 `/demo/access`, `/auth/confirm` 302. `https://www.getsasu.com/login?x=1` → 308 `https://getsasu.com/login?x=1`, `http://getsasu.com/demo` → 308 https. `vercel domains verify getsasu.com` → `configured_correctly` |

T4 시점 sitemap `<loc>`는 아직 `https://sasu-alpha.vercel.app/`이다(T7 전 `NEXT_PUBLIC_APP_URL`이 옛 주소). 운영 env에 `RETRO_*_CLIENT_ID`가 없어 T6의 회고 provider 콘솔 변경은 해당 없음.

되돌리기(T2~T3): Cloudflare에 백업 값으로 A 2개(프록시 켬)와 Redirect 규칙을 다시 만들고, Vercel에서 두 도메인을 제거한다. 옛 주소는 계속 응답하므로 서비스 중단은 없다.

## 승인 2: T5~T10 (사용자 "T5~T10 한 번에")

| # | 실행 | 확인값 |
|---|---|---|
| T5 | Supabase Management API(대시보드 로그인 세션)로 변경 전 값 백업(scratchpad `supabase-auth-backup-before-T5.json`: Site URL·허용 목록·두 메일 템플릿·OTP 길이) → `site_url=https://getsasu.com`, `uri_allow_list=https://sasu-alpha.vercel.app/auth/callback,https://getsasu.com/auth/callback`. 설계의 `/**` 대신 기존처럼 정확한 callback 경로만 추가 | 재조회: 두 값 반영, OTP 6, SMTP `smtp.resend.com` 그대로, 템플릿 미변경 |
| T6 | Slack 앱 `SASU`(A0C0JSWAJHK, Aside): OAuth Redirect URLs에 `https://getsasu.com/api/slack/oauth/callback` 추가(옛 것 유지), Event Subscriptions Request URL → `https://getsasu.com/api/slack/events`, Interactivity Request URL → `https://getsasu.com/api/slack/interactions`. Slash command 없음. 재설치·scope·secret 변경 없음 | Events URL `Verified` 후 저장, 이벤트 켜짐 유지. Slack이 띄운 재설치 안내는 기존 scope 관련 안내이며 재설치하지 않음 |
| T7 | `vercel env add NEXT_PUBLIC_APP_URL production --value https://getsasu.com --force`, `vercel env add SASU_LEGACY_HOSTS production --value sasu-alpha.vercel.app` → `vercel env pull`로 두 값 확인 후 파일 삭제 → `vercel redeploy https://sasu-alpha.vercel.app --target production`(Ready 2m, getsasu.com alias) | 옛 주소 `/`·`/login`·`/demo?x=1`·`/d/sales`·`/sitemap.xml` → 308 `https://getsasu.com` 같은 경로·쿼리. 옛 주소 API 비이동: `POST /api/jobs/run` 401, `POST /api/slack/events` 401(서명 없음), `GET /api/companion/inbox`·`departments`·`questions`(잘못된 Bearer) → 앱의 401 JSON `session_invalid`(두 호스트 동일). `//evil.example/x`는 플랫폼이 같은 호스트에서 경로를 정리(308 `sasu-alpha.vercel.app/evil.example/x`) → 외부 이동 없음. 새 주소 sitemap `<loc>`·`og:image`가 `https://getsasu.com` |
| T8 | `setup-worker-cron.ts`는 trigger secret도 로컬 `.env` 값으로 다시 쓰므로 쓰지 않고, 운영 DB에서 `jobs_run_url` 한 행만 `update … where value='https://sasu-alpha.vercel.app/api/jobs/run'`(UPDATE 1, 19:25:21 KST) | 이후 cron 18 succeeded, `net._http_response` 200 17건·status null 1건(이전 기록과 같은 성질), Vercel 로그 `getsasu.com POST /api/jobs/run` |
| T9 | Magic link 템플릿과 Confirm signup 템플릿의 `{{ .ConfirmationURL }}` 각 1곳 → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. 6자리 `{{ .Token }}`·제목·나머지 문구 유지 | `https://getsasu.com/login`에서 tjrwn1003@gmail.com 로그인 메일 1통 요청(19:26:33) → Gmail **받은편지함** 도착(스팸 아님, 19:26:32 KST), 링크 `https://getsasu.com/auth/confirm?token_hash=pkce_…&type=email`(Gmail 래핑 없음). 요청 브라우저(Aside)가 아닌 별도 curl 쿠키 저장소로 열어 302 `/d/<부서>`·`referrer-policy: no-referrer`·세션 쿠키 → 부서 화면 200. 같은 링크 재사용 → `/login?error=auth_callback`. 확인 뒤 `POST /auth/signout` 303, 부서 화면 307 `/login` |
| T10 | 운영 E2E(쓰기 없음) `E2E_BASE_URL=https://getsasu.com SASU_RETRO_ENABLED=true`: guest·demo-reviewer·demo-public-workspace·demo-meeting-recorder·site·security-headers | 26개 중 23 passed, security-headers 3 failed → 운영이 CSP 강제 모드(ADR-069, 10/3)라 `SASU_CSP_ENFORCE=true`로 해당 스펙 재실행 4/4 passed. 덮어쓴 과거 검증 파일 4개는 `git checkout`으로 복원 |

부수 효과(기록): T9 확인 뒤 로그아웃은 웹 `/auth/signout`의 기본 `signOut()`(전체 세션 범위)이라 tjrwn1003의 다른 웹 세션도 종료됐다. 이 계정의 데스크톱 연결(0.1.2)은 이미 해제된 상태였다(`device_links.revoked_at` 있음). 그래서 끊긴 앱은 없다. 웹 사용자는 어차피 새 주소에서 다시 로그인한다.

되돌리기(T5~T9): Supabase 값·템플릿은 백업 JSON으로 PATCH, Slack은 옛 Request URL로 변경, Vercel env 두 개를 원래 값/삭제 후 재배포, `jobs_run_url`을 옛 URL로 update.

## 승인 3: T11 데스크톱 0.1.3 (사용자 "지금 진행 (공개까지)")

원시 receipt·스크린샷: [desktop-0.1.3/](desktop-0.1.3/). ignored `.vercel/desktop-release-013-*`·`desktop013-*` run 디렉터리는 보존한다.

| 단계 | 결과 |
|---|---|
| 소스 | 릴리스 브랜치 `release/desktop-0.1.3-20261005` HEAD `fc70b2b`(버전만 0.1.2→0.1.3, `b0d3ebf` 이후 `desktop/` 변경 0). `git archive`로 `.vercel/desktop-release-013-source`에 `desktop/` 67개 + alias 2개(`lib/contracts.ts`·`lib/adapters/review-audio.ts`) 추출, 줄바꿈 제외 내용 차이 0. `node_modules`는 0.1.2 전용 폴더에서 복사(`npm ls` 오류 0). desktop lint·단위 12 files / 78 passed |
| 도구 | `.vercel/desktop-release-013-tools` = 0.1.2 도구 + `targetVersion 0.1.3`·`productionUrl https://getsasu.com`·감사에 `legacy_url_in_application_code`(옛 주소 문자열이 코드에 있으면 실패) 추가, 세션 1 실행 래퍼 `run-in-session1.ps1`. 모든 `.mjs` `node --check` 통과 |
| 운영 빌드 | run01 실패: alias 파일 누락(`lib/contracts.ts` ENOENT) → 추가 후 run02 exit 0. [build.txt](desktop-0.1.3/build.txt) |
| ASAR 감사 | [audit.json](desktop-0.1.3/audit.json): `productionUrl https://getsasu.com`, `legacyUrlAbsent: true`(main 번들 getsasu 2곳·sasu-alpha 0곳), 공개 키만, 비공개 파일 0, 비밀값 일치 0, 개발 advisory 패키지 미포함, feed `jooho1003/sasu-desktop-releases`, latest.yml size·SHA-512 일치. 설치 파일 114,138,173 bytes, SHA-256 `5186a2b2…d182b`, ASAR SHA-256 `f62d9194…a6ee` |
| 패키지 실행 | 세션 0 DPAPI 제약으로 대화형 예약 작업(세션 1). run01은 예약 작업 `UserId` 매핑 실패(`USERDOMAIN=WORKGROUP`)로 실행 전 중단 → `COMPUTERNAME\USERNAME`으로 고쳐 run02: [packaged-smoke.json](desktop-0.1.3/packaged-smoke.json) packaged·0.1.3·safeStorage·로그인 화면·IPC. [화면](desktop-0.1.3/packaged-login.png) |
| 초기 QA 로그인(설치된 0.1.2) | [initial-qa-login.json](desktop-0.1.3/initial-qa-login.json): Auth Admin 일회용 코드로 QA lead 인증 → 동의 부서 기기 연결 → inbox. Vercel 로그: `sasu-alpha.vercel.app` `GET /api/companion/departments`·`POST /api/companion/link`·`GET /api/companion/inbox` — **옛 주소 API가 유효 Bearer 요청을 리디렉션 없이 처리**(T10 데스크톱 확인 겸함). 메일·질문·모델 호출 0 |
| 공개 게시 | [v0.1.3](https://github.com/jooho1003/sasu-desktop-releases/releases/tag/v0.1.3) 2026-10-05T11:15:42Z, Latest·draft/prerelease 아님, 감사 staging 3개 파일만. 공개 `releases/latest/download/`에서 다시 받은 3개 SHA-256이 staging과 일치. 배포 저장소 README 웹 링크 → `https://getsasu.com`(커밋 `11dfed9`) |
| 실제 업데이트 | run01(게시 47초 뒤)·run02(82초 뒤)는 0.1.2가 `current`로 응답해 `published_update_not_available`([run01](desktop-0.1.3/update-run01-failure.json)·[run02](desktop-0.1.3/update-run02-failure.json)) — 0.1.2 때와 같은 게시 직후 feed 지연. 두 번 모두 시작 세션 복원은 재로그인 없이 성공. run03(약 4분 뒤): [update-complete.json](desktop-0.1.3/update-complete.json) 차등 다운로드 → ready 11:20:02Z → 종료 시 설치 → 0.1.3 세션 복원(`reloginCalls: 0`, `restoredWithoutRelogin: true`) → 최신 feed 확인 → 로그아웃 → 로컬 파일 삭제. 설치된 ASAR SHA-256이 감사본과 일치. Vercel 로그: 업데이트 전 `sasu-alpha.vercel.app` inbox, 업데이트 후 `getsasu.com` link·inbox, 로그아웃 `DELETE /api/companion/link`(getsasu.com) |
| 화면 | [업데이트 준비(0.1.2)](desktop-0.1.3/installed-update-ready.png) · [업데이트 적용(0.1.3)](desktop-0.1.3/installed-update-applied.png) |

0.1.2 기록의 후속 메모(펫 창 `update.get()`의 `window_forbidden` 로그 잡음)는 ADR-088 결정 5(주소·버전만 변경)에 따라 이번에도 고치지 않았다.
