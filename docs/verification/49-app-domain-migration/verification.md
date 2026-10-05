# Step 3 검증: verification (R1 전체 회귀)

2026-10-05 · design §8 R1 · ADR-088 · 운영(Vercel·Supabase·Cloudflare·Slack·운영 DB)에는 아무것도 쓰지 않았다. 비밀값은 기록하지 않는다.

이전 step 기록: [step0](step0.md) · [step1](step1.md) · [step2](step2.md)

## 문서 변경

- `.env.example`: `NEXT_PUBLIC_APP_URL`(정식 주소, 비면 `VERCEL_PROJECT_PRODUCTION_URL`)과 `SASU_LEGACY_HOSTS`(서버 전용, 쉼표 구분, `/api/*` 비이동, 운영 전환 T7에서만 설정)를 주석과 함께 추가. 값은 비워 둠.
- `docs/setup-guide.md`: 상단 2026-10-05 Cloudflare 302 문장에 "phase 49 전환 때 이 규칙은 삭제한다" 추가, "16. 운영 주소 이전 (ADR-088)" 절 신설(design §11.4 T1~T12를 확인값·되돌리기와 함께 표로). 아직 전환하지 않았으므로 현재 운영 값은 바꾸지 않았다.

## 명령과 결과

| 명령 | 결과 |
|---|---|
| `npm run lint` | exit 0. scanned 266, blocking 0, warnings 84(기존 경고, 이번 변경 무관) |
| `npm run test` | 186 files · **1880 passed**, 실패 0 |
| `npm run build` | exit 0, Compiled successfully, 라우트 표에 `/auth/confirm` 포함. 첫 시도는 `Another next build process is already running`(다른 `next build`가 18:28에 시작돼 진행 중이었음, 환경 원인)으로 exit 1 → 그 빌드 종료 후 재실행해 통과 |
| `node scripts/review-qa.mjs setup` | 대기 중 migration 없음, 로컬 QA 준비 완료(로컬 Supabase `review-qa` 전용) |
| `node scripts/review-qa.mjs build` | exit 0 |
| `node scripts/review-qa.mjs start` (3011) 후 `/rest/v1/` 4회 호출 | 모두 200 (PGRST303 재현 없음) |
| `E2E_BASE_URL=http://127.0.0.1:3011 npx playwright test tests/e2e/auth-confirm.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts tests/e2e/security-headers.spec.ts` | **14 passed**, 실패·재실행 0 (auth-confirm 2 · guest 5 · security-headers 4 · site 3) |
| 3011 프로세스 종료 | 포트로 PID를 찾아 `taskkill /T /F`, 이후 3011 LISTEN 0건 |

E1(`auth-confirm.spec.ts`): 형식 오류 링크 → 302 `/login?error=auth_callback`·`no-referrer`·`no-store`, 로컬 `generateLink` 토큰으로 새 컨텍스트에서 부서 화면 도착, 같은 토큰 재사용 → `/login?error=auth_callback` 모두 통과.

## 정리

- E2E가 추적 파일 `docs/verification/csp-rendering-2026-09-24/report-only-headers.json`을 덮어써 `git checkout --`으로 되돌렸다.
- `SASU_VERIFY_BUILD=1` 빌드는 쓰지 않아 `next-env.d.ts` 변경 없음.
- 마지막 `.next`는 `review-qa.mjs build` 산출물이다(로컬 QA env 기준).

## 미실행 범위

- 운영 전환 단계 T1~T12 및 P1(운영 확인): root가 단계마다 사용자 승인으로 실행한다. 이 step에서는 실행하지 않았다.
- 실제 메일 수신 링크(T9)·운영 E2E(T10)·데스크톱 0.1.3(T11): 운영 전환 후 단계.

## Graft/Archify

이 step에서는 Graft·Archify를 실행하지 않았다(문서 편집과 회귀 실행만 수행). 구조 변경은 step 0~2에서 `lib/site.ts`·`lib/auth-login.ts`·`proxy.ts`·라우트 배선으로 한정되었고, 수동 확인 범위는 `app`·`lib`에서 `APP_URL`·`VERCEL_URL` 직접 읽기 0건(step0 기록), `/api/*` 비이동(step1 단위 테스트), `token_hash` 콘솔 출력 0건(step2 grep)이다. 도구 결과가 없는 부분은 이 범위가 누락 범위다.

## PDCA analyze 뒤 Minor 보완 (root, 2026-10-05)

gap-detector 99.5%(Critical·Important 0) 뒤 Minor를 처리했다.
- M1: `tests/consent-route.test.ts` `beforeEach`의 `VERCEL_URL` stub을 `vi.unstubAllEnvs()`로 교체(step0 기록과 실제를 일치, 테스트 간 env 누수 제거).
- M3: setup-guide §16 주의에 "T7 직전 메일 링크는 실패 → 새 주소에서 재요청" 추가.
- M4: `/auth/confirm/`(끝 슬래시)도 proxy `no-referrer` — red 1 → `^\/auth\/confirm\/?$` → green.
- M5: 옛 호스트 비 API POST가 308·같은 경로로 이동하는 케이스 추가.
- M2(U6 interactions 테스트를 새 파일 `tests/slack-decision-link.test.ts`로 작성)는 차이로만 기록.
- 결과: `npx vitest run tests/proxy.test.ts tests/consent-route.test.ts tests/site.test.ts tests/auth-confirm-route.test.ts` 68 passed, eslint 통과.
