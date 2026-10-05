# app-domain-migration — Plan

2026-10-05 · bkit PDCA · phase 49. 사용자 결정 "운영 웹 주소를 getsasu.com 쪽으로 옮겨야 해서, PDCA로 진행" + 질문 4개 답(루트 도메인 · 옛 주소는 화면만 이동 · 메일 링크·데스크톱 0.1.3 포함 · 운영 전환은 단계마다 승인).

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 운영 웹이 공용 `sasu-alpha.vercel.app`에 있어 `sasu@getsasu.com` 메일의 링크 도메인이 발신 도메인과 다르고, 절대 주소 계산 네 곳이 서로 달라 도메인을 바꾸면 일부 링크만 먼저 바뀐다. |
| Solution | 정식 주소를 `https://getsasu.com` 하나로 정하고 `metadataBase()`로 주소 계산을 통일한다. 옛 주소는 화면만 308 이동하고 `/api/*`는 그대로 처리하며, 메일 링크를 `/auth/confirm`으로 바꾼다. |
| Function/UX Effect | 사용자는 `getsasu.com`으로 접속하고, 메일 링크도 같은 도메인으로 열린다. 옛 링크·제출 주소·설치된 데스크톱·Slack·워커는 끊기지 않는다. |
| Core Value | 서비스 주소와 메일 발신 주소가 같아져 신뢰도와 메일 도달률이 오르고, 대회 심사·데모데이 동안 서비스가 끊기지 않는다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | 발신·링크 도메인 불일치(스팸 원인 후보)와 주소 계산 4곳의 불일치 |
| WHO | 웹 사용자(파일럿 lead·구성원·조직 관리자), Slack 사용자, 데스크톱 0.1.x 사용자, 심사위원 |
| RISK | 옛 주소 API를 리디렉션하면 데스크톱 Bearer가 빠져 세션 삭제 · 대시보드 설정 순서 오류로 로그인/Slack 중단 |
| SUCCESS | SC1~6: 새 주소 완주 · 옛 주소 화면 308/API 200 · 링크 전부 새 주소 · 메일 링크 로그인 · 0.1.3 업데이트 무재로그인 |
| SCOPE | PRD §4·§8(운영 주소 이전)·§10 #12 / ADR-088 / ARCHITECTURE §6-13 불변식 51~53 |

## 1. Overview

상위 원천: [PRD](../../PRD.md) §4 도메인·§8 "운영 주소 이전 범위"·§10 #12, [ADR-088](../../ADR.md), [ARCHITECTURE](../../ARCHITECTURE.md) §6-13. 배경 기록: [메일 수신 기록](../../verification/43-desktop-companion/mail-delivery-2026-10-05.md) "후속 조치". 이 문서는 범위 매핑과 `/pdca analyze`가 비교할 목록만 둔다.

## 2. Scope

**코드(phase 49 step):** 주소 계산 통일(`metadataBase()`), 옛 호스트 화면 이동(`proxy.ts` + `lib/site.ts`), `/auth/confirm` 경로와 로그인 후 처리 공유, `.env.example`·setup-guide 절차 갱신.

**운영 전환(root, 단계마다 승인):** Vercel 도메인, Cloudflare DNS, Supabase Site URL·redirect 허용 목록·메일 템플릿, Slack 앱 주소, Vercel 환경변수·재배포, 워커 `jobs_run_url`, 데스크톱 0.1.3 빌드·감사·공개.

**범위 밖:** 옛 주소 API 종료, 쿠키 도메인 공유, 새 인증 방식, 대회 플랫폼 제출 주소 변경, HSTS preload, 웹 로그인 6자리 코드 입력 화면, 루트 도메인 별도 사이트.

## 3. Requirements

| ID | 요구 (원천) / 비교 목록 | 우선순위 |
|---|---|---|
| FR1 | 주소 통일 (불변식 51): `lib/pipeline/send-slack.ts`·`app/api/slack/interactions/route.ts`·`app/api/d/[dept]/settings/consent/route.ts`의 로컬 `appBaseUrl()` 삭제 → `metadataBase()` | 높음 |
| FR2 | 옛 주소 이동 (불변식 52): `SASU_LEGACY_HOSTS` 호스트의 `/api/` 밖 경로 → 정식 주소 같은 경로·쿼리 308. `/api/*` 통과, 루프·비 https 방지, 빈 값이면 무동작 | 높음 |
| FR3 | 메일 링크 확인 (불변식 53): `GET /auth/confirm` token_hash+type(`email`·`magiclink`) → `verifyOtp` → `resolvePostLoginPath`. 실패 `/login?error=auth_callback`, `no-referrer`·`no-store` | 높음 |
| FR4 | 로그인 후 처리 공유: `/auth/callback`과 `/auth/confirm`이 같은 멤버십·관리자·`LOGIN_NEXT_COOKIE` 처리를 쓴다 | 높음 |
| FR5 | 설정·절차 문서: `.env.example`에 `NEXT_PUBLIC_APP_URL`·`SASU_LEGACY_HOSTS`, setup-guide에 전환·되돌리기 순서 | 중간 |
| FR6 | 운영 전환 11단계 (ADR-088 전환 순서), 단계별 확인값과 되돌리기 기록 | 높음 |
| FR7 | 데스크톱 0.1.3: `SASU_APP_URL=https://getsasu.com`·버전만 변경, 감사가 새 주소 포함·옛 주소 미포함 확인, 0.1.2→0.1.3 업데이트 뒤 세션 유지 | 중간 |

