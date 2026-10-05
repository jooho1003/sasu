# Step 2 검증: auth-confirm

2026-10-05 · design §4 E-C1·E-C2 · §8 U3·U4·U5·E1 · ADR-088 결정 4 · ARCHITECTURE 불변식 53

## 변경

- `lib/auth-login.ts` (신규): `parseEmailConfirm(params)`. `token_hash`는 `^[A-Za-z0-9_-]{1,512}$`, `type`은 `email`·`magiclink`만 받는다. 같은 이름의 값이 두 개 이상이면 거부한다. `postLoginPath(supabase, encodedNext)`는 기존 callback 순서를 그대로 옮겼다: `getUser` → `members(dept_id)` 정렬·limit 1 → (멤버십 없음 + 관리자 읽기 켬) `admin_org_id` rpc → 쿠키 decode → `resolvePostLoginPath`. 실패하면 `{ ok: false }`와 `auth_callback`/`membership_lookup` 경로를 돌려준다. `NextResponse`는 import하지 않는다. 오류 경로 상수 `AUTH_CALLBACK_ERROR_PATH`도 함께 export한다(두 라우트가 같은 문자열을 쓰도록).
- `app/auth/callback/route.ts`: `postLoginPath`를 쓰도록 줄였다. 외부 동작은 그대로다(307, code 없음·교환 실패 → auth_callback, 성공에서만 `sasu_login_next` 삭제).
- `app/auth/confirm/route.ts` (신규 `GET`): 형식 오류면 세션 클라이언트를 만들지 않고 `verifyOtp`도 부르지 않은 채 auth_callback으로 보낸다. 형식이 맞으면 `createServerSupabaseClient()`로 `verifyOtp({ type, token_hash })`를 부르고, 오류면 auth_callback, 성공하면 `postLoginPath` 결과로 302 이동한다. 모든 응답에 `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store, max-age=0`를 붙인다. 쿼리 `next`·`redirect_to`는 읽지 않는다. service role과 로그 출력은 쓰지 않는다.
- `tests/auth-login.test.ts` (U3·U4), `tests/auth-confirm-route.test.ts` (U5), `tests/e2e/auth-confirm.spec.ts` (E1, 작성과 수집 확인까지).

## 테스트 (red → green)

| 단계 | 명령 | 결과 |
|---|---|---|
| red | `npx vitest run tests/auth-login.test.ts` (구현 전) | 실패. `Cannot find package '@/lib/auth-login'`, Test Files 1 failed, 실행된 테스트 0개 |
| green | `npx vitest run tests/auth-login.test.ts tests/auth-confirm-route.test.ts tests/auth-redirect.test.ts` | 3 files, **24 passed**: auth-login 13 (U3 5 · U4 8), auth-confirm-route 8 (confirm 5 · callback 회귀 3), auth-redirect 3 |
| 회귀 | `npx vitest run tests/org-admin-routes.test.ts` (기존 callback 테스트 2건 포함) | 13 passed |
| 변형 확인 | confirm 라우트에서 `Referrer-Policy` 한 줄을 지우고 실행 → 되돌림 | 5 failed / 3 passed. 지운 줄을 되돌린 뒤 8 passed |

U5는 라우트에서 콘솔 호출(log/info/warn/error/debug)도 감시한다. 어떤 호출 인자에도 토큰이 없어야 통과한다.

## Acceptance Criteria

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/auth-login.test.ts tests/auth-confirm-route.test.ts tests/auth-redirect.test.ts` | 24 passed |
| `npx eslint lib/auth-login.ts app/auth/confirm/route.ts app/auth/callback/route.ts tests/auth-login.test.ts tests/auth-confirm-route.test.ts tests/e2e/auth-confirm.spec.ts` | exit 0, 출력 없음 |
| `npx tsc --noEmit -p .` | exit 0. step 0·1이 수정 중이던 파일까지 포함해 오류 없음 |
| `npx playwright test tests/e2e/auth-confirm.spec.ts --list` | 테스트 2개 수집 (1 file) |
| `grep -rn "token_hash\|tokenHash" app lib \| grep -i "console\."` | 출력 없음 |

## E1 (step 3에 인계, 이 step에서는 실행하지 않음)

- 실행 조건: `E2E_BASE_URL`이 `http://localhost:3011` 또는 `http://127.0.0.1:3011`일 때만 실행하고, 다른 주소면 skip한다. 브라우저는 항상 `http://localhost:3011`로 연다. `next start`를 `-H` 없이 띄우면 `request.url`이 localhost 기준이 되어, 127.0.0.1로 열면 세션 쿠키가 붙은 호스트와 리디렉션 호스트가 달라지기 때문이다.
- 자격 정보: `scripts/review-qa.mjs`와 같은 `npx --yes supabase status --workdir .vercel/review-qa -o json`에서 `API_URL`·`SERVICE_ROLE_KEY`를 읽는다. `API_URL`이 `http://127.0.0.1|localhost:<port>`가 아니면 `local_supabase_required`로 실패한다. 그래서 `.env`의 운영 키는 읽지 않는다. 서비스 키는 테스트 프로세스 안에서 `generateLink`와 시드 확인에만 쓰고 출력하지 않는다.
- 시드: `review-member@example.test`(review-qa setup이 만드는 합성 팀원)와 `.vercel/review-qa/ids.json`의 `member`. 도착 부서는 서비스 키로 `members`를 dept_id 오름차순으로 읽어 첫 부서로 정한다.
- 테스트 1: 형식 오류 3종을 redirect 없이 요청해 302 `/login?error=auth_callback`, `referrer-policy: no-referrer`, `cache-control`의 `no-store`를 확인한다.
- 테스트 2: `generateLink({ type: "magiclink" })`로 받은 `hashed_token`을 새 컨텍스트에서 `/auth/confirm?token_hash=…&type=email`로 연다. `/d/<첫 부서>`에 도착해야 한다. 다른 새 컨텍스트에서 같은 토큰을 다시 쓰면 `/login?error=auth_callback`과 기존 오류 문구가 나와야 한다. URL에 토큰이 남지 않아야 한다.

