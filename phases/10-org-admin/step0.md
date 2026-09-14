# Step 0: admin-schema-read

## 읽어야 할 파일

먼저 아래 파일을 읽고 설계 의도를 파악하라:

- `/docs/PRD.md` §3-2 (phase `10-org-admin` 행) · §11 "조직 관리자 (ADR-044)" 행
- `/docs/ARCHITECTURE.md` §6 불변식 1·2·3·12 · §6-2 불변식 17·18·19·22
- `/docs/ADR.md` ADR-044 전체
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-3 권한 원칙 · §B-5 데이터 · §B-6 RPC 계약(이 step은 **읽기 RPC와 데모 래퍼**만) · §L4 · §L5 · §R R-1·R-2·R-5
- `supabase/migrations/0002_can_see_rls.sql` (`can_see`, `is_demo_department`, anon 데모 읽기 정책 295행~)
- `supabase/migrations/0013_authenticated_write_boundaries.sql` (members 컬럼 UPDATE·guard 트리거)
- `supabase/migrations/0017_card_decision_boundaries.sql` 319행·553행 (함수 권한 회수 패턴)
- `supabase/migrations/0023_agent_roles.sql`, `0024_agent_roles_demo_read.sql`, `0025_ingestion_write_boundaries.sql`
- `scripts/verify-security-sql.mjs` — 41~56행 헬퍼(`check`·`asUser`·`denied`), 58~68행 부트스트랩, 69~91행 마이그레이션 적용 순서, 178~205행 쓰기 경계 행렬, 659~700행 4조직 행렬, 701행 출력

## 작업

마이그레이션 `supabase/migrations/0026_org_admin.sql`의 **읽기 쪽**을 만든다. 쓰기 RPC는 step 1이 같은 파일에 추가한다.

### 1. 하니스 부트스트랩 보강 (`scripts/verify-security-sql.mjs`)

- 58~68행 부트스트랩에 `auth.users.email text` 컬럼과 `auth.jwt()` 스텁을 추가한다. `auth.jwt()`는 `request.jwt.claims` 설정값(JSON)을 jsonb로 돌려주고, 없으면 `'{}'`. 기존 픽스처 사용자에게 합성 이메일을 채운다.
- `asUser`와 같은 방식의 `asUserWithEmail(id, email, fn)` 헬퍼를 추가한다. `request.jwt.claim.sub`·`request.jwt.claim.role`과 함께 `request.jwt.claims`에 `{sub, role:"authenticated", email}`을 넣고 finally에서 되돌린다.
- 89~91행의 "0017 이후 전부 적용" 루프를 **0025까지 적용 → Supabase 기본 함수 권한 재현 → 0026 이후 적용**으로 나눈다. 재현 SQL: `alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`. 0026 앞에서만 켜는 이유: 실제 Supabase는 이 기본 권한 때문에 `revoke … from public`만으로는 anon·authenticated 실행 권한이 남는다. 기존 마이그레이션의 판정은 이번 범위가 아니므로 바꾸지 않는다.

### 2. 스키마 (설계 §B-5)

- `create schema private;` 후 `revoke all on schema private from public, anon, authenticated, service_role;`
- `org_admins`, `member_invites`, `admin_events` 테이블을 §B-5대로 만든다. 추가·변경 사항:
  - `member_invites`에 `used_token_hash text unique` 컬럼을 둔다. 수락·철회 때 `token_hash`를 `'void:'||id`로 바꾸면서 원래 해시를 여기로 옮긴다. 이유: 재사용은 막으면서 미리보기에서 "수락됨/철회됨"을 보여줄 수 있다.
  - `member_invites.email_normalized`에 `check (email_normalized = lower(btrim(email_normalized)))`.
  - `admin_events.action` check 값은 §B-5의 8개에 `member_invite`, `lead_promote`를 더한 10개다. 이유: 부서장의 초대·승격도 권한 상승 경로라 조직 관리자가 볼 수 있어야 한다(플랜 design_deltas).
