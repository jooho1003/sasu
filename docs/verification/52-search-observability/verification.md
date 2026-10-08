# 공개 검색·GA4·Sentry 검증

2026-10-07 · phase 52 · PRD §3-9·§8 / ADR-091.

현재 상태(2026-10-09): 구현·계정 연결·build/단위/E2E 검증 완료. 10/7 CLI 운영 배포는 이후 main 자동 배포가 덮어써 **현재 운영에 없다**(아래 「2026-10-09 운영 상태 재확인」). 2026-10-09 PR #49 병합으로 운영에 재반영했다(아래 「2026-10-09 운영 재반영」). GA4 실시간 콘솔·운영 Sentry 이벤트 UI와 Graft/Archify 결과는 남아 있다.

## 실행 기록

| 확인 | 실제 실행·결과 | 근거 |
|---|---|---|
| TDD | 신규 검색/telemetry 모듈이 없는 red 확인 후 구현. 빈 stack frames 전송 실패를 재현하는 테스트 red 후 빈 stacktrace 생략으로 수정 | tests/search-observability.test.ts, related-tests-final.txt |
| 전체 단위 테스트 | `npx vitest run --config scripts/search-observability.vitest.mjs --reporter=dot --testTimeout 10000`: 192 files / 1916 tests pass, exit 0 | unit-tests-latest.txt |
| 관련 단위 테스트 | 정책·CSP·no-store 설정 API·private router 전환: 4 files / 10 tests pass | related-tests-final.txt |
| lint | `npm run lint`: exit 0, ESLint errors 0, 문구 blocking 0. 기존 경고 3+86 유지 | lint-final.txt |
| 첫 build | `SASU_VERIFY_BUILD=1 npm run build`: exit 0. 뒤이은 sanitizer 변경과 canonical 빌드 환경을 최종 build에서 재검증 중 | build.txt, build-final.txt |
| 최종 build | `SASU_VERIFY_BUILD=1 NEXT_PUBLIC_APP_URL=https://getsasu.com npm run build -- --webpack`: exit 0, compile 73s·TypeScript 57s·51 static pages. 최신 bundle에서 gtag Arguments queue 확인 | build-verified.txt |
| 공개 E2E | metadata·FAQ/JSON-LD·HTTP robots/sitemap/llms·private noindex, GA4 동의/거절/철회/저장 오류/로그인 이동: 4 pass, exit 0 | e2e-final.txt, e2e-public-results.json, public-search.png |
| 실제 SDK E2E | 실제 Google 태그의 clean page_view/CTA와 private 수집 중단, 실제 Sentry browser envelope에서 URL/원문 제거 및 infer_ip=never: 2 pass, exit 0 | e2e-live-final.txt, e2e-live-results.json |
| 마지막 GA 큐 lint | `npx eslint components/public-analytics.tsx tests/e2e/search-observability.spec.ts`: exit 0 | lint-ga-command.txt |

기본 Vitest config의 Windows 전체 workspace 탐색이 오래 걸려 동일 테스트 include/exclude와 @ alias를 가진 검증 전용 config를 사용했다. 이전 전체 검사에서 async Home 테스트를 수정하고, 병렬 작업 중 기존 녹음 테스트의 5초 timeout이 발생해 단독 재검증한 뒤 전체 timeout을 10초로 높였다. 최신 전체 검사는 모두 통과했다.

전체 lint 및 최종 GA bootstrap의 focused lint는 통과했다. 읽기 전용 demo canonical E2E assertion을 더한 뒤 시작한 반복 focused lint는 약 5분간 출력 없이 정체되어 소유 프로세스만 중단했다(lint-ga-command-final.txt, exit -1). 이 반복은 통과로 세지 않는다. 추가된 것은 테스트 assertion이며 이후 공개 E2E 4개는 다시 통과했다.

최종 Turbopack 재빌드는 compile 단계에서 약 20분간 완료되지 않아 작업 소유 PID·명령 경로를 검증한 뒤 중단했다(build-final.txt). 공식 CLI의 --webpack으로 전체 build를 완료했다(build-webpack-final.txt). 컴파일 중 보완한 Google 태그 Arguments queue가 이전 번들에는 없음을 확인해 한 번 더 빌드했으며, 최신 성공 근거는 build-verified.txt만 사용한다. 기본 npm build 명령과 Next 설정은 바꾸지 않았다.

## 실제 GA4 생성

