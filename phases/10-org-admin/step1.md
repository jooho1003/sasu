# Step 1: admin-schema-write

## 읽어야 할 파일

- `/docs/PRD.md` §11 "조직 관리자 (ADR-044)" 행
- `/docs/ARCHITECTURE.md` §6-2 불변식 17·18·19 · 상태 추가(`member_invites`)
- `/docs/ADR.md` ADR-044 2·4항
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-3 작업 표 · §B-6 RPC 계약(쓰기 행과 `invite_preview`·`accept_invite`) · §L3 엣지 케이스 표 · §L4 4·5 · §L5 4·7 · §R R-2·R-6
- step 0 산출물: `supabase/migrations/0026_org_admin.sql`, `supabase/rollback/0026_org_admin_down.sql`, `scripts/verify-security-sql.mjs`(`asUserWithEmail`, 롤백 블록)
- `supabase/migrations/0013_authenticated_write_boundaries.sql` (`members_write_guard` 트리거가 definer 함수의 insert·update에 어떻게 반응하는지 확인)
- `supabase/migrations/0002_can_see_rls.sql` (`can_see`, `is_demo_department`)

## 작업

같은 `0026_org_admin.sql`에 쓰기 RPC를 추가한다. 공통 규칙은 step 0과 같다: `security definer set search_path = public, pg_temp` · 생성 직후 `revoke all … from public, anon, authenticated, service_role` → 최소 grant · 조직 id는 인자가 아니라 SQL이 정한다 · 대상 행(부서·사용자·초대)의 `org_id`가 호출자의 조직과 같은지 SQL에서 확인하고 다르면 `forbidden`(42501).

### 1. 토큰 규칙

- 토큰 원문: `replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')` (64자 hex). 해시: `encode(sha256(convert_to(token,'UTF8')),'hex')`. pgcrypto를 쓰지 않는다(step 0 금지사항과 같은 이유).
- 원문은 생성 RPC 응답에서 **한 번만** 반환하고 어디에도 저장하지 않는다.
- 수락·철회 시 `used_token_hash := token_hash`, `token_hash := 'void:'||id`.

### 2. RPC (grant는 모두 authenticated, `invite_preview`만 anon·authenticated)

| RPC | 규칙 | 오류 코드 |
|---|---|---|
| `admin_create_department(p_name text) returns uuid` | 관리자만. 이름 `btrim` 1~40자, 조직 안 대소문자 무시 중복 금지. `admin_events` `department_create` `{dept_id}` | `forbidden` · `invalid_department_name` · `department_name_taken` |
| `admin_invite_first_lead(p_dept uuid, p_email text) returns table(invite_id uuid, token text, expires_at timestamptz)` | 관리자·같은 조직 부서·비데모. **멤버 0명 부서만**. `lower(btrim(p_email))`이 `lower(auth.jwt()->>'email')`와 같으면 거부. 조직 대기 초대 100개 상한. role `lead`, `invited_by_role` `org_admin`, 만료 7일. 기록 `first_lead_invite` `{dept_id, invite_id}` | `forbidden` · `department_not_empty` · `self_invite_forbidden` · `invalid_email` · `invite_pending` · `invite_limit` |
| `lead_invite_member(p_dept uuid, p_email text)` 반환은 위와 같음 | `can_see(auth.uid(), p_dept, 'leads_only')` 그리고 비데모. role은 **항상 `member`**(인자로 받지 않는다). 이미 멤버면 거부. 기록 `member_invite` | `forbidden` · `already_member` · `invalid_email` · `invite_pending` · `invite_limit` |
| `lead_invites(p_dept uuid) returns jsonb` | 부서장만. 그 부서 대기 초대 `[{invite_id, email, role, expires_at, created_at, created_by_label}]`. 토큰·해시 없음. S5 화면용(설계 표에 없던 읽기 RPC, 플랜 design_deltas) | `forbidden` |
| `lead_promote_member(p_user uuid, p_dept uuid)` | 부서장만·비데모. 대상 role `member` → `lead`. 기록 `lead_promote` | `forbidden` · `not_member` · `already_lead` |
| `revoke_invite(p_invite uuid)` | 조직 관리자: 자기 조직의 대기 초대 전부 · 부서장: 자기 부서의 `invited_by_role='lead'` 초대. 기록 `invite_revoke` `{dept_id, invite_id}` | `forbidden` · `invite_not_pending` |
| `demote_lead(p_user uuid, p_dept uuid)` | 같은 조직 관리자 또는 그 부서장. 부서 멤버 행을 `for update`로 잠근 뒤 다른 부서장이 없으면 거부. 기록 `lead_demote` | `forbidden` · `not_lead` · `last_lead` |
| `remove_member(p_user uuid, p_dept uuid)` | 같은 조직 관리자 또는 그 부서장. 멤버십 행만 삭제(과거 기록은 기존 정책대로 유지). 마지막 부서장이면 거부. 기록 `member_remove` | `forbidden` · `not_member` · `last_lead` |
| `invite_preview(p_token text) returns jsonb` | `{org_name, dept_name, role, email_masked, status}`. `status`: `valid`·`expired`(token_hash로 찾음) / `accepted`·`revoked`(used_token_hash로 찾음). 못 찾으면 null. `email_masked`는 로컬 파트 앞 2자 + `***@` + 도메인 | — |
| `accept_invite(p_token text, p_display_name text) returns uuid` | `token_hash`로 찾아 `for update`. 만료 거부 · `lower(auth.jwt()->>'email')` ≠ 초대 이메일이면 거부 · 표시 이름 `btrim` 1~40자 · 이미 그 부서 멤버면 role을 바꾸지 않고 수락 처리 · 아니면 `members` insert(`consented_at` null) · `accepted_at/by` 기록 · 해시 이동 · 기록 `invite_accept` `{dept_id, invite_id, user_id}` · dept_id 반환. `used_token_hash`로 찾았고 같은 사용자가 이미 수락했다면 같은 dept_id 반환(두 탭 멱등), 아니면 `invite_used`/`invite_revoked` | `not_authenticated` · `invite_not_found` · `invite_expired` · `invite_used` · `invite_revoked` · `invite_email_mismatch` · `invalid_display_name` |

