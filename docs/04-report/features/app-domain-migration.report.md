# app-domain-migration Completion Report

> Status: Complete — 구현·검증·운영 전환·데스크톱 0.1.3 공개까지 완료.
> Project: 사수(SASU) · phase 49
> Author: root(Claude Code) · step 0~3 서브에이전트 · 독립 분석 gap-detector
> Completion Date: 2026-10-05 · PDCA Cycle: phase 49

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | app-domain-migration (운영 웹 `sasu-alpha.vercel.app` → `https://getsasu.com`) |
| Start Date | 2026-10-05 |
| End Date | 2026-10-05 |
| Duration | 1일 (plan → design → step 0~3 → analyze 99.5% → 운영 전환 T1~T12 → report) |

### 1.2 Results Summary

설계 §11.1 비교 목록 23/23, 계약 4/4, 분석 일치율 99.5%(Critical·Important 0, Minor 4건 보완·1건 기록). unit 186 files / 1,880 passed, 로컬 E2E 14 passed, 운영 E2E 26 passed(CSP 강제 모드 재실행 포함). 운영 전환 T1~T12를 세 번의 사용자 승인(T1~T4 · T5~T10 · T11)으로 실행했고 단계마다 확인값을 기록했다([전환 기록](../../verification/49-app-domain-migration/production-cutover.md)).

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 운영 웹이 공용 vercel.app 주소라 `sasu@getsasu.com` 메일의 링크 도메인이 달랐고(스팸 분류 원인 후보), 서버 절대 주소 계산이 네 곳에서 서로 달랐다. |
| **Solution** | 정식 주소를 `metadataBase()` 하나로 통일, 옛 호스트는 `SASU_LEGACY_HOSTS`로 화면만 308·`/api/*` 그대로, 메일 링크는 우리 도메인의 `/auth/confirm`(token_hash). |
| **Function/UX Effect** | `https://getsasu.com`이 TLS로 직접 서비스. 옛 주소 `/`·`/login`·`/demo?x=1`·`/d/<부서>`는 같은 경로로 308. 전환 후 첫 로그인 메일이 Gmail 받은편지함에 도착(전환 전 Resend 첫 메일은 스팸함). 다른 클라이언트에서 메일 링크로 로그인, 재사용 거부. 데스크톱 0.1.2→0.1.3 자동 업데이트에서 재로그인 0. |
| **Core Value** | 서비스·메일 주소가 하나의 도메인으로 맞춰졌고, 제출 주소·설치된 데스크톱·Slack·워커가 끊기지 않았다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|:-:|---|
| SC1 | 새 주소 완주·TLS·www 308 | ✅ | T4: Let's Encrypt `CN=getsasu.com`, `/`·`/login` 200, `www`·`http` 308. T10 운영 E2E 26 passed |
| SC2 | 옛 주소 화면 308·API 비이동 | ✅ | T7: 화면 경로 308 같은 경로·쿼리, `/api/jobs/run`·`/api/slack/events` 401, companion 401 JSON. T11: 설치된 0.1.2의 유효 Bearer 요청(departments·link·inbox)이 옛 주소에서 처리 |
| SC3 | 링크 전부 새 주소 | ✅ | U6 단위, 운영 sitemap `<loc>`·`og:image` `https://getsasu.com`, 워커 호출 `getsasu.com POST /api/jobs/run` |
| SC4 | 메일 링크 로그인·재사용 거부 | ✅ | T9: 링크 `https://getsasu.com/auth/confirm?token_hash=…`, 받은편지함, 별도 클라이언트 302 `/d/<부서>`·화면 200, 재사용 → `auth_callback` |
| SC5 | 0.1.3 업데이트 무재로그인 | ✅ | T11 run03 `reloginCalls: 0`, `restoredWithoutRelogin: true`, 설치 ASAR = 감사본 |
| SC6 | lint·build·unit·E2E·analyze ≥90%·운영 기록 | ✅ | verification.md, analysis 99.5%, production-cutover.md |

Overall Success Rate: 6/6.

