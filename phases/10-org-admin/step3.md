# Step 3: admin-routes

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §6 불변식 2·3·9 · §6-2 불변식 17·18
- `/docs/ADR.md` ADR-044 · ADR-024(요청 경로 service role 금지)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-6 · §B-7 끝 두 줄(콜백·페이지 가드) · §L1 4·6·7 · §L3 표 · §L4 4·5
- step 0~2 산출물: `supabase/migrations/0026_org_admin.sql`, `lib/features.ts`, `lib/auth-redirect.ts`, `lib/org-admin.ts`, `lib/contracts.ts`의 Admin 계약
- 기준 패턴: `app/api/d/[dept]/roles/[roleId]/runs/route.ts` 82~170행(멤버십 → lead 403 → JSON → 권한 필드 제거 → Zod → 세션 클라이언트 RPC → 오류 매핑), `tests/agent-role-routes.test.ts`(모킹 방식)
- `app/auth/callback/route.ts`, `app/login/page.tsx`, `app/login/login-form.tsx`, `proxy.ts`(matcher 44~54행), `lib/supabase/server.ts`, `lib/supabase/membership.ts`
- `scripts/seed-dept.ts` 19~70행(`requiredEnv`·`ensureUser`), `scripts/setup-worker-cron.ts`(운영 스크립트 출력·종료 코드 패턴), `eslint.config.mjs`

## 작업

모든 라우트 공통 규칙:

- 첫 줄에서 플래그를 본다. 읽기 경로는 `orgAdminReadEnabled()`, 쓰기 경로는 `orgAdminWritesEnabled()`가 false면 **404**. 이유: 컷 ②·⑤는 플래그로 한다.
- 세션 클라이언트(`createServerSupabaseClient`)로 RPC만 부른다. service role을 import하지 않는다(ESLint 규칙 유지).
- 본문의 `org_id`·`dept_id`(URL 외)·`created_by`·`role` 같은 권한 필드는 버린다. 조직은 SQL이 `auth.uid()`로 정한다.
- Zod(step 2 계약)로 파싱 → 실패 400. RPC 오류는 코드로 매핑: 42501 → 403, 22023 → 400, P0001 상태 충돌 → 409, 그 밖 500. 응답 본문은 `{ error: code, message: adminErrorMessage(code) }`.
- 로그에 이메일·토큰·표시 이름·본문을 쓰지 않는다. id·HTTP 상태·오류 코드만.

### 1. 조직 관리자 쓰기 라우트 (`app/api/admin/**`)

| 경로 | 메서드 | RPC |
|---|---|---|
| `app/api/admin/departments/route.ts` | POST `{name}` | `admin_create_department` |
| `app/api/admin/departments/[deptId]/first-lead-invite/route.ts` | POST `{email}` | `admin_invite_first_lead` → `{inviteId, inviteUrl, expiresAt}` |
| `app/api/admin/invites/[inviteId]/revoke/route.ts` | POST | `revoke_invite` |
| `app/api/admin/members/demote/route.ts` | POST `{userId, deptId}` | `demote_lead` |
| `app/api/admin/members/remove/route.ts` | POST `{userId, deptId}` | `remove_member` |

- 초대 생성 응답은 `Cache-Control: no-store`. 토큰은 `inviteUrl` 안에만 담고 다른 필드로 반복하지 않는다.

### 2. 부서장 라우트 (`app/api/d/[dept]/**`)

| 경로 | 메서드 | RPC |
|---|---|---|
| `app/api/d/[dept]/invites/route.ts` | GET | `lead_invites` |
| 같은 파일 | POST `{email}` | `lead_invite_member` → `{inviteId, inviteUrl, expiresAt}` |
| `app/api/d/[dept]/invites/[inviteId]/revoke/route.ts` | POST | `revoke_invite` |
| `app/api/d/[dept]/members/[userId]/promote/route.ts` | POST | `lead_promote_member` |
| `app/api/d/[dept]/members/[userId]/demote/route.ts` | POST | `demote_lead` |
| `app/api/d/[dept]/members/[userId]/remove/route.ts` | POST | `remove_member` |

- `requireMembership(dept)`로 멤버십을 확인하고 lead가 아니면 403. SQL도 다시 판정한다(버튼 숨김은 권한이 아니다).

### 3. 초대 수락·로그아웃·콜백·로그인