- 오류는 `raise exception '<code>' using errcode = …`로 올린다. 권한 계열은 42501, 입력 계열은 22023, 상태 충돌(`department_not_empty`·`invite_pending`·`last_lead` 등)은 P0001. 라우트(step 3)가 이 코드로 HTTP 상태를 정한다.
- `admin_events.target`에는 id만 넣는다. 이메일·이름·토큰을 넣지 않는다(설계 §L5 7).
- **관리자가 멤버를 부서장으로 올리는 RPC를 만들지 마라.** 승격은 `lead_promote_member`(부서장)뿐이다(ADR-044 2).
- `members_write_guard`가 definer 함수 안의 insert·update를 막으면 트리거를 느슨하게 바꾸지 말고 `blocked`로 보고한다. 이유: 0013 경계 변경은 이 step이 판정할 수 없다.

### 3. 롤백 SQL

`supabase/rollback/0026_org_admin_down.sql`에 이 step의 함수를 추가한다(테이블보다 먼저 제거).

### 4. 하니스 케이스

1. **다른 조직 대상**: A 관리자가 B의 부서·사용자·초대로 `admin_invite_first_lead`·`revoke_invite`·`demote_lead`·`remove_member` 호출 → 각각 `forbidden`.
2. 멤버가 있는 부서에 관리자 초대 → `department_not_empty`. 자기 이메일 → `self_invite_forbidden`.
3. `admin_%promote%` 이름의 함수가 존재하지 않는다(`pg_proc` 조회).
4. member가 `lead_invite_member`·`lead_promote_member`·`lead_invites` 호출 → `forbidden`. 데모 부서 대상 → `forbidden`.
5. 마지막 부서장 `demote_lead`·`remove_member` → `last_lead`.
6. 초대 흐름(`asUserWithEmail`): 관리자가 빈 부서에 첫 부서장 초대 → `invite_preview` = `valid` → 다른 이메일로 수락 → `invite_email_mismatch` → 같은 이메일로 수락 → `members` 행 생성(role `lead`, `consented_at` null, 표시 이름 저장) → `invite_preview` = `accepted` → 같은 사용자 재수락 → 같은 dept_id → 다른 사용자가 같은 토큰 → `invite_used`.
7. 철회 → 미리보기 `revoked` → 수락 → `invite_revoked`. service_role로 `expires_at`을 과거로 → `invite_expired`.
8. 같은 부서·이메일 대기 초대 2회 → `invite_pending`. service_role로 대기 초대 100개 삽입 후 초대 → `invite_limit`.
9. 수락된 초대의 `token_hash`가 `'void:'`로 시작하고 원래 해시는 `used_token_hash`에 있다.
10. 모든 쓰기 RPC 뒤 `admin_events.target`을 훑어 `@` 문자 0개, 키는 `dept_id`·`invite_id`·`user_id`만.
11. 대소문자만 다른 부서 이름 생성 → `department_name_taken`.
12. step 0의 함수 권한 케이스를 신규 함수까지 확장해 다시 통과. 맨 끝 롤백 블록이 신규 함수까지 제거.

## Acceptance Criteria

```bash
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: 권한을 올리는 경로가 `accept_invite`(초대받은 본인)·`lead_promote_member`·`lead_invite_member`(부서장) 세 곳뿐인가 · 관리자 경로는 빈 부서 첫 부서장과 권한 축소뿐인가 · 토큰 원문이 테이블·기록 어디에도 없는가 · 모든 RPC에 조직 일치 검사가 있는가.
3. `phases/10-org-admin/index.json` step 1을 갱신한다(summary: RPC 이름, 오류 코드 목록, 하니스 passed 값).

## 금지사항

- 운영 DB에 적용하지 마라. 이유: O10 승인 노드다.
- `can_see()`·기존 정책·0001~0025를 수정하지 마라.
- 초대 토큰·이메일을 `raise notice`·로그·`admin_events`에 남기지 마라. 이유: 토큰이 곧 권한이다(설계 §L4 4·5).
- 관리자 추가 RPC나 `orgs` 쓰기 RPC를 만들지 마라. 이유: 첫 관리자는 운영 스크립트만 지정한다(ADR-044 7), `orgs`는 사용자 접근이 없다(불변식 12).
- 앱 코드를 수정하지 마라. 이유: step 2~4 범위다.
