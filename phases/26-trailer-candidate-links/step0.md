# Step 0: invite-schema

지원자별 개별 링크의 데이터·RPC·권한을 SQL로 만든다. 이 step은 TS를 건드리지 않는다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-2 (`26-trailer-candidate-links` 행) · §8-1 "조직별 개시" 행
- `/docs/ARCHITECTURE.md` §6 불변식 12·16·19 · §6-2 불변식 20·21·22
- `/docs/ADR.md` ADR-062 (전체) · ADR-045 2~4항 · ADR-047
- `docs/planning/예고편_지원자링크_설계.md` §1~§3·§6·§8 — 이 step의 명세
- `supabase/migrations/0026_org_admin.sql` — `member_invites`의 토큰 생성(`gen_random_uuid()` 2개 → 64자 hex)·`token_hash`·`void:` 전환·`invite_preview` anon 패턴. **그대로 따른다**
- `supabase/migrations/0027_trailer_publish.sql` — `public_trailer(p_slug)` anon RPC(발행 3조건 판정), 생성 카운터 패턴(`trailer_generation_counters`), 함수 권한 회수·grant 패턴
- `supabase/migrations/0028_trailer_assessment.sql` — `trailer_attempts`, `guard_trailer_attempt` 트리거, `create_trailer_attempt`
- `supabase/migrations/0001_schema_v1.sql` `jobs` 테이블(154행) · `lib/jobs.ts` 197행 `deterministicJobId` — SQL에서 재현하지 않는다(아래 4)
- `scripts/verify-trailer-assessment-sql.mjs`·`scripts/verify-security-sql.mjs` — 하니스 형식과 맨 끝 롤백 블록
- `supabase/rollback/0028_trailer_assessment_down.sql`

## 작업

마이그레이션 파일 1개를 만든다. 번호는 **작성 시점의 `supabase/migrations` 마지막 번호 + 1** (다른 세션이 0039를 쓸 수 있으므로 `ls`로 확인). 파일명 `00NN_trailer_invites.sql`. 공통 규칙은 0026~0028과 같다: SECURITY DEFINER + `set search_path = public, pg_temp` · 모든 신규 함수는 `revoke all … from public, anon, authenticated, service_role` 뒤 최소 grant · 해시는 내장 `sha256(convert_to(x,'UTF8'))`(pgcrypto 금지).

### 1. 스키마

`trailer_invites` — 설계 §2의 컬럼 그대로. 추가 제약:
- `email_normalized` = `lower(btrim())`, 1~254자, `@` 포함. `email_hash = encode(sha256(convert_to(email_normalized,'UTF8')),'hex')`.
- `token_hash text not null unique`, `used_token_hash text unique`(철회·파기 시 이전).
- `expires_at = created_at + interval '7 days'`. `open_failures int not null default 0`.
- `attempt_id uuid unique references trailer_attempts(id) on delete set null`.
- `status`는 컬럼이 아니라 **파생**(만료·철회·본인 철회·제출·채점 완료)으로, 부서장 목록 RPC에서 계산해 돌려준다. 저장 컬럼은 `revoked_at`·`withdrawn_at`·`purged_at`만.
- partial unique: `(trailer_id, email_hash) where revoked_at is null and withdrawn_at is null and email_hash is not null`.
- `trailer_attempts`에 `invite_id uuid unique references trailer_invites(id)` 추가. **이메일 컬럼을 attempt에 추가하지 않는다.**
- 트리거 BEFORE INSERT: `dept_id`·`org_id`를 `trailers`에서 채운다(요청값 무시). `orgs.is_demo`면 `raise exception 'demo_forbidden'` (42501).
- `guard_trailer_attempt` 보강: `kind='candidate'`이고 예고편 조직이 `is_demo`면 거부. 기존 `trailer_assessment_disabled` 검사는 유지.
- RLS: `revoke all on trailer_invites from public, anon, authenticated` → `grant select to authenticated` → 정책 `trailer_invites_lead_read for select to authenticated using (can_see(auth.uid(), dept_id, 'leads_only'))`. **anon 정책·데모 읽기 정책·쓰기 정책을 만들지 않는다.** service_role은 grant all.

### 2. 내부 함수 (`private.`)