- `app/api/invites/accept/route.ts` POST `{token, displayName}` → `accept_invite` → `{deptId, next: "/consent?next=/d/<deptId>"}`. 비로그인 401.
- `app/auth/signout/route.ts` POST → `supabase.auth.signOut()` → 303으로 정리된 `next`(없으면 `/login`). GET으로 로그아웃되지 않게 한다(링크 프리페치로 로그아웃되는 것 방지).
- `app/login/page.tsx`: `searchParams.next`를 받아 폼에 넘긴다. `login-form.tsx`: `signInWithOtp` 직전에 `loginNextCookieValue(next)`가 있으면 쿠키 `sasu_login_next`(Path=/, Max-Age=600, SameSite=Lax, https면 Secure)를 쓴다. `emailRedirectTo`는 바꾸지 않는다.
- `app/auth/callback/route.ts`: 코드 교환 성공 후 쿠키를 읽어 지우고, 멤버십 첫 부서를 조회한 뒤, 멤버십이 없고 `orgAdminReadEnabled()`면 세션 클라이언트로 `admin_org_id()`를 호출한다. 목적지는 `resolvePostLoginPath(...)`로 정한다. 기존 오류 리다이렉트(`auth_callback`·`membership_lookup`)는 유지한다.

### 4. 페이지 가드와 미들웨어

- `lib/supabase/org-admin.ts`: `requireOrgAdmin(): Promise<{ status: "ok"; userId: string; orgId: string } | { status: "forbidden" }>`
  - 플래그 off → `notFound()` · 비로그인 → `redirect("/login?next=/admin")` · `admin_org_id()` null → `{status:"forbidden"}` (페이지가 "조직 관리자 권한이 없습니다"를 렌더). 이것은 UX용이며 실제 권한은 RPC가 집행한다.
- `proxy.ts` matcher에 `/admin/:path*`, `/invite/:path*`, `/api/admin/:path*`, `/api/invites/:path*`를 추가해 세션 갱신이 되게 한다. 기존 matcher 항목은 그대로 둔다.

### 5. 운영 스크립트 `scripts/grant-org-admin.ts`

- 사용법(파일 머리 주석): `npx tsx scripts/grant-org-admin.ts --email <email> --org <org-uuid> --operator <name> [--revoke]`
- service role로 이메일의 사용자를 찾고(`auth.admin.listUsers` 페이지 순회), 조직이 존재하며 `is_demo=false`인지 확인한 뒤 `org_admins`에 `granted_by='script:<operator>'`로 upsert한다. `--revoke`면 해당 행 삭제.
- 출력은 user_id·org_id·결과만. 이메일·키를 출력하지 않는다. 실패 시 `process.exitCode = 1`.
- 데모 조직에 관리자를 지정하지 않는다. 이유: 데모 조직에 `admin_events`가 생기면 `seed-demo.ts`가 조직을 지울 수 없다.

### 6. 테스트 `tests/org-admin-routes.test.ts`

세션 클라이언트·`requireMembership`·`next/navigation`을 모킹한다(기존 라우트 테스트 방식).

- 모드 `off` → 모든 라우트 404 · 모드 `readonly` → 쓰기 라우트 404, 초대 목록 GET은 동작
- 본문의 `org_id`·`role`이 RPC 인자로 전달되지 않는다
- 42501/22023/P0001 → 403/400/409 매핑과 한국어 메시지
- 초대 생성 응답에 `Cache-Control: no-store`, 토큰은 `inviteUrl`에만 1회
- member가 부서장 라우트 → 403이고 RPC 미호출
- accept 라우트가 `console.*`에 토큰·표시 이름을 쓰지 않는다(spy)
- 콜백: 쿠키 next 우선 · 멤버십 없는 관리자 → `/admin` · 모드 off면 `admin_org_id` 미호출 → `/no-membership`
- signout: POST만 허용(GET 405)

## Acceptance Criteria

```bash
npm run test -- tests/org-admin-routes.test.ts tests/auth-redirect.test.ts tests/membership.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 요청 경로에 service role import 0 · 모든 라우트 첫 줄에 플래그 검사 · 조직·부서·역할 값을 본문에서 받지 않음 · 콜백이 외부 URL로 리다이렉트할 수 없음 · 로그에 이메일·토큰 없음 · `grant-org-admin.ts`가 데모 조직을 거부함.
3. `phases/10-org-admin/index.json` step 3을 갱신한다(summary: 라우트 목록, 테스트 수).

## 금지사항

- `grant-org-admin.ts`를 실행하지 마라. 이유: 운영 Auth·DB 쓰기는 O10 승인 범위다.
- 화면(`app/admin/**` 페이지, `components/**`)을 만들지 마라. 이유: step 4 범위다.
- 관리자 여부를 `org_admins` 직접 select로 판정하지 마라. `admin_org_id()` RPC만 쓴다. 이유: 테이블에 authenticated 정책이 없고, 판정은 SQL 한 곳이다.
- Supabase 대시보드 설정(Redirect URL·이메일 템플릿)을 바꾸는 전제의 코드를 쓰지 마라. 이유: 외부 설정 변경은 이 step이 할 수 없다.
- 기존 라우트의 동작을 바꾸지 마라. `proxy.ts`는 matcher 추가만 한다.