기존 Default Account for Firebase(262566031)에 `사수 (SASU) — getsasu.com` 속성을 생성했다. 한국 시간대·KRW. 웹 스트림 `사수 공개 웹`, URL `https://getsasu.com`, stream ID `16054320403`, 측정 ID `G-HLFXFGBGPD`. 생성 완료와 향상된 측정 꺼짐 저장을 브라우저 UI로 확인했다. 실제 Google SDK payload 검증은 E2E에서 통과했다. 쿼리·해시 canary 없음, 고정 공식 page_location, 공개 CTA 이름만, 비공개 이동 후 수집 중단을 확인했다. collect 요청은 intercept+204로 처리했으므로 실제 GA4 collector/실시간 수신을 증명하지 않는다. 신규 속성을 재생성하지 않는다.

## 실제 Sentry 생성·오류 수신

Vercel Marketplace는 사용자의 Accept & Install 뒤 `Missing billingPlanId for installation-only plan integration` 오류가 났다. 기존 로그인 Sentry 조직 `998dc2461b62`에 `sasu`(4512210181423184) 프로젝트를 직접 생성했다. 새로운 계정·약관 동의·유료 플랜 선택은 수행하지 않았다. 조직의 독일 ingest를 사용한다.

`npx tsx scripts/verify-sentry.ts`는 실제 업무 데이터 없이 합성 Error와 Next onRequestError만 보내며 ID·flush 여부만 출력한다. 마지막 실행은 event ID `65588f84d1224d36b94a7007242f10a4`, flushed true, exit 0(sentry-transport-geo-final.txt). 실제 [SASU-1](https://998dc2461b62.sentry.io/issues/151786748/?project=4512210181423184) 수신 화면에서 총 7개 합성 이벤트와 마지막 hook event `b106abc273b44b4aae981ae6fc9f61ce`를 확인했다.

- 마지막 메시지 `application_error`, URL/transaction 없음, Users 0, Replays 0.
- 초기 테스트의 빈 frames processing error는 sanitizer가 빈 stacktrace를 생략하도록 수정했다. 이후 처리 오류 없음.
- 초기 수신에서 SDK가 전송하지 않은 IP 기반 지역 정보가 collector에서 추가된 것을 발견했다. 실제 위치 값은 이 문서에 옮기지 않는다.
- IP 저장 방지·SDK infer_ip=never만으로 부족했다. Advanced Data Scrubbing에 Remove Anything `user`와 `user.geo.*`를 저장하고 다시 전송했다.
- 마지막 hook event의 Contexts에는 Trace Details만 있고 User/Geography가 없다. 원문·synthetic token/query/header가 보이지 않는다. 수집 제거 규칙은 신규 이벤트에 적용된다.
- JavaScript source fetching 꺼짐, Allowed Domains는 공식 두 도메인, TLS 검증 켜짐. source map/token 업로드 없음.

## 운영 설정과 남은 게이트

Vercel Production에 GA4_MEASUREMENT_ID, SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT 4개 추가 후 목록을 재조회했다. 비밀 auth token은 만들지 않았다. 아래 승인된 운영 배포에 적용됐다. Preview/일반 로컬은 무수집, 테스트는 명시적 SASU_TELEMETRY_TEST_ENABLED를 사용한다.

[코드 관계 기록](code-context.md)은 실제 imports를 읽어 작성했다. Graft 구현 전후 그래프·Archify 실행 결과는 없다. 해당 개발 절차 게이트를 완료로 표시하지 않는다. AGENTS.md와 CLAUDE.md는 같은 공개 식별자 전달 예외를 유지한다. 기존 lib/search.ts 변경 없음.

배포 대상을 project inspect --non-interactive로 확인했다: wadelee1005-3954s-projects/sasu, prj_W5sgVwi1zbEXKUg8ue4ZcS7u6sxy, Node24.x(vercel-project.txt). 현재 getsasu.com은 Ready production dpl_4z2gfxf8hJLQqPzq8WmS6RZvQDSk, sasu-607si33xy-wadelee1005-3954s-projects.vercel.app을 가리킨다(vercel-production-before.txt). 이 ID를 되돌릴 기준으로 보관한다. 실운영 요청 로그는 읽지 않았다.

.vercelignore에 로컬 .next-verify 출력·검증용 Playwright/Vitest config·합성 Sentry CLI를 추가해 배포 업로드에서 제외했다. 환경 파일·문서·tests 제외는 기존 설정을 유지한다. Next 생성 파일 next-env.d.ts는 기본 .next 경로로 복원했다. git diff --check 통과, AGENTS/CLAUDE 동일, 기록 파일에서 민감 토큰 문자열 matches 0을 확인했다.

demo canonical은 기존 자동 로그인을 피하는 `/demo?demo=metadata` 요청으로 읽기 전용 확인했다. 기본 `/demo`의 기존 자동 로그인 동작을 변경하지 않았다.

[PDCA 최종 분석](../../03-analysis/search-observability.analysis.md) · [보고](../../04-report/features/search-observability.report.md). 검색 엔진 색인/AI 인용 순위는 검증 대상으로 보장하지 않는다. [배포 승인 근거](../../../AGENTS.md)의 운영 반영 규칙을 따른다.

## 승인된 운영 배포 및 실제 수집 검증

사용자가 “운영 배포 승인”으로 검증한 변경과 Graft/Archify 결과 누락을 확인하고 운영 반영을 승인했다. 2026-10-07 03:06 KST 기준 getsasu.com은 Ready production `dpl_4vZqM84jMxEyu14dVfXiPPMbwoGs`를 가리킨다. 후보 URL은 `https://sasu-d04yk8wht-wadelee1005-3954s-projects.vercel.app`이다. `--prod --skip-domain` 후보 검증 후 `vercel promote` 성공, 공식 도메인 inspect로 동일 ID 재확인했다. 근거: vercel-promote.txt, vercel-production-after.txt.

최초 업로드 dry-run은 데스크톱 설치 파일·개발 도구 자료까지 약 553MB였다. 웹의 desktop import 0건을 확인하고 로컬 도구·desktop·검증 출력 제외를 보완했다. 최종 업로드 목록 546개·7,552,374 bytes, 금지된 로컬 자료 파일 0건. test-results는 anchored directory 패턴만으로 남아 unanchored 패턴을 추가했다. 후보 빌드는 동시 빌드 대기 후 Next.js 16.3.4 기본 Turbopack 명령으로 성공했다(빌드 1m37s). 근거: vercel-candidate-build.txt, vercel-candidate-inspect.txt. 다른 작업의 배포를 중단하지 않았다.

후보의 robots·production telemetry config·홈 FAQ/GA4 ID·로그인 200/noindex를 Vercel curl로 검사했다. 최초 curl의 --non-interactive 위치는 curl 옵션으로 전달되어 실패해 문서화된 형식으로 수정했다. 홈 canonical 비교는 Next가 루트 끝 슬래시를 생략해 최초 assertion이 실패했고, 의미가 같은 공식 주소의 optional slash를 허용하도록 검증만 수정했다. 실제 제품 canonical 변경 없음.

`node scripts/verify-search-observability.mjs`는 운영 공식 도메인에서 격리된 브라우저로 합성 canary를 검사하며 실제 업무 자료·로그인 메일을 보내지 않는다. 기록 operating-check.txt 및 operating-results.json: **exit 0, passed**.

운영 검사 스크립트의 node --check 및 focused ESLint도 exit 0(lint-operating-script.txt)이다. 실제 실행한 스크립트를 scripts/에 보관하고 배포 업로드에서는 제외한다. 최종 git diff --check exit 0, AGENTS/CLAUDE 동일, 검증 기록의 비밀 패턴 matches 0, lib/search.ts·next-env.d.ts diff 없음.

| 운영 검사 | 결과 |
|---|---|
| 검색 파일 | robots·sitemap·llms 모두 200, 공식 URL 포함 |
| 공개 페이지 | 공식 canonical·FAQ JSON-LD 5개, 화면 정상(operating-home.png) |
| 기존 체험·로그인 | 읽기 전용 /demo?demo=metadata 200/canonical, /login 200/noindex |
| 운영 설정 API | production·올바른 공개 Sentry DSN·no-store |
| GA4 | 동의 전 요청 0, 허용 후 실제 collector 204, G-HLFXFGBGPD 및 clean page_view 확인 |
| 비공개 이동 | 로그인 이동 후 Google 태그 없음·추가 GA4 collect 없음 |
| Sentry | 원문·query·로그인 URL 없는 browser envelope, infer_ip=never, 실제 collector 200 |

Sentry 운영 browser event ID는 `4c5f95b792df493a85f2d864dfe9fa99`다. 이번 collector 요청은 route.fulfill로 가로채지 않고 privacy assertion 뒤 route.continue로 실제 전송했다. HTTP 수신은 서비스 대시보드에서 가공된 이벤트를 확인한 것과 구분한다.

남은 확인: GA4 실시간 콘솔 및 이 운영 Sentry 이벤트의 수신 후 UI. Aside 제어 포트 45103 미연결, CUA 기존 GA4/Sentry 탭은 focus 명령 timeout, 새 GA4 탭은 ERR_FAILED였다. 로그인·보안 우회를 하지 않았다. 이전 합성 서버 이벤트의 수신 후 User/Geography 제거 확인은 위 기록대로 유효하다. Graft/Archify 도구 실행 결과는 계속 미확보이므로 phase 절차를 완료로 표시하지 않는다.

## 2026-10-09 운영 상태 재확인

10/7 03:06 promote한 `dpl_4vZqM84jMxEyu14dVfXiPPMbwoGs`(sasu-d04yk8wht)는 미커밋 작업 트리에서 CLI로 만든 배포였다. 같은 날 PR #46(03:38)·#47(04:21) 병합으로 main 자동 운영 배포가 이어졌고, 그 코드에는 phase 52가 없었다. `npx vercel ls --environment production` 순서: d04yk8wht → qjao0lo46 → e1puhququ → 9bn4ov38u. `npx vercel inspect getsasu.com` 결과 현재 운영은 `dpl_B3JpWE6HbNS12qPhmkdeRmnXxL7b`(2026-10-07 04:22 KST)다.

2026-10-09 공개 요청 확인: `/llms.txt` 404, `/api/telemetry/config` 404, `/` 응답 CSP에 GA4·Sentry 수집 주소 없음. 위 「승인된 운영 배포 및 실제 수집 검증」의 운영 확인은 10/7 03:06~03:38 사이 상태의 기록이다.

조치: 작업을 `feat/search-observability-20261009` 브랜치에 커밋하고 최신 origin/main(phase 53 포함) 위로 리베이스했다. ADR.md·PRD.md의 덧붙임 충돌은 양쪽을 모두 남겨 번호 순서로 정리했다. 실운영 수집 확인용 Playwright 설정은 운영 GA4 ID·Sentry DSN을 하드코딩하지 않고 환경 변수에서 읽게 바꿨고, `e2e-live-results.json`의 DSN 키 부분은 가렸다. 재반영은 PR main 병합(자동 배포)으로 한다. CLI promote는 다음 main 배포가 다시 덮어쓰므로 쓰지 않는다.

## 2026-10-09 운영 재반영

로컬 검증(리베이스 뒤): `npm run lint` exit 0, `npx vitest run` 194 files / 1,926 passed, `npx next build --webpack` exit 0(597초). 로컬 Turbopack 빌드는 이번에도 컴파일 단계에서 멈춰 중단했다. Vercel preview 클라우드 빌드 success.

PR #49를 2026-10-09 00:55 main에 병합했고, 자동 운영 배포 `dpl_F26xYmLTEQ3QCHzz6jfA8Tv9R7HY`(00:55:37 생성)가 getsasu.com에 연결된 것을 `npx vercel inspect getsasu.com`으로 확인했다. 되돌림 기준은 직전 운영 `dpl_B3JpWE6HbNS12qPhmkdeRmnXxL7b`.

운영 확인: `/llms.txt` 200, `/api/telemetry/config` 200(`environment: production`), `/` CSP에 googletagmanager.com·google-analytics.com·sentry.io. `node scripts/verify-search-observability.mjs` exit 0 — robots/sitemap/llms, production telemetry config, 읽기 전용 demo·login noindex, 동의 뒤 GA4 collector 204, 비공개 GA4 중단, 정제된 Sentry browser collector 200(event `178ab23b67fc458bbd19cfb8e0c17adf`). 결과는 operating-results.json(2026-10-08T16:02:29Z)에 덮어썼다.

이어서 PR #48(phase 23 실측·전사 창 61초 보정)을 병합했다. 자동 운영 배포 `dpl_CHupHDiGPJs5GxosqKA9yakmFzeZ`(01:02:48) 뒤 `/`·`/llms.txt`·`/api/telemetry/config` 200. GA4 콘솔 실시간 화면·Sentry 이벤트 UI, Graft/Archify 결과는 여전히 남아 phase 상태는 in_progress다.