- `private.trailer_invite_gate(p_trailer uuid) returns boolean` — 발행 3조건(`public_trailer`와 같은 판정) AND `orgs.trailer_assessment_enabled` AND NOT `orgs.is_demo`.
- `private.trailer_invite_lookup(p_token text, p_email text) returns public.trailer_invites` — `token_hash` 일치 행을 `for update`로 잡고, 없거나 만료·철회·본인 철회·파기·`open_failures >= 10`·게이트 false면 **모두 같은** `raise exception 'invite_unavailable'` (P0001). 이메일 해시 불일치면 `open_failures + 1` 저장 후 같은 오류. 토큰 형식(`^[0-9a-f]{64}$`) 위반도 같은 오류.
- `private.purge_trailer_invite(p_invite uuid, p_reason text)` — attempt 행 삭제(있으면), `email_normalized`·`email_hash` null, `token_hash := 'void:' || id`, `used_token_hash := 이전 token_hash`, `purged_at`(또는 `withdrawn_at`) 기록. 부서장 삭제·본인 철회·자동 파기가 **전부 이 함수**를 쓴다.

### 3. RPC

| 함수 | grant | 규칙 |
|---|---|---|
| `create_trailer_invites(p_trailer uuid, p_emails text[]) returns table(invite_id uuid, email text, token text, expires_at timestamptz, skipped_reason text)` | authenticated | `can_see(auth.uid(), dept_id, 'leads_only')` · 게이트 · 1회 ≤ 20개, 예고편당 활성 ≤ 200 · 정규화 후 중복·형식 오류·활성 링크 존재는 행을 만들지 않고 `skipped_reason`(`invalid_email`/`duplicate`/`active_exists`)만 반환 · 토큰 평문은 이 반환값에서만 나온다 |
| `revoke_trailer_invite(p_invite uuid) returns void` | authenticated | 부서장 · `revoked_at` + `void:` 전환. 이미 제출된 초대도 철회 가능(attempt는 남고 열람만 막힘) |
| `delete_trailer_invite(p_invite uuid) returns void` | authenticated | 부서장 · `private.purge_trailer_invite(id,'lead_deleted')` |
| `list_trailer_invites(p_trailer uuid) returns table(invite_id, email, status text, expires_at, first_opened_at, consented_at, submitted_at, attempt_status text, weighted_score numeric)` | authenticated | 부서장 · `status` ∈ `pending / opened / consented / submitted / scored / expired / revoked / withdrawn / purged`. **점수순 정렬 인자를 두지 않는다**(`created_at` 순 고정) |
| `trailer_invite_open(p_token text, p_email text) returns jsonb` | **anon**, authenticated | lookup → `first_opened_at` 없으면 기록 → `{scenarios, apply_url, org_display_name, state('consent_required'|'ready'|'submitted'|'withdrawn'), consent_version, expires_at}`. `org_display_name`은 `orgs`의 표시 이름 컬럼 1개(없으면 `orgs.name`). **dept_id·org_id·trailer_id·decision id를 반환하지 않는다** |
| `trailer_invite_consent(p_token, p_email, p_version text) returns void` | **anon**, authenticated | lookup → `consented_at`·`consent_version` 기록(이미 있으면 유지) |
| `submit_trailer_invite_attempt(p_token, p_email, p_submissions jsonb) returns table(attempt_id uuid)` | **anon**, authenticated | lookup → `consented_at is null`이면 `consent_required`(P0001) → `attempt_id is not null`이면 `already_submitted`(P0001) → `p_submissions` 배열 1~3개·`pg_column_size ≤ 65536` 아니면 `invalid_attempt`(22023) → `trailer_attempts` insert(`kind='candidate'`, `label='지원자 ' || lpad(발급순번,2,'0')`, `invite_id`) → `trailer_invites.attempt_id`·`purge_after = now() + interval '90 days'` → **같은 트랜잭션에서** `jobs(kind='score_trailer_attempt', payload=jsonb_build_object('attemptId', attempt_id))` insert(`id = gen_random_uuid()`) → 예고편당 하루 제출 카운터(0027 카운터 패턴, 상한 500) |
| `withdraw_trailer_invite_attempt(p_token, p_email) returns void` | **anon**, authenticated | lookup(단, `state='submitted'`도 통과) → `private.purge_trailer_invite(id,'withdrawn')` |
| `requeue_trailer_attempt_score(p_attempt uuid) returns void` | authenticated | 부서장 · `kind='candidate'`·`status='failed'`인 행만 `status='scoring', status_reason=null, result=null, weighted_score=null` 후 `jobs` insert |
| `purge_expired_trailer_invites() returns int` | **service_role만** (본문에서 `auth.role()` 재확인) | `purge_after < now()` 또는 (`attempt_id is null and expires_at + interval '90 days' < now()`) 인 미파기 행에 `private.purge_trailer_invite(id,'expired')` |

### 4. job id

