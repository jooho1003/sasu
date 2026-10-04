# CSP 강제 전환 검증 — 2026-10-03

V14(phase 23 · ADR-069)의 강제 전환 전에 사전 검증을 했다. 사용자가 "지금 해줘"라고 요청해, 심사 기간(~10/5)이 끝나기를 기다리지 않고 진행했다. 플랜은 `.claude/plans/csp-enforce-2026-10-03.*`에 있다. 이 문서는 로컬 강제 모드 검증, 운영 Report-Only 관찰, 그리고 사용자 승인 뒤의 **운영 강제 전환(2026-10-03 00:50 KST)** 결과를 담는다.

## 강제하면 깨지던 것: Slack 설치 폼

조직 관리자의 Slack 설치 흐름은 다음과 같다.
1. `<form method="post" action="/api/slack/oauth/start">`로 폼을 보낸다(`components/admin/slack-installation.tsx:28`).
2. 서버가 303으로 `https://slack.com/oauth/v2/authorize`에 보낸다(`lib/slack/installation.ts:37`).

Chromium(Playwright 번들)으로 같은 구조를 재현했다. 재현 페이지에는 같은 `form-action`을 쓰고, 폼 전송 뒤 303으로 다른 출처에 보낸다.

| 정책 | 헤더 | 결과 |
|---|---|---|
| `form-action 'self'` | 강제 | 전송이 차단되고 이동하지 않음. 콘솔: `Sending form data to '…/start' violates … "form-action 'self'". The request has been blocked` |
| `form-action 'self'` | Report-Only | 다른 출처로 이동함. report-only 위반만 남음 |
| `form-action 'self' https://slack.com https://*.slack.com` | 강제 | 실제 `https://slack.com/oauth/v2/authorize`를 거쳐 `slack.com/workspace-signin`까지 이동함. 콘솔 CSP 0 |

**수정 내용**
- `form-action`에 Slack 주소 두 개만 더했다(`lib/security-headers.ts`, `tests/security-headers.test.ts`, ADR-069 보완, ARCHITECTURE).
- POST·origin·단회 state 검사는 그대로 둔다.
- 다른 폼은 `/auth/signout`(같은 출처로 303)뿐이다. 회고 커넥터의 OAuth는 링크 이동이라 `form-action` 대상이 아니다.
- 로컬 QA는 http라 시작 경로가 503을 돌려준다(`app/api/slack/oauth/start/route.ts:12`). 그래서 앱 화면에서는 재현 검사로 대신했다.

## 로컬 강제 모드

**환경**
- worktree 브랜치는 `fix/csp-enforce-20261003`이다.
- 빌드: `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs build --webpack`
  - Turbopack은 worktree의 `node_modules` 정션이 루트 밖을 가리킨다며 거부해서 webpack으로 빌드했다.
  - 운영은 Turbopack 빌드다. 다만 CSP 판단에 걸리는 요소는 두 빌드가 같다: nonce 주입, `strict-dynamic`, 같은 출처의 Worker·AudioWorklet.
- 서버: `SASU_VERIFY_BUILD=1 SASU_CSP_ENFORCE=true node scripts/review-qa.mjs start`(:3011, 로컬 Supabase 54321)
  - 응답에는 `Content-Security-Policy`만 있었고 Report-Only 헤더는 없었다. `form-action`에 Slack 주소가 들어간 것도 확인했다.
- 테스트 실행 셸에도 같은 `SASU_VERIFY_BUILD=1 SASU_CSP_ENFORCE=true`를 넣었다.
- 테스트가 덮어쓴 기존 추적 증거(9/24 `enforce-*`, 영업·기기·녹음 스크린샷 등 22개)는 실행 뒤 git으로 되돌렸다. 이번 결과는 이 폴더에만 둔다.
- Docker 엔진이 10/2 13:55에 멈춰 있었다. 10/3 00:07에 Docker Desktop을 다시 시작했고, 이 검증에 쓰지 않는 전체 로컬 Supabase(`sasu`)는 정지했다.

