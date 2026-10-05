# app-domain-migration — Design

2026-10-05 · bkit PDCA · phase 49 · 선택안 **C 실용형**(사용자 선택). 결정 본문은 [ADR-088](../../ADR.md), 범위는 [PRD](../../PRD.md) §8 "운영 주소 이전 범위", 불변식은 [ARCHITECTURE](../../ARCHITECTURE.md) §6-13(51~53). 계획: [plan](../../01-plan/features/app-domain-migration.plan.md).

## Context Anchor

| Key | Value |
|---|---|
| WHY | 발신·링크 도메인 불일치(스팸 원인 후보)와 주소 계산 4곳의 불일치 |
| WHO | 웹 사용자(파일럿 lead·구성원·조직 관리자), Slack 사용자, 데스크톱 0.1.x 사용자, 심사위원 |
| RISK | 옛 주소 API를 리디렉션하면 데스크톱 Bearer가 빠져 세션 삭제 · 대시보드 설정 순서 오류로 로그인/Slack 중단 |
| SUCCESS | SC1~6: 새 주소 완주 · 옛 주소 화면 308/API 200 · 링크 전부 새 주소 · 메일 링크 로그인 · 0.1.3 업데이트 무재로그인 |
| SCOPE | PRD §4·§8(운영 주소 이전)·§10 #12 / ADR-088 / ARCHITECTURE §6-13 불변식 51~53 |

## 1. Overview

코드는 세 가지만 바꾼다: 절대 주소 계산 통일, 옛 호스트 화면 이동, 메일 링크 확인 경로. 새 테이블·migration·job·LLM·UI 문구는 없다. 운영 전환(§11.4)은 코드 병합 뒤 root가 단계마다 승인받아 실행한다. 코드 병합만으로는 운영 동작이 바뀌지 않아야 한다(`SASU_LEGACY_HOSTS` 미설정 = 이동 없음, `/auth/confirm`은 템플릿을 바꾸기 전까지 호출되지 않음).

## 2. Architecture Options

| 안 | 내용 | 복잡도 | 유지보수 | 위험 | 판정 |
|---|---|---|---|---|---|
| A 최소 | `vercel.json` host 조건 redirect + callback 로직 복사 | 낮음 | 낮음(판정 2곳) | 병합 = 즉시 활성화, 단위 테스트 불가, 불변식 53 위반 | 기각 |
| B 분리 | `lib/canonical-origin.ts`로 `metadataBase` 이동 + 로그인 모듈 분리 | 높음(import 20여 곳) | 높음 | 변경 범위 과다 | 기각 |
| **C 실용** | `lib/site.ts`에 `legacyHostRedirect()` 추가 → `proxy.ts`가 호출, 환경변수로 켜고 끔. 로그인 후 처리는 `lib/auth-login.ts` 하나 | 중간 | 높음 | 낮음 | **선택** |

흐름:

```
요청 ─▶ proxy.ts ─▶ legacyHostRedirect(host, path, search)
                     ├─ 옛 호스트 && 경로가 /api 밖 ─▶ 308 https://getsasu.com{path}{search}
                     └─ 그 밖 ─▶ 기존 CSP·세션 처리 그대로
메일 링크 ─▶ GET /auth/confirm?token_hash&type ─▶ parseEmailConfirm ─▶ verifyOtp ─▶ postLoginPath ─▶ 302
메일 링크(이미 보낸 것) ─▶ GET /auth/callback?code ─▶ exchangeCodeForSession ─▶ postLoginPath ─▶ 302
서버 링크 ─▶ metadataBase()  (Slack 카드·원장·동의 DM·답변·OAuth·Origin·메타데이터)
```

## 3. Data Model

변경 없음. 운영 DB 값 `public.worker_config.jobs_run_url` 한 행만 전환 단계에서 `scripts/setup-worker-cron.ts https://getsasu.com`으로 갱신한다(migration 아님).

## 4. API Specification