## 1.5 Decision Record Summary

| Source | Decision | Followed? | Outcome |
|---|---|:-:|---|
| [User/PRD 1.33] | 루트 `getsasu.com`, `www`→루트 | ✅ | Vercel 도메인 2개 + www 308 |
| [User/ADR-088 결정 3] | 옛 주소 화면만 이동, API 유지 | ✅ | 데스크톱 0.1.2 실제 요청이 옛 주소에서 처리, 0.1.3은 새 주소 |
| [User] | 메일 링크 교체·0.1.3 포함, 단계마다 승인 | ✅ | 승인 3회, 각 단계 백업·확인값 기록 |
| [Design] | C 실용형(env로 켜고 끔) | ✅ | T1 병합 후 운영 동작 무변경 확인 → T7에서 env로 활성화 |
| [Design §11.4] | T5 허용 목록 `/**` | ⚠️ 변경 | 정확한 `https://getsasu.com/auth/callback`만 추가(더 좁음) |
| [Design §11.4] | T8 `setup-worker-cron.ts` 재실행 | ⚠️ 변경 | trigger secret 재기록 위험 때문에 `jobs_run_url` 한 행만 update |

## 2. 구현·검증 중 발견해 고친 것

- **오픈 리디렉션(root 리뷰):** `new URL(pathname + search, canonical)`이 `//evil.example` 경로를 다른 호스트로 해석 → 정식 origin에 pathname·search만 설정. red 3 → green.
- **Referrer-Policy 덮임(step 2 지적):** 라우트 헤더가 next.config 공통 헤더에 밀림 → `proxy.ts` `protect()`에서 `/auth/confirm(/)?`에 `no-referrer`. 운영에서 실제 헤더 확인.
- **Minor(analyze):** consent 테스트 env 누수, T7 직전 메일 링크 안내, 끝 슬래시 경로, 옛 호스트 POST 308 케이스.

## 3. 실패·재실행 (숨기지 않음)

- 로컬 build 첫 시도: 동시 `next build` 진행 중 → 재실행 통과.
- Cloudflare 대시보드 API 쓰기 403 → 변경 없음 확인 후 대시보드 화면 조작.
- 운영 E2E security-headers 3 실패 → 운영 CSP 강제 모드에 맞춰 `SASU_CSP_ENFORCE=true` 재실행 4/4.
- 데스크톱 빌드 run01 alias 누락, smoke run01 예약 작업 계정 매핑 실패, 업데이트 run01·02 게시 직후 feed 지연 → 각각 원인 기록 후 재실행 통과.

## 4. 남는 위험과 후속

- 수용(ADR-088 경계): token_hash 링크의 로그인 CSRF, 요청 로그의 일회용 토큰, 메일 스캐너 선소모.
- 웹 `/auth/signout`은 기본 전체 세션 범위다. T9 검증 뒤 로그아웃으로 tjrwn1003의 다른 웹 세션이 끝났다(활성 데스크톱 연결은 없었음). 로그아웃 범위(`local`)는 별도 판단 대상이다.
- 옛 주소 API 종료일은 정하지 않았다. 0.1.2 이하 설치본이 남아 있는 동안 유지한다.
- Gmail 도달률은 한 통 기준이다. 발송량이 쌓인 뒤 Postmaster Tools로 평판을 본다.
- Confirm signup 템플릿 문구는 영어 그대로(링크만 교체).

## 5. 문서

PRD 1.33(§4·§8·§10 #12), ADR-088, ARCHITECTURE §6-13(불변식 51~53), setup-guide 상단·§16, submission-checklist 주석, [plan](../../01-plan/features/app-domain-migration.plan.md) · [design](../../02-design/features/app-domain-migration.design.md) · [analysis](../../03-analysis/app-domain-migration.analysis.md) · [verification](../../verification/49-app-domain-migration/verification.md) · [전환 기록](../../verification/49-app-domain-migration/production-cutover.md) · [되돌리기 값](../../verification/49-app-domain-migration/rollback-values.md).