| 검사 | 결과 | 기록 |
|---|---|---|
| 보안 헤더·nonce·주입 차단·blob Worker/WAV (`csp-test`) | 4/4 | [csp-test](local-enforce/csp-test.txt), [enforce-browser](local-enforce/enforce-browser.json) |
| 게스트 1440·390 완주, 실제 부서 차단, LLM·DB 쓰기 0 (`guest-test`) | 5/5 | [guest-test](local-enforce/guest-test.txt) |
| 원본 재생·Storage·조직 내려받기 스위치 (`access-browser-test`) | 1/1 | [access](local-enforce/access-browser-test.txt) |
| 영업 원문 연결·본인 이력 | 4/4 | [sources](local-enforce/sales-review-sources-test.txt) |
| 영업 문구 대조 | 1/1 | [compare](local-enforce/sales-review-compare-test.txt) |
| 영업 조건 확인 질문 | 2/2 | [checklist](local-enforce/sales-review-checklist-test.txt) |
| 연결된 기기 목록·해제 | 1/1 | [devices](local-enforce/settings-devices-test.txt) |
| **로그인 화면 순회** (`csp-routes-test`, 새 spec `tests/e2e/csp-routes-local.spec.ts`) | 35개 화면을 열었다(팀장 24·팀원 11, 탭 전부 클릭). 위반 0, 콘솔 CSP 0, 페이지 오류 0 | [결과 JSON](routes-enforce.json), [실행](local-enforce/csp-routes.txt) |
| 녹음 제품 흐름(AudioWorklet·Worker·로컬 암호화 저장·업로드·새로고침·확정, 스위치 on/off) | 최종 2/2 | [final](local-enforce/recording-product-final.txt) |

**화면 순회 범위**
- 팀장 화면: 부서 화면 12개, `/consent`, 관리자 5개(`/admin`·members·sources·security·audit), 카드·자료·근거·원문 상세, 예고편 2개
  - 예고편 2개는 QA에서 기능이 꺼져 있어 404였다.
  - 회고 상세와 예고편 상세는 시드가 없어 건너뛰었다.
- 팀원 화면: 부서 화면 11개
- 녹음 화면은 QA DB의 조직 스위치를 잠시 켜고 열었고, 바로 원래 상태(행 없음)로 되돌렸다.

**녹음 spec 경과**
- 첫 실행은 7/9였다.
- 실패 2건은 CSP 때문이 아니었다.
  - spec이 전제로 하는 조직 스위치 행이 QA DB에 없었다(`PGRST116`). 기본 컨테이너도 `supabase_db_sasu`로 잡혀 있었다.
  - 행을 넣은 뒤에는 "이 기기에 저장됨 0:08" 순간을 폴링으로 놓친 타이밍 실패가 한 번 있었다. 이때 화면은 녹음 중 0:19, 저장됨 0:19로 정상이었다.
- 같은 테스트를 다시 돌린 결과는 강제 1/1, Report-Only 1/1, 최종 2/2였다([강제](local-enforce/recording-retry-enforce.txt), [Report-Only](local-enforce/recording-retry-report-only.txt), [첫 실행](local-enforce/recording-product-test.txt)).

## 운영 Report-Only 관찰

운영 `e4fa262`(Turbopack) 대상으로 읽기 전용 검사를 돌렸다. 게스트 화면이라 LLM 호출 0, 쓰기 0이다. 테스트 셸에는 `SASU_CSP_ENFORCE`를 넣지 않았다.

| 검사 | 결과 | 기록 |
|---|---|---|
| 보안 헤더·공개/데모 페이지 위반·nonce 일치·주입·blob | 4/4. 공개 7개 페이지 위반 0 | [playwright](production-report-only/playwright.txt), [report-only-browser](production-report-only/report-only-browser.json) |
| 게스트 390 완주(위반 0)·실제 부서 차단·LLM/DB 증가 0 | 통과 | 같은 기록 |
| 게스트 1440 완주 | 1·2차는 첫 "결정 기록" 화면 제목 5초 제한 초과(로딩 표시 상태)로 실패, 3차 통과(41초) | [재실행 1](production-report-only/guest-1440-rerun.txt), [재실행 2](production-report-only/guest-1440-rerun2.txt) |

