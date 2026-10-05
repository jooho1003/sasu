# Step 2: auth-confirm

## 읽어야 할 파일

- `/AGENTS.md` (특히 service role 금지·로그 규칙)
- `/docs/ARCHITECTURE.md` §6 불변식(세션·로그) · §6-13 불변식 53 · §8 테스트 경계
- `/docs/ADR.md` ADR-088 결정 4·경계
- `/docs/PRD.md` §8 "운영 주소 이전 범위"
- `/docs/02-design/features/app-domain-migration.design.md` §4 E-C1·E-C2 · §6 · §7 · §8 U3·U4·U5·E1 · §9
- `app/auth/callback/route.ts` (현재 로그인 후 처리 — 이것을 lib로 옮긴다)
- `lib/auth-redirect.ts`, `tests/auth-redirect.test.ts`
- `lib/features.ts` (`orgAdminReadEnabled`)
- `lib/supabase/server.ts` (`createServerSupabaseClient`)
- `app/login/login-form.tsx` (메일 요청 — 바꾸지 않는다)
- `proxy.ts` (`/auth/*`는 세션 갱신 경로 — 바꾸지 않는다)
- 로컬 E2E 환경: `scripts/review-qa.mjs`, `playwright.config.ts`, 기존 로그인 E2E(`tests/e2e/`에서 `generateLink`·`signInWithOtp`·`review-qa`를 검색)

## 작업

1. 테스트 먼저 `tests/auth-login.test.ts`(U3·U4, red 확인) → `lib/auth-login.ts` 신규:
   ```ts
   export type EmailConfirm = { tokenHash: string; type: "email" | "magiclink" };
   export function parseEmailConfirm(params: URLSearchParams): EmailConfirm | null;
   // token_hash: ^[A-Za-z0-9_-]{1,512}$, type: "email" | "magiclink"만
   export async function postLoginPath(
     supabase: SupabaseClient, // 세션 클라이언트. service role 금지
     encodedNext: string | undefined, // LOGIN_NEXT_COOKIE 원값
   ): Promise<{ path: string; ok: boolean }>;
   // 현재 callback의 getUser → members(dept_id, 정렬·limit 1) → (멤버십 없고 관리자 읽기 켬) admin_org_id rpc
   // → 쿠키 decode → resolvePostLoginPath 순서를 그대로 옮긴다.
   // 실패: getUser 오류/없음 → { path: "/login?error=auth_callback", ok: false }
   //       members 오류 → { path: "/login?error=membership_lookup", ok: false }
   ```
   `NextResponse`를 import하지 않는다.
2. `app/auth/callback/route.ts`를 `postLoginPath`를 쓰도록 줄인다. 외부 동작은 그대로다: code 없음·교환 실패 → auth_callback, 성공 → 경로 + `LOGIN_NEXT_COOKIE` 삭제, 실패 경로에서는 쿠키를 지우지 않는다.
3. `app/auth/confirm/route.ts` 신규 `GET`: `parseEmailConfirm`이 null이면 `verifyOtp` 호출 없이 `/login?error=auth_callback`. 아니면 `createServerSupabaseClient()`로 `supabase.auth.verifyOtp({ type, token_hash })` → 오류면 auth_callback → `postLoginPath` → 302. 모든 응답에 `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store, max-age=0`. 쿼리 `next`는 읽지 않는다.
4. `tests/auth-confirm-route.test.ts`(U5): `@/lib/supabase/server`를 mock해 confirm 형식 오류(verifyOtp 미호출)·검증 실패·성공(302 Location·쿠키 삭제·no-referrer) + callback 회귀 3종(code 없음·교환 실패·성공).
5. E1 `tests/e2e/auth-confirm.spec.ts`: 로컬 review-qa Supabase에서 서비스 키로 `auth.admin.generateLink({ type: "magiclink", email: <기존 QA 시드 멤버> })`의 `properties.hashed_token`을 얻는다. 새 브라우저 컨텍스트로 `/auth/confirm?token_hash=…&type=email`을 열어 부서 화면(`/d/`) 도착을 확인하고, 같은 토큰을 다시 쓰면 `/login?error=auth_callback`인지 확인한다. 서비스 키는 이 테스트 프로세스에서만 쓰고 앱 요청 경로에는 넣지 않는다. 실행은 step 3이 한다 — 이 step에서는 작성과 `npx playwright test --list` 수집 확인까지만 한다.

## Acceptance Criteria

```bash
npx vitest run tests/auth-login.test.ts tests/auth-confirm-route.test.ts tests/auth-redirect.test.ts
npx eslint lib/auth-login.ts app/auth/confirm/route.ts app/auth/callback/route.ts tests/auth-login.test.ts tests/auth-confirm-route.test.ts tests/e2e/auth-confirm.spec.ts
npx tsc --noEmit -p .
npx playwright test tests/e2e/auth-confirm.spec.ts --list
grep -rn "token_hash\|tokenHash" app lib | grep -i "console\."   # 출력 없음
```

## 검증 절차

1. AC를 실행하고 red→green·케이스 수를 `docs/verification/49-app-domain-migration/step2.md`에 적는다.
2. 성공 → index.json step 2 `completed` + summary(E1 실행은 step 3 인계라고 명시). 3회 실패 → `error`.

## 금지사항

- 이 경로에서 service role 클라이언트를 쓰지 마라. 이유: 사용자 요청 경로 CRITICAL 규칙. 세션은 `createServerSupabaseClient()`의 쿠키 세션으로 만든다.
- `token_hash`·이메일을 로그·오류 응답·리디렉션 URL에 넣지 마라. 이유: 일회용 로그인 자격.
- 쿼리 `next`·`redirect_to`로 목적지를 정하지 마라. 이유: 오픈 리디렉션. 목적지는 `resolvePostLoginPath`만 정한다.
- `type`으로 `recovery`·`invite`·`signup`·`email_change`를 받지 마라. 이유: 비밀번호·초대 흐름이 없고, 허용 범위를 넓히면 다른 템플릿 링크가 이 경로로 세션을 만든다.
- `app/auth/` 아래에 route.ts가 아닌 .ts를 만들지 마라(tdd-guard 차단). 로직은 `lib/auth-login.ts`에 둔다.
- `login-form.tsx`·`proxy.ts`·`lib/site.ts`·`lib/pipeline/**` 수정 금지(다른 step 동시 실행), `npm run build`·전체 test·e2e 실행 금지, 훅 우회 금지, 커밋·푸시 금지.
