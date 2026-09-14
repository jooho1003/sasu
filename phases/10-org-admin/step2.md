# Step 2: admin-contracts

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3.6 계약은 `contracts.ts` 단일 소스 · §8 테스트 경계
- `/docs/PRD.md` §8-2 "2026-09-15 확대 범위 컷 라인" 표 (컷 ②·⑤)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-6 · §B-7 · §L1 4·6·7
- step 0·1 산출물: `supabase/migrations/0026_org_admin.sql` (RPC 반환 키와 오류 코드가 이 step 계약의 원천)
- `lib/contracts.ts` (기존 Zod 스타일), `lib/site.ts`·`tests/site.test.ts` (환경 변수 해석 함수 스타일)
- `lib/supabase/membership.ts` 18~45행 `sanitizeInternalPath`, `tests/membership.test.ts`
- `app/auth/callback/route.ts`, `app/login/login-form.tsx` (현재 `next`를 전달하지 않는다)

## 작업

순수 모듈과 계약만 만든다. 라우트·화면은 다음 step이다. 새 `lib/` 모듈은 **테스트를 먼저** 쓴다(`tests/<name>.test.ts`).

### 1. `lib/features.ts` (신규, TDD)

```ts
export type OrgAdminMode = "off" | "readonly" | "on";
export function orgAdminMode(env?: Readonly<Record<string, string | undefined>>): OrgAdminMode;
export function orgAdminReadEnabled(env?): boolean;   // readonly | on
export function orgAdminWritesEnabled(env?): boolean; // on
```

- 변수는 `SASU_ORG_ADMIN_MODE`. 정확히 `readonly`·`on`일 때만 그 값, 그 밖(빈 값·오타·대문자)은 `off`. 이유: 컷은 플래그 끄기이고 잘못된 값은 닫힌 쪽이어야 한다.
- 이후 phase가 같은 파일에 예고편 플래그를 추가한다. 이번에는 조직 관리 플래그만 둔다.

### 2. `lib/auth-redirect.ts` (신규, TDD)

- `sanitizeInternalPath`를 이 파일로 옮기고 `lib/supabase/membership.ts`는 re-export한다. 이유: 로그인 폼(클라이언트)이 서버 전용 모듈을 import하지 않게 한다. 기존 `tests/membership.test.ts`는 수정 없이 통과해야 한다.
- `export const LOGIN_NEXT_COOKIE = "sasu_login_next";`
- `export function loginNextCookieValue(next: string | null | undefined): string | null` — 정리된 내부 경로만, `/login`·`/auth/`로 시작하면 null.
- `export function resolvePostLoginPath(input: { next: string | null; firstDeptId: string | null; isOrgAdmin: boolean; adminReadEnabled: boolean }): string`
  - 정리된 `next`가 있으면 그 경로
  - 없고 부서 멤버십이 있으면 `/d/<firstDeptId>`
  - 없고 `isOrgAdmin && adminReadEnabled`면 `/admin`
  - 그 밖은 `/no-membership`
- 결정: 로그인 `next`는 `emailRedirectTo` 쿼리가 아니라 이 쿠키(최대 10분)로 콜백에 넘긴다. 이유: 쿼리를 붙이면 Supabase Auth Redirect URL 허용 목록과 어긋나 매직링크가 깨질 수 있다(플랜 design_deltas).

### 3. `lib/org-admin.ts` (신규, TDD)

- `export function normalizeEmail(raw: unknown): string | null` — `btrim`·소문자, 단순 형식 검사. SQL이 최종 판정이고 이 함수는 400을 먼저 돌려주는 용도다.
- `export function answerStatsRange(input: { from?: string; to?: string; today: string }): { from: string; to: string } | { error: "invalid_range" }` — 기본 최근 14일(KST 날짜 문자열), 최대 31일, 역순 거부.
- `export function inviteUrl(origin: string, token: string): string` — `/invite/<token>`.
- `export function adminErrorMessage(code: string): string` — step 1의 오류 코드 전부를 한국어 문장으로. 알 수 없는 코드는 "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." 문장에 "감시"·"위반" 같은 단어를 쓰지 않는다.

### 4. `lib/contracts.ts` 추가

RPC 응답은 `z.strictObject`로 키를 고정한다. 키는 step 0·1 SQL의 반환과 **정확히** 같아야 한다.

- `AdminOverview`, `AdminMemberRow`, `DemoAdminMemberRow`(email·user_id 없음), `AdminInviteRow`, `LeadInviteRow`, `AdminSourceRow`, `AdminAnswerStatRow`, `AdminEventRow`, `InvitePreview`(status enum 4개), `InviteCreated`(`invite_id`, `token`, `expires_at`)
- 요청 본문: `CreateDepartmentBody {name}`, `InviteEmailBody {email}`, `AcceptInviteBody {token, displayName}`, `MemberTargetBody {userId, deptId}`
- 테스트(`tests/contracts.test.ts` 확장): 여분 키가 붙은 응답을 거부한다 · `DemoAdminMemberRow`가 `email` 키를 거부한다.

## Acceptance Criteria

```bash
npm run test -- tests/features.test.ts tests/auth-redirect.test.ts tests/org-admin.test.ts tests/contracts.test.ts tests/membership.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # 회귀 없음
```

## 검증 절차

1. AC를 실행한다. 새 모듈마다 테스트 파일이 구현보다 먼저 생겼는지(작업 순서) 확인한다.
2. 체크리스트: `lib/features.ts`의 잘못된 값이 모두 `off`인가 · `resolvePostLoginPath`가 외부 URL·`//`·`/\`를 따르지 않는가 · Zod 키가 SQL 반환과 일치하는가(0026을 다시 읽어 대조).
3. `phases/10-org-admin/index.json` step 2를 갱신한다.

## 금지사항

- 라우트·페이지·컴포넌트를 만들거나 고치지 마라. 이유: step 3·4 범위다.
- 권한 판정 로직(관리자 여부, 부서장 여부)을 TS에 만들지 마라. 이유: 판정은 SQL(`private.is_org_admin`, `can_see`)만 한다. TS는 UX용 입력 검증과 문구만 가진다.
- `sanitizeInternalPath`의 동작을 바꾸지 마라. 옮기기만 한다.
- 마이그레이션을 수정하지 마라. 키가 안 맞으면 SQL이 아니라 이 step의 스키마를 SQL에 맞춘다. SQL이 설계와 다르면 `blocked`로 보고한다.
