# Step 10: auth-membership

## 읽어야 할 파일

- `/docs/PRD.md` **§6-9 권한 모델** — 특히 "신원 매핑"과 "클라이언트를 믿지 않는 곳"
- `/docs/PRD.md` **§2-4 유저 플로우**의 `L` 서브그래프 — 매직링크 → 멤버십 있음? → 없으면 "초대가 필요합니다"
- `/docs/PRD.md` **§5 화면 구성**(S1 라우트 `/d/[dept]`) · **§6-10 빈 상태** 표
- `/docs/ARCHITECTURE.md` **§2 디렉토리**(`app/(auth)/d/[dept]/`) · **§6 불변식 3**
- `/docs/ADR.md` **ADR-016**(이메일 일치 매핑)
- `/docs/setup-guide.md` **§3**(매직링크 활성화 — 사람 작업이고 이미 끝나 있다고 가정한다)
- 이전 step 산출물: `lib/supabase/server.ts`·`rls-client.ts`(step 4) · `supabase/migrations/0002_can_see_rls.sql`의 정책(step 2)

## 작업

### 1. 로그인

- `app/login/page.tsx` — 이메일 입력 → Supabase Auth 매직링크 발송. 성공 문구는 "메일함을 확인해주세요".
- `app/auth/callback/route.ts` — 매직링크 콜백에서 세션을 쿠키에 심고 `/d/[dept]`로 보낸다. 멤버십이 여러 개면 첫 번째, 없으면 `/no-membership`.
- 미들웨어 또는 레이아웃에서 세션 쿠키를 갱신한다(`@supabase/ssr` 권장 패턴).

### 2. 멤버십 게이트 — 이 step의 핵심

`app/(auth)/d/[dept]/layout.tsx`에서:

1. 세션을 읽는다. 없으면 `/login`으로 리다이렉트.
2. **URL의 `[dept]`가 이 사용자의 `members` 행에 있는지 서버에서 확인한다.** 없으면 404 또는 `/no-membership`.
3. 확인된 `dept_id`와 `role`을 하위 트리에 넘긴다.

**`dept_id`·`role`을 요청 본문이나 쿼리스트링에서 읽지 마라** (ARCHITECTURE §6 불변식 3). 세션과 멤버십만이 원천이다. URL의 `[dept]`는 멤버십 검증을 통과한 뒤에만 유효하다.

조회는 **세션 클라이언트**(`lib/supabase/server.ts`)로 한다. service role로 멤버십을 조회한 뒤 애플리케이션에서 비교하는 방식을 쓰지 마라 — step 4의 ESLint 규칙이 막는다.

### 3. `app/no-membership/page.tsx`

"초대가 필요합니다" 화면. PRD §2-4의 `L9` 노드다. 회원가입은 열려 있지만 부서 멤버십은 시드·lead 지정으로만 생긴다(PRD §6-9). 화면에 그 사실과 다음 행동(팀장에게 요청)을 적는다. "오류가 발생했습니다"만 있는 화면을 만들지 마라 (PRD §6-10 원칙).

### 4. 역할 유틸

```ts
// lib/auth.ts 가 아니라 서버 컴포넌트에서 직접 쓰는 얇은 헬퍼로 충분하다.
export async function requireMembership(deptSlugOrId: string): Promise<{
  userId: string; deptId: string; role: "lead" | "member"; displayName: string;
}>;
```

이 함수가 멤버십 검증의 **단일 진입점**이다. 각 페이지·라우트가 각자 멤버십을 조회하면 한 곳이 빠진다. `app/api/d/[dept]/*` 라우트도 이 함수를 쓴다(step 11·13).

`lib/` 아래에 두면 TDD 대상이 되므로, 순수하지 않은 이 헬퍼는 `lib/supabase/` 아래(예: `lib/supabase/membership.ts`)에 두어 TDD 허용 목록에 들어가게 한다. 순수 로직이 생기면 그때 분리한다.

### 5. `[dept]` 세그먼트의 의미

MVP는 부서 1개다. `[dept]`에는 부서 UUID를 그대로 쓴다. slug 체계를 새로 만들지 마라 — PRD에 없다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
test -f app/login/page.tsx || { echo "FAIL: 로그인 화면 없음"; exit 1; }
test -f app/no-membership/page.tsx || { echo "FAIL: 초대 필요 화면 없음"; exit 1; }
ls app/\(auth\)/d/\[dept\]/layout.tsx >/dev/null || { echo "FAIL: 멤버십 게이트 레이아웃 없음"; exit 1; }
# 요청 본문에서 dept_id 를 읽지 않는가
grep -rnE "body\.(dept_id|deptId)|searchParams\.get\(['\"]dept" app/ && { echo "FAIL: dept_id 를 클라이언트 입력에서 읽는다"; exit 1; }
# 요청 경로에서 service role 을 쓰지 않는가 (ESLint 가 이미 막지만 이중 확인)
grep -rn "supabase/service" app/\(auth\)/ && { echo "FAIL: 요청 경로에서 service role"; exit 1; }
echo "OK: auth & membership"
```

실제 로그인 왕복은 Supabase 프로젝트가 붙는 step 14 이후에 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `dept_id`·`role`이 세션·멤버십에서만 결정되는가? (ARCHITECTURE §6 불변식 3)
   - 멤버십 검증이 `requireMembership()` 한 곳에 모여 있는가?
   - 요청 경로에서 service role을 쓰지 않는가? (§6 불변식 2)
   - "초대가 필요합니다" 화면이 다음 행동을 알려주는가?
3. `phases/0-vertical-slice/index.json`의 step 10을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `requireMembership` 시그니처와 만든 라우트 목록 (step 11·13이 이걸 그대로 쓴다)
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- `dept_id`·`decided_by`·`asked_by`를 요청 본문·쿼리스트링에서 읽지 마라. 이유: ARCHITECTURE §6 불변식 3 — 클라이언트를 믿지 않는다.
- 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: ADR-024. step 4의 ESLint 규칙이 막는다.
- 버튼·링크를 숨기는 것으로 권한을 구현하지 마라. 이유: PRD §6-9 — "화면에서 버튼을 숨기는 것은 권한이 아니다". 집행은 서버와 RLS다.
- 회원가입·초대 플로우를 만들지 마라. 이유: PRD §8-1 — 파일럿 2팀은 수동 시드다.
- 슬랙 OAuth 로그인을 붙이지 마라. 이유: ADR-016 — 신원 매핑은 이메일 일치다.
- 부서 전환 UI를 만들지 마라. 이유: PRD §8-0 — MVP는 부서 1개다.
- 기존 테스트를 깨뜨리지 마라.
