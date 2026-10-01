# Step 2: companion-auth

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` §6 불변식 2·3·9, §6-12 불변식 46~48, §8
- `docs/ADR.md` ADR-082 결정 3·4·5
- `docs/02-design/features/desktop-companion.design.md` §4(공통·E01~E04)·§4.1·§6·§7(S1·S3·S9)
- step 1 산출물: `supabase/migrations/00NN_device_links.sql`, `scripts/verify-device-links-sql.mjs`
- `lib/supabase/server.ts`, `lib/supabase/membership.ts`(반환 모양·redirect 동작), `lib/contracts.ts`
- `proxy.ts`(매처에 `/api/companion`이 없어야 함), `eslint.config.mjs`
- 기존 route 테스트 예: `tests/ask-daily-limit-route.test.ts`, `tests/consent-route.test.ts`

## 작업

1. `lib/supabase/bearer.ts` — `createBearerSupabaseClient(accessToken: string): SupabaseClient`. anon key + `global.headers.Authorization = Bearer …`, `auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }`. 쿠키를 읽지 않는다.
2. 테스트 먼저(`tests/companion/context.test.ts`, `tests/companion/device-context.test.ts`), 그다음 구현:
   - `lib/companion/context.ts`
     ```ts
     export type ActorContext = { client: SupabaseClient; userId: string; deptId: string; role: "lead"|"member"; consentedAt: string|null };
     export type Result<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string; code: string };
     export function actorFromMembership(client: SupabaseClient, m: Membership): ActorContext;
     export function jsonResult<T>(r: Result<T>): Response; // Cache-Control: private, no-store
     ```
   - `lib/companion/device-context.ts`
     ```ts
     export function readBearer(request: Request): string | null;
     export async function requireBearerUser(request: Request, deps?): Promise<{ok:true; client; userId; token} | Result<never>>;
     export async function requireDeviceContext(request: Request, deps?): Promise<{ok:true; ctx: ActorContext & {linkId; deptName; displayName}} | Result<never>>;
     ```
     - 토큰 없음 401 `no_token`. `getUser(token)` 실패(`session_not_found` 포함) 401 `session_invalid`. `companion_context()` 0행 401 `device_revoked`. 리다이렉트·throw로 실패를 표현하지 않는다.
     - 부서·역할·동의는 `companion_context()` 결과에서만 정한다. 요청 본문·URL의 부서를 쓰지 않는다.
     - `deps`로 클라이언트 생성기를 주입해 테스트한다. `next/*`를 import하지 않는다.
3. `lib/contracts.ts`에 `CompanionLinkInput`(strict: `dept_id` uuid, `device_name` 1~60, `app_version` 1~20)과 E01~E03 응답 스키마를 `Companion*` 이름으로 추가한다.
4. 경로(얇게 — 인증 컨텍스트·Zod·응답 변환만):
   - `app/api/companion/departments/route.ts` GET(E01): `requireBearerUser` → 본인 `members`+`departments`(RLS) → `{departments:[{id,name,role,consented}]}`.
   - `app/api/companion/link/route.ts` POST(E02, `link_device`, 201)·GET(E03)·DELETE(E04, `revoke_device_link(ctx.linkId)`, 204). RPC 오류 매핑은 design §6.
5. `eslint.config.mjs`에 `no-restricted-imports` 규칙: `@/lib/companion/device-context`·`@/lib/supabase/bearer`는 `app/api/companion/**`와 `tests/**` 밖에서 import 금지(design §7 S1).
6. `scripts/verify-companion-auth.mjs`(로컬 QA 전용, 로컬 URL이 아니면 종료) — step 0의 코드 로그인 방식으로 사용자 2명(같은 부서 lead·member)과 다른 부서·데모 부서를 준비하고 로컬 dev 서버(`node scripts/review-qa.mjs dev`)에 요청한다:
   - 토큰 없음 401 · 쿠키만 보낸 `/api/companion/link` 401 · E01 200 · E02 201 · 비멤버 부서 연결 403 · 데모 부서 403 · E03 200 · E04 204 뒤 E03 401 · 해제 뒤 `getUser` 실패.
   - Bearer만 보낸 기존 웹 경로(`/api/d/<dept>/ask`)는 인증되지 않는다(401 또는 로그인 리다이렉트, 202 아님).

## 코드 관계와 구조 확인

Graft로 새 모듈의 import 범위(앱 경로 밖에서 쓰이지 않음)를 확인한다. 결과·누락은 `docs/verification/43-desktop-companion/auth.md`.

## Acceptance Criteria

```powershell
npx vitest run tests/companion
npm run lint
npm run build
npm run test
node scripts/verify-device-links-sql.mjs
node scripts/verify-companion-auth.mjs
git diff --check
```

## 검증 절차

1. 위 AC를 실행하고 `auth.md`에 결과를 남긴다.
2. 체크리스트: 요청 경로 service role 0(`grep -r "service" app/api/companion lib/companion` 결과 확인) · 로그에 토큰·본문 없음 · 새 `lib/` 모듈의 테스트 존재.
3. `phases/43-desktop-companion/index.json` step 2를 갱신한다.

## 금지사항

- `createServiceSupabaseClient`·service role key를 `app/api/companion/**`·`lib/companion/**`에서 쓰지 마라. 이유: 불변식 2·46 — 권한 판정은 사용자 JWT의 RLS로만 한다.
- 기존 `createServerSupabaseClient`·`requireMembership`에 Bearer 분기를 넣지 마라. 이유: 불변식 48 — 웹 경로는 쿠키만 받는다.
- `proxy.ts` 매처에 `/api/companion`을 넣지 마라. 이유: 쿠키 세션 갱신이 Bearer 경로에 섞인다.
- 토큰·이메일·요청 본문을 로그에 남기지 마라. 이유: 불변식 9.
- 기존 테스트를 깨뜨리지 마라.
