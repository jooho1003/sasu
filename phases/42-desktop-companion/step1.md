# Step 1: device-links-schema

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` §6 불변식 1·2·3·12·16·19·22, §6-11 불변식 45~49
- `docs/ADR.md` ADR-081 결정 4·10
- `docs/02-design/features/desktop-companion.design.md` §3(데이터 모델 전체)·§7(S2·S10)
- `docs/verification/42-desktop-companion/gates.md` (step 0의 G1·G2 결과)
- `supabase/migrations/0066_sales_review.sql`·`0067_sales_review_revision.sql` (함수·권한·RLS 관례)
- `supabase/migrations/0026_org_admin.sql`(`private` 스키마), `0036_*.sql`(데모 계정 `99999999-9999-4999-8999-999999999991` 판정)
- `supabase/rollback/` 기존 `*_down.sql` 관례
- `scripts/verify-security-sql.mjs` (PGlite 스텁·쓰기 매트릭스·함수 권한 배열), `scripts/verify-sales-review-sql.mjs`(기능별 하니스 예)

## 작업

1. 마이그레이션 번호: `supabase/migrations/`의 가장 큰 번호 다음을 쓴다. 설계는 `0069`를 가정한다. 다른 번호가 되면 summary에 실제 번호를 적는다.
2. `supabase/migrations/00NN_device_links.sql` — design §3.1 표·인덱스·RLS·권한과 §3.2 함수 4개를 그대로 만든다.
   - `private.current_session_id() returns uuid` — `nullif(auth.jwt()->>'session_id','')::uuid`.
   - `public.link_device(p_dept uuid, p_device_name text, p_app_version text) returns uuid`
   - `public.companion_context() returns table(link_id uuid, dept_id uuid, dept_name text, role text, display_name text, consented_at timestamptz)`
   - `public.revoke_device_link(p_link uuid) returns boolean`
   - 핵심 규칙(바꾸지 마라):
     - 모든 함수 `security definer set search_path = public, pg_temp`. `revoke all … from public, anon, authenticated, service_role` 뒤 공개 3개만 `grant execute … to authenticated`. `private` 함수는 grant 없음.
     - `device_links`는 `select`만 authenticated에 주고(본인 행 RLS), insert·update·delete는 함수로만 한다.
     - `link_device`: 세션 ID 없음 `22023`, 비멤버·미동의·데모 부서(`orgs.is_demo`)·데모 계정 `42501`, 본인 활성 연결 5개 이상 `P0001 device_link_limit`. 같은 세션의 기존 활성 행은 `relink`로 해제한 뒤 새 행.
     - `companion_context`: 현재 세션의 활성 행과 **현재** `members` 행을 조인. 멤버 행이 없으면 그 연결을 `membership`으로 해제하고 0행. `last_seen_at`은 5분보다 오래되었을 때만 갱신.
     - `revoke_device_link`: `user_id = auth.uid()`인 활성 행만. 현재 세션의 행이면 사유 `signout`, 아니면 `user`. **같은 트랜잭션에서** `delete from auth.sessions where id = auth_session_id and user_id = auth.uid()`.
     - 오류 메시지에 다른 사용자·부서의 존재를 드러내지 않는다.
3. `supabase/rollback/00NN_device_links_down.sql` — 함수 4개·표를 제거한다.
4. `scripts/verify-security-sql.mjs` — PGlite에 `auth.sessions(id uuid primary key, user_id uuid)` 스텁과 `auth.jwt()`의 `session_id` 스텁을 추가하고, 쓰기 매트릭스(`device_links`: authenticated 쓰기 없음)·함수 권한 배열에 새 함수를 등록한다.
5. `scripts/verify-device-links-sql.mjs`(새로) — design §3.3의 8개 사례를 PGlite로 검증한다: 본인만 읽기 · 다른 사용자 행 0건 · 미동의/비멤버/데모 부서/데모 계정 연결 거부 · 6번째 연결 거부 · 재연결 시 이전 행 `relink` · 멤버십 삭제 뒤 `companion_context` 0행·자동 해제 · 해제 시 `auth.sessions` 행 삭제 · 다른 사람 연결 해제 false.
6. 로컬 QA Supabase에 적용해 step 0 G1 결과와 같게 동작하는지(실제 `auth.sessions` 삭제) 한 번 더 확인하고 `docs/verification/42-desktop-companion/schema.md`에 적는다.

## 코드 관계와 구조 확인

Graft로 `members`·`departments`·`orgs`를 참조하는 RLS·함수 목록과 새 함수의 의존을 확인한다. 도구가 없으면 수동 확인 범위를 `schema.md`에 적는다.

## Acceptance Criteria

```powershell
node scripts/verify-security-sql.mjs
node scripts/verify-device-links-sql.mjs
npm run lint
npm run build
npm run test
git diff --check
```

- 하니스 출력의 failed 0, 새 8개 사례 모두 passed.
- 새 함수 4개의 `public`·`anon` 실행 권한 0(하니스 `has_function_privilege`).

## 검증 절차

1. 위 AC를 실행한다.
2. 아키텍처 체크리스트: `can_see()` 판정을 복제하지 않았는가(멤버십 확인만 하고 가시성은 다루지 않음) · 요청 경로 service role 없음 · 함수 권한 최소화.
3. `phases/42-desktop-companion/index.json` step 1을 갱신한다.

## 금지사항

- 운영 DB에 마이그레이션을 적용하지 마라. 이유: 불변식 22 — 보안 하니스·E2E·리뷰 뒤 사용자 승인으로만 적용한다.
- `device_links`에 authenticated의 insert/update/delete 권한이나 정책을 만들지 마라. 이유: 부서·세션 ID를 요청 본문에서 받지 않는다(불변식 3·46).
- `auth` 스키마에 표·함수를 만들지 마라. 이유: Supabase가 관리하는 스키마다. 읽기·행 삭제만 한다.
- `can_see()`를 수정하지 마라. 이유: 가시성 판정 단일 지점이다.
- 기존 테스트를 깨뜨리지 마라.