## 확인이 필요한 점

1. **`next start`에서는 라우트가 붙인 `Referrer-Policy`가 무시될 수 있다.** `next.config.ts`의 `headers()`가 모든 경로에 `Referrer-Policy: strict-origin-when-cross-origin`을 붙인다. 이 값은 라우팅 단계에서 proxy 헤더와 함께 응답에 먼저 들어간다(`next/dist/server/lib/router-server.js`의 `res.setHeader(resHeaders)`). 라우트 핸들러 응답을 보낼 때는 이미 있는 헤더를 덮지 않는다(`next/dist/server/send-response.js`: `!isHeaderPresent`일 때만 append). 그래서 실제 응답에는 baseline 값이 나갈 가능성이 높다. `/t/i/`가 proxy에서 `no-referrer`를 붙이는 것도 같은 이유로 보인다. E1 테스트 1이 실제 헤더를 확인하므로, 고치지 않으면 step 3에서 실패할 것으로 예상한다. 수정안은 `proxy.ts`의 `protect()`에서 `/t/i/` 조건에 `pathname === "/auth/confirm"`를 더하는 것이고, `tests/proxy.test.ts` 케이스도 하나 추가한다. 이 step은 proxy.ts를 수정할 수 없어서(step 1이 동시에 작업 중) 손대지 않았다. 실제 위험은 낮다. 302 응답에는 문서가 없고, baseline 정책도 다른 출처로는 origin만 보낸다.
2. **로그인 CSRF.** token_hash 링크는 PKCE verifier 없이 세션을 만든다. ADR-088이 "다른 브라우저에서도 로그인"을 위해 받아들인 성질이다. 그 결과 공격자가 자기 계정의 링크를 피해자에게 열게 하면 피해자가 공격자 계정으로 로그인될 수 있다. 기존 `/auth/callback`(PKCE)에는 이 경로가 없었다. 공격자가 실제 부서 멤버여야 하고 화면에 부서명이 보여 알아차리기 쉽지만, 남는 위험으로 기록한다.
3. **플랫폼 요청 로그.** 쿼리에 들어 있는 토큰이 Vercel 요청 로그에 남을 수 있다. 애플리케이션 로그에는 쓰지 않는다. 토큰은 첫 검증에서 소모된다. 기존 `?code=`와 Supabase `/verify?token=` 링크도 같은 성질이다.

## 도구

- Graft: 이 세션에 도구가 없어 쓰지 못했다. 대신 `resolvePostLoginPath`·`LOGIN_NEXT_COOKIE`·`/auth/callback` 참조를 grep으로 확인했다. 사용처는 `app/auth/callback/route.ts`(이번에 이동)와 `app/login/login-form.tsx`(쿠키 쓰기, 변경 없음)뿐이다. callback을 import하는 테스트는 `tests/org-admin-routes.test.ts`이고 회귀 13 passed다.
- Archify: 이번 step은 실행 흐름 하나를 추가할 뿐이다(design §2 흐름도에 이미 있다). 그래서 시각화를 새로 만들지 않았다.

## root 리뷰 보완 (2026-10-05)

- 확인 1 반영: `tests/proxy.test.ts`에 `/auth/confirm` no-referrer·`/auth/callback` 비적용 케이스 추가 → red(1 failed | 14 passed) → `proxy.ts` `protect()` 조건에 `pathname === "/auth/confirm"` 추가 → green. 관련 6파일 91 passed, eslint 통과.
- 확인 2·3: 수용한 남는 위험으로 ADR-088 경계와 design §7에 기록.