| ID | 경로 | 변경 | 계약 |
|---|---|---|---|
| E-C1 | `GET /auth/confirm` | 신규 | 쿼리 `token_hash`(`^[A-Za-z0-9_-]{1,512}$`), `type`(`email`·`magiclink`). 유효하면 `supabase.auth.verifyOtp({ type, token_hash })` → 성공 시 `postLoginPath()` 결과로 302, `LOGIN_NEXT_COOKIE` 삭제. 형식 오류·검증 실패·사용자 없음은 `/login?error=auth_callback`, 멤버십 조회 오류는 `/login?error=membership_lookup`. 모든 응답 `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`. 쿼리 `next`는 읽지 않는다(로그인 후 경로는 쿠키만). |
| E-C2 | `GET /auth/callback` | 리팩터 | 기존 계약 그대로(code 교환 → 같은 `postLoginPath()`). |
| E-C3 | 모든 비 API 경로 (옛 호스트) | 신규 동작 | `SASU_LEGACY_HOSTS`의 호스트로 오면 308 `Location: <canonical origin><path><search>`. 메서드 무관(308이 메서드를 보존). |
| E-C4 | `/api/*` (옛 호스트) | 변경 없음 | 리디렉션하지 않는다. |

## 5. UI/UX Checklist

화면·문구 변경 없음. 확인할 화면: `/login` 메일 요청 뒤 "메일함을 확인해주세요" 그대로, 링크 클릭 → 첫 부서/관리자/`/no-membership`, 실패 → `/login?error=auth_callback`의 기존 오류 문구.

## 6. Error Handling

| 상황 | 결과 |
|---|---|
| `type` 누락·허용 밖, `token_hash` 누락·형식 오류 | `verifyOtp` 호출 없이 `/login?error=auth_callback` |
| 만료·재사용 토큰 (`verifyOtp` 오류) | `/login?error=auth_callback` |
| `getUser` 실패 | `/login?error=auth_callback` |
| 멤버십 조회 실패 | `/login?error=membership_lookup` |
| `SASU_LEGACY_HOSTS`에 정식 호스트가 들어감 | 이동 안 함(루프 방지) |
| 정식 주소가 http(로컬·미설정) | 이동 안 함 |

## 7. Security Checklist

- 오픈 리디렉션 없음: 이동 목적지는 항상 `metadataBase()` origin + 요청 경로, 로그인 후 경로는 기존 `sanitizeInternalPath`·`loginNextCookieValue`만 통과.
- `token_hash`는 로그·오류 메시지·Referer로 나가지 않는다(불변식 9·53).
- `/api/*` 비이동으로 Bearer 헤더 손실 없음(불변식 52). Slack 서명 검증·Origin 검사 로직은 그대로.
- 세션 쿠키 옵션·도메인 변경 없음(호스트 전용 유지).
- CSP `'self'` 기준이라 호스트 변경에 무관. HSTS `includeSubDomains` 유지, preload 안 함.
- 남는 위험(ADR-088 경계): token_hash 링크의 로그인 CSRF(초대제 조직·화면에 계정 표시로 수용), Vercel 요청 로그의 일회용 토큰. `/auth/confirm`의 `no-referrer`는 `proxy.ts` `protect()`가 붙인다(라우트 헤더는 next.config 공통 헤더에 밀린다).

## 8. Test Plan