1440 실패는 CSP와 관계없다. 같은 흐름(카드 → "결정 기록" 클릭)을 데모 부서 4곳·두 폭에서 따로 재 보니 1.9~2.9초에 제목이 떴고, 콘솔 CSP는 0이었다. 첫 방문 콜드 스타트가 5초 제한을 넘긴 것으로 판단한다.

## 남은 위험

- `report-uri`·`report-to`가 없다. 강제 전환 뒤에도 실제 사용자 화면의 위반을 모을 수 없다. 전환 직후 운영 검사와 즉시 되돌림으로 대응한다.
- 로컬 검증은 webpack 빌드다. 운영 로그인 화면은 로그인이 필요해 관찰하지 않았다.
- 정적 `/_global-error`(치명 오류 화면)는 nonce가 없을 수 있지만 검증하지 않았다.
- 실제 Slack OAuth 전체 흐름은 운영 관리자가 다시 연결할 때 확인해야 한다.
- 실제 기기 녹음(V01~V06)은 여전히 사람이 확인할 일이다. 운영의 조직 녹음 스위치는 계속 꺼져 있다.

## 운영 강제 전환 (2026-10-03, 사용자 승인)

사용자가 "지금 병합하고 강제 전환"을 골랐다.

| 순서 | 실행 | 결과 |
|---|---|---|
| 1 | PR #31 병합 `593b9b3` | 운영 `dpl_12RWS9QPy5FtiKySYYQmJdnh9FH7`. 아직 Report-Only이고 수정된 `form-action`이 들어간 상태. **되돌림 대상** |
| 2 | Vercel CLI 59.25.4 `env add SASU_CSP_ENFORCE production --value true --no-sensitive` | Production env 추가 |
| 3 | `vercel redeploy <1의 배포> --target production` | 운영 `dpl_2BC6owyD6srKmCv8Ad5nWxiDAwmr` Ready(2분), `sasu-alpha.vercel.app` 연결 |

**운영 확인** (강제 모드, [헤더·HTTP·워커](production-enforce/http-and-headers.txt))

| 검사 | 결과 | 기록 |
|---|---|---|
| 응답 헤더 | `/`·`/privacy`·`/demo`·`/login` 모두 `Content-Security-Policy`만 있음(Report-Only 0). `form-action 'self' https://slack.com https://*.slack.com` | [http-and-headers](production-enforce/http-and-headers.txt) |
| 공개 페이지 200·인증 없는 요청 차단 | 13/13 | 같은 기록 |
| 보안 헤더·공개/데모 페이지 위반·nonce·주입 차단·blob | 4/4. 주입한 nonce 없는 script는 강제 모드에서 차단됐다 | [playwright](production-enforce/playwright.txt), [enforce-browser](production-enforce/enforce-browser.json) |
| 게스트 1440·390 완주(위반 0)·실제 부서 차단·LLM/DB 증가 0 | 5/5 | 같은 기록 |
| 심사위원 데모 녹음·재생·내려받기, 마이크 거절 후 합성 회의 | 2/2 | [demo-playwright](production-enforce/demo-playwright.txt) |
| 데모 기능 화면 전체·390px·브라우저 안 체험 | 3/3 | 같은 기록 |
| 데모 기능 지도 개수 | 기대 12, 실제 13으로 실패. 9/20 기록과 같은 환경 차이다(운영은 회고가 켜져 있어 카드가 1개 더 많다). CSP와 무관 | 같은 기록 |
| 워커 | 배포 뒤 pg_cron → `/api/jobs/run` 매분 HTTP 200 | [http-and-headers](production-enforce/http-and-headers.txt) |

데모 spec은 로컬 전용 설정(:3200 고정)이라, 운영 주소를 가리키는 임시 설정으로 실행했다. 쓰기를 시도하는 "심사 계정 쓰기 거부" 테스트는 운영에 쓰기 요청을 보내므로 제외했다.

**되돌리는 방법**
- 직전 Report-Only 배포 `dpl_12RWS9QPy5FtiKySYYQmJdnh9FH7`로 즉시 되돌린다(Vercel Instant Rollback).
- 또는 Production env `SASU_CSP_ENFORCE`를 지우고 재배포한다.
- 운영 env를 그대로 두면 이후 main 배포도 강제 모드를 유지한다.