`lib/jobs.ts`의 `deterministicJobId`(sha256 기반 UUID v5 모양)를 SQL에서 재현하지 않는다. 제출은 초대당 1회(`attempt_id unique`)라 중복 job이 생길 경로가 없고, 재채점은 `requeue_trailer_attempt_score`가 상태를 `failed → scoring`으로 바꾼 뒤에만 넣는다. 이유: `updated_at` 문자열 직렬화를 TS와 바이트 단위로 맞추는 것이 깨지기 쉽다.

### 5. 롤백 SQL

`supabase/rollback/00NN_trailer_invites_down.sql` — 함수·트리거 보강·`trailer_attempts.invite_id`·테이블·카운터 제거. 하니스 롤백 블록에서 **0028 down보다 먼저**.

### 6. 하니스 `scripts/verify-trailer-invites-sql.mjs`

기존 `verify-trailer-assessment-sql.mjs` 형식. 케이스:
1. 조직 플래그 off인 실제 조직: 부서장 `create_trailer_invites` → `invite_unavailable`(또는 게이트 코드). 켠 뒤 → 성공, 반환 토큰은 64자 hex, DB에는 `token_hash`만.
2. 데모 조직(`is_demo`): 플래그 on이어도 `create_trailer_invites` → `demo_forbidden`. service_role이 데모 부서에 `kind='candidate'` 직접 insert → 트리거 거부.
3. 발행 안 된(`review`) 예고편 → 거부. 철회(`unpublished`) 후 기존 초대의 `trailer_invite_open` → `invite_unavailable`.
4. anon `trailer_invite_open`: 올바른 토큰+이메일 → scenarios 반환, `first_opened_at` 기록, 반환 jsonb에 `dept_id`·`org_id`·`trailer_id` 키 없음. 틀린 이메일 10회 → 11번째는 올바른 이메일로도 `invite_unavailable`.
5. 동의 전 제출 → `consent_required`. 동의 후 제출 → `trailer_attempts` 1행(`kind='candidate'`, `label` 비식별, `invite_id` 연결) + `jobs` 1행(`kind='score_trailer_attempt'`). 같은 토큰 재제출 → `already_submitted`, 행 수 그대로.
6. `withdraw_trailer_invite_attempt` → attempt 삭제, `email_normalized`·`email_hash` null, `token_hash`가 `void:`로 시작, 같은 토큰 재열람 → `invite_unavailable`. `list_trailer_invites`에서 해당 행 `status='withdrawn'`, `email` null.
7. `purge_expired_trailer_invites`: `purge_after`를 과거로 강제한 행 → 파기, 반환 건수 1. anon·authenticated 호출 → 42501.
8. RLS: 같은 부서 부서장 select → 보임(이메일 포함) · member → 0행 · 다른 부서 부서장 → 0행 · **anon select → 0행(데모 부서 포함)**. `list_trailer_invites`를 member가 호출 → 거부.
9. 같은 이메일 2회 발급 → 두 번째는 `skipped_reason='active_exists'`, 철회 후 재발급 → 성공. 1회 21개 → 거부.
10. 예고편 삭제 → 초대 cascade. `requeue_trailer_attempt_score`: `scored` 행 → 거부, `failed` 행 → `scoring` + jobs 1행.
11. 쓰기 경계 행렬(anon·authenticated의 insert/update/delete 전부 거부) · 신규 함수 권한 표 · 맨 끝 롤백 블록(00NN → 0028 → 0027 → 0026 순) 통과.

`scripts/verify-security-sql.mjs`의 함수 권한 표에도 신규 함수를 추가한다.

## Acceptance Criteria

```bash
node scripts/verify-trailer-invites-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"          # failed 0 (함수 권한 표 갱신 포함)
npm run lint
```

## 금지사항

- `orgs.trailer_assessment_enabled`·`orgs.is_demo`를 바꾸는 RPC를 만들지 마라. 이유: 불변식 12·21 — 조직 개시는 운영 스크립트만.
- 열람·제출 오류를 종류별로 구분해 반환하지 마라(`consent_required`·`already_submitted` 제외). 이유: 토큰·이메일 존재 여부를 밖에서 알아낼 수 있다.
- 토큰 평문·이메일을 `raise exception` 메시지·`status_reason`·`jobs.payload`에 넣지 마라. 이유: 불변식 9(로그에 원문 금지).
- `trailer_attempts`에 이메일·이름 컬럼을 추가하지 마라. 이유: ADR-062 3항(이메일은 초대 테이블에만).
- 운영 DB에 적용하지 마라. 이유: ADR-047 — 하니스·E2E·리뷰 통과 후 사용자 승인.