비기능: 로그에 `token_hash`·메일 본문 미출력. 기존 CSP·HSTS·Origin 검사 로직 유지. 게스트 라우트 LLM 0·쓰기 0 유지. UI 문구 변경 없음.

## 4. Success Criteria

- SC1: `https://getsasu.com`에서 게스트 E2E·로그인·대시보드 완주, TLS 유효, `www`→루트 308.
- SC2: `https://sasu-alpha.vercel.app/`·`/login`·`/demo?x=1` → `https://getsasu.com` 같은 경로·쿼리 308. `/api/companion/*`(Bearer)·`/api/jobs/run`·Slack events 서명 검사는 옛 주소에서 리디렉션 없이 응답.
- SC3: Slack 카드·원장·동의 DM·답변 링크, OAuth `redirect_uri`, sitemap, OG 메타데이터가 모두 `https://getsasu.com`(단위 테스트 + 운영 확인).
- SC4: 메일 링크가 `https://getsasu.com/auth/confirm?...`이고 다른 브라우저에서 열어도 로그인된다. 잘못된/재사용 토큰은 `/login?error=auth_callback`.
- SC5: 운영 데스크톱 0.1.2 → 0.1.3 업데이트 뒤 다시 로그인하지 않고 질문·받은 일 조회가 새 주소로 동작.
- SC6: lint·build·unit(신규 TDD 포함)·관련 E2E 통과, `/pdca analyze` 90% 이상, 운영 전환 단계별 실행 기록.

## 5. Risks and Mitigation

| 위험 | 완화 |
|---|---|
| 옛 주소 API 리디렉션 → 데스크톱 401·세션 삭제 | `/api/*` 통과를 불변식·단위 테스트로 고정, 운영에서 Bearer 요청 직접 확인 |
| Supabase redirect 허용 목록 누락 → 로그인 실패 | 새 주소를 먼저 추가하고 옛 항목은 유지, 템플릿 변경은 환경변수 전환 뒤 |
| Slack Events URL 변경 시 검증 실패 | 새 주소 응답 확인 뒤 변경, 실패 시 옛 URL로 되돌림(옛 주소 계속 응답) |
| Cloudflare 프록시와 Vercel TLS 충돌 | DNS only, 기존 Redirect Rule 삭제 순서를 같은 단계로 묶음 |
| 도메인 추가로 `VERCEL_PROJECT_PRODUCTION_URL` 변경 | FR1로 계산을 통일하고 `NEXT_PUBLIC_APP_URL`을 명시 |
| 이메일 스캐너가 일회용 토큰 소모 | 기존 링크와 동일 위험, 재요청 안내(ADR-088 경계) |
| 동시 세션이 main에 푸시 | 전환 전후 `git fetch`·`origin/main` 확인 |

## 6. Impact Analysis

변경 자원과 소비자 (Explore 인벤토리 2026-10-05):

| 자원 | 소비자 | 영향 |
|---|---|---|
| `metadataBase()` | layout·sitemap·Slack OAuth start/callback·회고 OAuth·Slack events·answer·retro-draft·reminder·slack-answer-delivery·Origin 검사 8곳·admin slack | 값 출처만 동일, 동작 유지 |
| 로컬 `appBaseUrl()` 3곳 | send-slack 카드/원장 링크, interactions 원장 링크, 동의 DM | `metadataBase()`로 교체 — preview의 `VERCEL_URL` fallback 사라짐(preview는 Slack 발신 없음) |
| `proxy.ts` | 모든 화면 요청 | 옛 호스트 + 비 API 경로에만 308 추가 |
| `/auth/callback` | 이미 보낸 메일, 데스크톱 무관 | 처리 공유로 리팩터, 동작 유지 |
| 운영 설정 | Vercel env·도메인, Cloudflare, Supabase Auth, Slack 앱, `worker_config.jobs_run_url`, 데스크톱 빌드 도구(`.vercel/desktop-release-012-tools`) | 전환 단계에서 변경 |

## 7. Architecture Considerations

새 테이블·migration·job·LLM 호출 없음. `can_see()`·RLS·Bearer 경계 불변. 결정 상세는 ADR-088, 설계 대안 비교는 design 문서.

## 8. Convention Prerequisites

`lib/` 변경은 테스트 먼저(`tests/site.test.ts` 확장, 로그인 후 처리 lib 함수 신규 시 테스트 선행). 라우트·`proxy.ts`는 TDD 예외이나 route 테스트를 추가한다. Next.js 16 문서(`node_modules/next/dist/docs/`)에서 proxy·redirect API를 확인한다. 신규 환경변수 2개는 서버 전용(`SASU_LEGACY_HOSTS`)과 기존 공개 값(`NEXT_PUBLIC_APP_URL`).

## 9. Next Steps

`/pdca design app-domain-migration` → `phases/49-app-domain-migration` step 작성·실행 → `/pdca analyze` → 운영 전환(단계마다 승인) → 데스크톱 0.1.3 → `/pdca report`.