| ID | 층 | 시나리오 | 파일 |
|---|---|---|---|
| U1 | unit | `legacyHostRedirect`: 빈/미설정 env → null · 목록 호스트 + `/` → `https://getsasu.com/` · `/demo?x=1` 경로·쿼리 보존 · `/api`·`/api/companion/ask` → null · `/apix` → 이동 · 대문자·포트 포함 호스트 정규화 · 쉼표 여러 개·공백·잘못된 항목 무시 · 정식 호스트와 같음 → null · 정식 주소 http → null | `tests/site.test.ts` |
| U2 | unit | `proxy`: 옛 호스트 GET `/login` → 308 Location · 옛 호스트 POST `/api/companion/ask` → 이동 없음 · 다른 호스트 → 기존 동작 · 이동 응답에도 `no-store` | `tests/proxy.test.ts` |
| U3 | unit | `parseEmailConfirm`: 유효 email/magiclink · type 누락/`recovery`/`signup` 거부 · token_hash 누락/특수문자/513자 거부 | `tests/auth-login.test.ts` (신규, 테스트 먼저) |
| U4 | unit | `postLoginPath`(가짜 supabase): 첫 부서 · 안전한 next 쿠키 · 깨진 쿠키 무시 · 멤버십 오류 · 사용자 오류 · 관리자 읽기 켬/끔 | `tests/auth-login.test.ts` |
| U5 | route | `/auth/confirm`: 형식 오류는 verifyOtp 미호출 · 검증 실패 · 성공 302+쿠키 삭제 · `Referrer-Policy: no-referrer` · `/auth/callback` 회귀(code 없음/교환 실패/성공) | `tests/auth-confirm-route.test.ts` (신규) |
| U6 | unit | Slack 카드·원장 링크, interactions 원장 링크, 동의 DM 링크가 `NEXT_PUBLIC_APP_URL` 기준이고 `VERCEL_URL`·`APP_URL`을 무시 | 기존 send-slack·interactions·consent 테스트 확장 |
| E1 | e2e (로컬 Supabase) | `auth.admin.generateLink({ type: "magiclink" })`의 `hashed_token`으로 새 브라우저 컨텍스트에서 `/auth/confirm?token_hash=…&type=email` → 부서 화면 도착. 같은 토큰 재사용 → `/login?error=auth_callback` | `tests/e2e/auth-confirm.spec.ts` (신규, 서비스 키는 로컬 테스트 전용) |
| R1 | 회귀 | lint · build · `npm run test` 전체 · 기존 E2E `guest.spec.ts`·`site.spec.ts`·`security-headers.spec.ts` | — |
| P1 | 운영 | 전환 단계별 확인(§11.4 확인값) | `docs/verification/49-app-domain-migration/` |

## 9. Clean Architecture

- `lib/site.ts`: 순수 함수(`metadataBase`, `legacyHostRedirect`). Next·Supabase import 없음.
- `lib/auth-login.ts`: `parseEmailConfirm`(순수), `postLoginPath(supabase, encodedNext)`(Supabase 클라이언트를 인자로 받음, 세션 클라이언트만 — service role 금지). `NextResponse`를 import하지 않는다.
- 라우트(`app/auth/*/route.ts`)·`proxy.ts`: 배선만. 판정 로직을 두지 않는다.

## 10. Coding Convention Reference

- 환경변수: `NEXT_PUBLIC_APP_URL`(기존, 정식 주소), `SASU_LEGACY_HOSTS`(신규, 서버 전용, 쉼표 구분 호스트명). `.env.example`에 둘 다 설명과 함께 추가.
- 주소 문자열 연결 대신 `new URL(path, metadataBase())` 또는 `metadataBase().origin`을 쓴다.
- 코드 주석은 주변 밀도에 맞추고 `// Design Ref:` 주석은 핵심 판정 함수 위 한 줄만.

## 11. Implementation Guide and Session Guide

### 11.1 비교 목록 (`/pdca analyze` 대상)

| 종류 | 항목 |
|---|---|
| 모듈 | `lib/site.ts` `legacyHostRedirect` · `lib/auth-login.ts` `parseEmailConfirm`·`postLoginPath` |
| 엔드포인트 | E-C1 `/auth/confirm` · E-C2 `/auth/callback` · E-C3 옛 호스트 308 · E-C4 `/api/*` 비이동 |
| 배선 | `proxy.ts` 이동 호출 · `send-slack.ts`·`interactions/route.ts`·`settings/consent/route.ts`의 `appBaseUrl()` 삭제 |
| 테스트 | U1~U6 · E1 · R1 |
| 설정·문서 | `.env.example` 2개 · `docs/setup-guide.md` 전환·되돌리기 절 · 검증 기록 |
| 테이블·job | 없음 |