- `departments`에 `unique (id, org_id)` 제약과 `create unique index … on departments (org_id, lower(name))`.
- 세 테이블 모두 RLS를 켜고 **정책을 만들지 않는다**. `revoke all … from anon, authenticated`, `grant all … to service_role`. `admin_events`는 `revoke update, delete … from public, anon, authenticated, service_role`.

### 3. 판정 함수와 읽기 RPC (설계 §B-6 읽기 행)

모든 함수는 `security definer set search_path = public, pg_temp`. 생성 직후 `revoke all on function … from public, anon, authenticated, service_role;` 뒤 아래 표의 역할에만 `grant execute`.

| 함수 | grant | 반환 |
|---|---|---|
| `private.is_org_admin(p_user uuid, p_org uuid) returns boolean` | 없음 | 조직 관리 판정 **유일한 곳** |
| `public.admin_org_id() returns uuid` | authenticated | `auth.uid()`가 관리하는 조직(가장 먼저 지정된 1개), 아니면 null |
| `private._admin_overview(p_org uuid) returns jsonb` | 없음 | `{org_name, departments:[{dept_id, name, lead_names, member_count, consented_count, active_source_count, decisions_30d, answers_30d}], llm_calls_this_month}` |
| `private._admin_members(p_org uuid) returns jsonb` | 없음 | 배열 `[{user_id, display_name, email, dept_id, dept_name, role, consented_at, consent_version, slack_linked}]` |
| `private._admin_sources(p_org uuid) returns jsonb` | 없음 | `[{source_id, dept_id, dept_name, kind, title, visibility, is_principles, active, item_count, last_synced_at, has_error}]` |
| `private._admin_answer_stats(p_org uuid, p_from date, p_to date) returns jsonb` | 없음 | `[{day, dept_id, dept_name, answered, refused, failed, cited_dept, cited_leads_only, cited_decisions}]` — `day`는 KST 날짜. 범위가 31일 초과·역순이면 `invalid_range` |
| `public.admin_overview()`·`admin_members()`·`admin_sources()`·`admin_answer_stats(p_from date, p_to date)` | authenticated | 첫 줄에서 `admin_org_id()`가 null이면 `raise exception 'forbidden' using errcode = '42501'` 후 내부 함수 호출 |
| `public.admin_invites() returns jsonb` | authenticated | 대기 중 초대 `[{invite_id, dept_id, dept_name, email, role, invited_by_role, expires_at, created_at}]` |
| `public.admin_events_list(p_limit int) returns jsonb` | authenticated | `[{event_id, created_at, actor_label, action, dept_name, target_user_label}]` — 이름은 읽을 때 붙이고 없으면 `(삭제된 사용자)`. `p_limit` 1~100 |
| `public.demo_admin_overview()`·`demo_admin_members()`·`demo_admin_sources()`·`demo_admin_answer_stats(p_from date, p_to date)` | anon | 조직 인자 없음. SQL이 `is_demo = true` 조직을 고른다. `demo_admin_members`는 `email`·`user_id` 키를 뺀다. 초대·관리 기록 래퍼는 만들지 않는다 |

- 답변 집계는 **일별·부서별**만 반환한다. 답변 한 건 단위의 id·시각, 질문 원문, `asked_by`, 인용 quote를 어떤 응답에도 넣지 않는다(설계 §B-6, R-5). "위반 N건" 같은 판정 값을 만들지 않는다.
- `can_see()`를 수정하지 않는다. 조직 관리자 권한은 부서 콘텐츠 열람에 아무것도 더하지 않는다.
- pgcrypto 함수(`gen_random_bytes`·`digest`)를 쓰지 않는다. 이유: Supabase는 pgcrypto를 `extensions` 스키마에 두어 `search_path = public, pg_temp`에서 풀리지 않는다. 필요하면 내장 `gen_random_uuid()`·`sha256(bytea)`만 쓴다.

### 4. 롤백 SQL

`supabase/rollback/0026_org_admin_down.sql`을 만든다. 이 step이 만든 함수·인덱스·제약·테이블·`private` 스키마를 역순으로 제거한다. `supabase/rollback/`은 `db push` 대상이 아니며 컷 판정 때 사람이 실행한다(파일 머리 주석에 명시).

