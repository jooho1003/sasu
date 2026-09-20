# 운영 반영 — 2026-09-20 (제출일)

사용자 승인(2026-09-20): "9/18 이후 커밋도 운영에 올린다. 마이그레이션을 적용하고 회고 기능을 켠다." 이 문서는 그 실행 기록이다.

## 반영 대상

- 커밋: `d30c6d0` (`origin/main`과 동일). 9/18 이후 phase 23(부분)·24·25·25-public-demo·26·27·30·31 포함.
- 배포 방식: 이전 기록([reviewed-materials-production-2026-09-17](reviewed-materials-production-2026-09-17.md))과 같이 Git 메타데이터 없는 `git archive HEAD` 스냅샷을 Vercel CLI 59.23.2로 원격 빌드했다. 커밋 작성자 권한 문제를 피하기 위한 절차다.

## 실행 순서와 결과

| 단계 | 실행 | 결과 |
|---|---|---|
| Groq 사용 한도 | 사용자가 console.groq.com에서 지출 알림 한도 해제 | 해제 전 `spend_limit_reached`(HTTP 400) → 해제 후 `gpt-oss-20b` 1토큰 호출 200 |
| DB 마이그레이션 | `npx supabase migration list --db-url` 원격 대조 | 로컬·원격 `0001`~`0051` 일치. `0037`~`0051`은 04:26 push 기록([retro-production-2026-09-20/migration.txt](retro-production-2026-09-20/migration.txt)) 후 이미 적용 상태였다. 이번 세션에서 추가 push 없음. [목록](production-rollout-2026-09-20/migration-list.txt) |
| 1차 배포 | `vercel deploy --prod --yes` (스냅샷) | `dpl_7swmVdV2qApDydCxHPPfnoTozrM1` Ready |
| 운영 환경변수 추가 (Production, sensitive) | `SASU_RETRO_ENABLED=true` · `NOTION_TOKEN_ENCRYPTION_KEY`(난수 32바이트 base64, 새로 생성) · `RETRO_CONNECTION_ENCRYPTION_KEY`(난수 32바이트 base64, 새로 생성) | 추가 완료. 값은 Vercel에만 있고 리포·로컬 `.env`에는 없다 |
| 2차 배포(환경변수 반영) | 같은 스냅샷 재배포 | `dpl_FSDCGFLugavueu7tDjRkgwBiju3K` Ready → `sasu-alpha.vercel.app` |

## 운영 스모크 (배포 직후, curl)

| 경로 | 결과 |
|---|---|
| `/` | 200 |
| `/demo/access` → `/demo` | 303 → 200 (쿠키 유지 시). 쿠키 없는 클라이언트는 `/demo` ↔ `/demo/access` 왕복이 설계상 정상 |
| `/demo` 본문 | "개발 회고"·"노션"·"채용 예고편"·"지원자" 카드 노출 |
| `/demo/retros` · `/demo/notion` · `/demo/hiring` · `/demo/features` · `/demo/admin` | 전부 200 |
| `/privacy` · `/robots.txt` | 200 |
| `/trailers` | 404 — `SASU_TRAILER_PREVIEW_ENABLED` 미설정, 설계상 비활성 404 |
| `POST /api/jobs/run` · `POST /api/slack/events` (서명 없음) | 401 |

첫 요청은 콜드 스타트로 20~30초가 걸렸고 이후 1초 안팎이다.

## 켜지지 않은 것

- `SASU_TRAILER_INVITES_ENABLED`: 미설정(off). 지원자 개별 링크는 법률 확인 전 어떤 실제 조직에도 켜지 않는다(ADR-062).
- 회고 커넥터 제공자 `RETRO_*_CLIENT_ID/SECRET`: 미설정. 연결 화면은 열리지만 실제 OAuth 연결은 각 제공자 앱 등록 뒤에만 된다(phase 30 step 4~7 외부 조건).
- Notion 통합 토큰: 조직 관리자가 관리자 화면에서 입력해야 수집이 시작된다(setup-guide §13).

## 이 세션에서 하지 않은 것

- 사람의 5분 세로 흐름 확인(phase 0 step 15), 실제 Slack 질문·인용 캡처(phase 14 step 1), 실제 마이크·Meet·Zoom 검증(phase 23), 제출 스크린샷 재촬영.
- Vercel MCP는 배포 목록·환경변수 조회 권한이 없어 CLI로 확인했다.