### 11.2 Step (phase `49-app-domain-migration`)

| step | name | 범위 | 테스트 |
|---|---|---|---|
| 0 | url-resolver | FR1: 로컬 `appBaseUrl()` 3개 → `metadataBase()` | U6 |
| 1 | legacy-redirect | FR2: `legacyHostRedirect` + `proxy.ts` | U1·U2 |
| 2 | auth-confirm | FR3·FR4: `lib/auth-login.ts` + `/auth/confirm` + callback 리팩터 | U3·U4·U5·E1 |
| 3 | verification | FR5: `.env.example`·setup-guide, R1 전체 회귀, 검증 기록 | R1 |

### 11.3 Session Guide

step마다 독립 세션. 0과 1은 서로 독립, 2는 독립, 3은 0~2 뒤. `lib/` 신규·변경은 테스트 먼저(red 확인 기록).

### 11.4 운영 전환 순서 (root, 단계마다 사용자 승인)

| # | 작업 | 확인값 | 되돌리기 |
|---|---|---|---|
| T1 | PR 병합 → Vercel 자동 배포 | `/`·`/login` 200, 옛 주소 이동 없음(env 미설정) | revert PR |
| T2 | Vercel 프로젝트에 `getsasu.com` 추가, `www.getsasu.com` → `getsasu.com` 308 | Vercel이 안내하는 DNS 값 기록 | 도메인 제거 |
| T3 | Cloudflare: Single Redirect 규칙·더미 A(`@`·`www`) 삭제 → Vercel 값으로 `@`·`www` DNS only | `dig`, 메일 레코드 그대로 | 이전 레코드·규칙 복원(기록) |
| T4 | 새 주소 확인 | TLS 유효, `https://getsasu.com/` 200, `www` 308 | — |
| T5 | Supabase: Site URL `https://getsasu.com`, Redirect URLs에 `https://getsasu.com/**` 추가(옛 항목 유지) | 대시보드 재조회 | 값 복원 |
| T6 | Slack: OAuth Redirect URL 추가(옛 것 유지), Events·Interactivity URL을 새 주소로. 회고 커넥터 provider가 운영 env에 있으면 각 콘솔에 `https://getsasu.com/api/retro/connect/<provider>/callback` 추가 | Events URL Verified | 옛 URL 복원 |
| T7 | Vercel Production env `NEXT_PUBLIC_APP_URL=https://getsasu.com`, `SASU_LEGACY_HOSTS=sasu-alpha.vercel.app` → 재배포 | 옛 주소 `/`→308, `/api/jobs/run` 401/200(비이동), 메타데이터 새 주소 | env 복원·재배포 |
| T8 | `npx tsx scripts/setup-worker-cron.ts https://getsasu.com` | 10분 cron 성공·HTTP 200 | 옛 URL로 재실행 |
| T9 | Supabase 템플릿(Magic link or OTP·Confirm signup) 링크 → `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`, `{{ .Token }}` 유지 | 실제 메일 링크 도메인·다른 브라우저 로그인 | 템플릿 복원 |
| T10 | 운영 E2E(새 주소, 쓰기 없음) + 옛 주소 이동/API, 데스크톱 0.1.2 Bearer 요청 정상 | 실행 로그 | — |
| T11 | 데스크톱 0.1.3: `SASU_APP_URL=https://getsasu.com`·버전 → 빌드·감사(새 주소 포함·옛 주소 미포함) → 공개 → 0.1.2 업데이트 무재로그인 | 감사 JSON·업데이트 기록 | 릴리스 draft 되돌림 |
| T12 | 문서: setup-guide·submission-checklist 주소 갱신, 검증 기록, PDCA report | — | — |