### 5. 하니스 케이스 (`check(...)`로 추가)

픽스처: 비데모 조직 A·B 각각에 관리자 1명(부서 멤버 아님), A에 부서 2개(부서장·멤버·동의 상태 섞음, 소스·items·answers·citations 포함), A 관리자가 A의 부서 1곳 멤버이기도 한 사용자 1명.

1. anon·authenticated로 `private._admin_overview(...)` 직접 호출 → 42501.
2. 신규 함수 전부에 대해 `has_function_privilege`: PUBLIC 없음 · anon은 `demo_admin_*`만 · authenticated는 `admin_*`만 · `private.*`는 anon·authenticated·service_role 모두 없음.
3. 관리자가 아닌 authenticated가 읽기 RPC 5종 호출 → `forbidden`(42501).
4. A 관리자 `admin_overview()` → A 부서만 · 키 집합이 표와 정확히 일치 · 응답 전체를 재귀로 훑어 `question`·`content`·`quote`·`asked_by`·`answer` 키 0개.
5. A 관리자 `admin_members()` → A 사용자만, B 사용자 0명.
6. `admin_answer_stats` → 픽스처 답변 수와 일별·부서별 합계 일치 · 32일 범위 → `invalid_range` · 행 키에 id·시각 없음.
7. anon `demo_admin_members()` → 데모 조직만 · `email`·`user_id` 키 없음. authenticated의 `demo_admin_*` 호출 → 42501.
8. 부서 X 멤버이면서 A 관리자인 사용자가 멤버가 아닌 부서 Y의 `items`·`answers`·`decision_requests` select → 0행 (관리자 권한이 `can_see`에 더하는 것 없음).
9. 세 테이블 RLS 활성 + 정책 0개 · 기존 쓰기 경계 행렬 통과(세 테이블이 허용 목록에 없음) · service_role의 `admin_events` update/delete → 42501.
10. 같은 조직에서 대소문자만 다른 부서 이름 insert(service_role) → unique 위반.
11. **하니스 맨 끝**에 롤백 블록을 만든다: `0026_org_admin_down.sql` 적용 → `to_regclass('public.org_admins')` 등 null · `private` 스키마 없음. 이후 phase가 자기 down을 이 블록 앞에 역순으로 추가한다.

## Acceptance Criteria

```bash
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # 기존 67 + 신규 케이스 전부 통과, 출력 JSON의 failed 0
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: 조직 판정이 `private.is_org_admin` 한 곳뿐인가 · 모든 공개 RPC가 조직 id를 인자가 아니라 `auth.uid()`에서 정하는가 · 신규 함수마다 revoke 4역할 + 최소 grant가 있는가 · 응답에 본문·질문·질문자 키가 없는가 · `can_see()` diff가 0인가.
3. `phases/10-org-admin/index.json` step 0을 갱신한다. summary에 테이블·함수 이름, 추가 케이스 수, 하니스 출력의 passed 값을 적는다.

## 금지사항

- 운영 Supabase에 `db push` 하지 마라. 이유: 0026 운영 적용은 O10(사용자 승인)이고, 0025가 먼저 운영에 들어가야 한다.
- 기존 마이그레이션 파일(0001~0025)을 수정하지 마라. 이유: 운영 DB에 이미 적용됐거나 적용 대기 중이다.
- 세 관리 테이블에 authenticated·anon 정책을 만들지 마라. 이유: 읽기·쓰기는 RPC만 한다(설계 §B-5).
- `members.role` 직접 조회로 부서장 판정을 새로 만들지 마라. 부서 콘텐츠 판정은 `can_see(..., 'leads_only')`다. 이유: 판정이 두 곳이면 어긋난다.
- 쓰기 RPC(부서 생성·초대·수락·강등·제외)를 이 step에서 만들지 마라. 이유: step 1 범위다.
- 앱 코드(`app/`·`components/`·`lib/`)를 수정하지 마라.
