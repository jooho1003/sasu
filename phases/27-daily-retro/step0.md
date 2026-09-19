# Step 0: retro-schema

개발 회고의 테이블·RLS·RPC·SQL 마스킹·롤백을 만들고 격리 하니스로 증명한다. 화면·라우트·LLM은 건드리지 않는다. **설계 §0의 사용자 결정이 확정되지 않았으면 시작하지 마라.**

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-01·04·05·06) · §8 "ADR-063 개발 회고 경계"
- `/docs/ARCHITECTURE.md` §3.4 · §6 불변식 1·4·9·12·16·22 · §6-4 불변식 23~26
- `/docs/ADR.md` ADR-063 (전체) · ADR-054 · ADR-047
- `docs/planning/개발_회고_자동화_설계.md` §3·§4·§9 — 이 step의 명세. 컬럼·상태값·RPC 이름을 그대로 따른다
- `supabase/migrations/0034_reviewed_materials.sql` — 상태기계·`revision` 낙관적 락·`mask_review_text`·결정적 job id·`claim_/finish_` 펜싱의 원형. 구조를 복제한다
- `supabase/migrations/0002_can_see_rls.sql` — `can_see()`·`is_demo_department()`. **수정 금지**
- `supabase/migrations/0009_voyage_embeddings_search.sql` `search_as` — `auth.uid() = p_user or auth.role() = 'service_role'` 가드(서비스 RPC에 복제)
- `scripts/verify-trailer-invites-sql.mjs` · `scripts/verify-security-sql.mjs` — 하니스 형식과 함수 권한 표

## 작업

### 1. 스키마 `supabase/migrations/0046_daily_retro.sql`

- 설계 §4의 `retro_days`·`retro_activities`·`retro_revisions`·`retro_exports` 정의를 그대로 만든다. `retro_days.visibility check in ('self','dept','leads_only')`, `status check in ('collecting','drafting','draft','needs_review','confirmed','failed')`, `unique (dept_id, user_id, retro_date)`, `retro_activities unique (day_id, kind, ref)`, `retro_days_topics` GIN 인덱스.
- `retro_activities.kind`는 check로 설계 §3의 12개 값만 허용. `text`·`title` 길이 check(500·200).
- `public.mask_retro_text(p_text)` — `mask_review_text`와 동일 정규식. 별도 함수로 두되 본문은 복제(공유 함수로 합치지 마라 — 검토함 회귀 방지).

### 2. RLS

- 4개 테이블 모두 RLS 활성·default deny. `retro_days_select`: `user_id = auth.uid() or (visibility <> 'self' and can_see(auth.uid(), dept_id, visibility))`. 나머지 3개는 부모 day의 같은 조건을 `exists`로 상속.
- insert/update/delete 정책은 만들지 않는다 — 쓰기는 전부 RPC.
- anon: `retro_days`·`retro_activities`·`retro_revisions`에 `for select to anon using (is_demo_department(dept_id))`. 데모 시드 행은 `visibility='dept'`만 둔다는 전제(step 6).

### 3. 사용자 RPC (SECURITY DEFINER, `auth.uid()` 재검증, `is_demo_department(dept)`면 `demo_org` 예외)

| RPC | 검증·동작 |
|---|---|
| `create_retro_day(p_dept uuid, p_day uuid, p_date date, p_tz text, p_collector text, p_bundle jsonb)` | 멤버십(`members` 행)·`consented_at not null` · `p_bundle` 크기 ≤ 1MB · `activities` ≤ 500 · 각 항목 kind 허용값이면서 `sasu_*`가 아님 · `title`/`text` 길이 · `mask_retro_text` 적용 · `retro_days` upsert(같은 날 재업로드면 기존 id 사용, `status='drafting'`, `revision` 유지) · `retro_activities` upsert(`on conflict (day_id, kind, ref) do update set title, text, at, meta`) · **Tier 0 활동 추가**: 같은 `dept_id`에서 `decisions.decided_by = auth.uid() and decided_at::date = p_date` → `kind='sasu_decision', ref=id, title=left(outcome,200), text=left(rationale,500), source_visibility=coalesce(visibility,'dept')`; `answers.asked_by`(status done) → `sasu_answer`(text=left(question,500), source_visibility='dept'); `decision_requests.assignee_id and closed_at::date` → `sasu_card`(source_visibility=visibility); `reviewed_materials.confirmed_by and confirmed_at::date` → `sasu_review`(source_visibility=visibility) · `activity_count` 갱신 · `insert into jobs(id, kind, payload) values (md5('retro-draft:'||p_day||':'||revision)::uuid, 'retro_draft', jsonb_build_object('dayId', p_day, 'revision', revision)) on conflict (id) do nothing` · 반환 `{id, activity_count, job_id}` |
| `save_retro(p_day, p_revision int, p_title text, p_body jsonb, p_topics text[])` | 본인만 · `revision <> p_revision`이면 `raise exception 'stale_retro' using errcode='40001'` · body 4섹션 각 항목의 `citations[]`가 비어 있지 않고 `activity_id`가 같은 day의 `excluded=false` 활동이며 `quote`가 그 활동의 `text` 또는 `title`에 `position(quote in ...) > 0` · 항목 ≤ 200, 항목 텍스트 ≤ 2000자, topics ≤ 5 · `mask_retro_text` 재적용 · `revision+1`, `retro_revisions(origin='edit')` append |
| `confirm_retro(p_day, p_revision)` | 본인만 · revision 일치 · 해당 revision의 모든 항목 인용 ≥1(재검증) · `confirmed_revision, confirmed_at, topics, status='confirmed'` · `retro_revisions(origin='confirm')` append(revision+1) |
| `set_retro_visibility(p_day, p_visibility)` | 본인만 · `dept`/`leads_only`로 바꿀 때 `confirmed_revision`(없으면 최신)의 인용 활동 중 `source_visibility='leads_only'`가 있으면 `dept` 거부(`visibility_narrower_source`). `self`로는 항상 가능 |
| `exclude_retro_activity(p_day, p_activity, p_excluded bool)` | 본인만 · 같은 day 소속 확인 |
| `regenerate_retro(p_day)` | 본인만 · `status='drafting'` · 위와 같은 결정적 job id(revision 기준) insert |
| `delete_retro_day(p_day)` | 본인만 · `delete from retro_days` (cascade) |
| `retro_timeline(p_dept, p_from date, p_to date, p_user uuid, p_topic text)` | **security invoker** · `retro_days` + 작성자 `members.display_name` + 최신/확정 revision 제목 · 정렬 `retro_date desc, user_id` · 200행 상한 |

### 4. 서비스 RPC (워커 전용, `auth.role() = 'service_role'` 아니면 예외)

- `claim_retro_draft(p_day, p_revision)` — `status='drafting' and revision = p_revision`이면 `updated_at=now()` 후 활동(`excluded=false`) jsonb 배열 반환, 아니면 null.
- `finish_retro_draft(p_day, p_revision, p_title, p_body, p_topics, p_error text)` — revision 불일치면 false. `p_error`가 있으면 `status='failed', status_reason=p_error`. body 항목 0개면 `status='needs_review'`. 아니면 `save_retro`와 같은 인용 검사 후 `retro_revisions(origin='draft')`, `revision+1`, `status='draft'`.

### 5. 권한

`revoke all ... from public, anon` 후 사용자 RPC는 `authenticated`, 서비스 RPC는 `service_role`만 grant. `scripts/verify-security-sql.mjs`의 함수 권한 표에 추가.

### 6. 롤백 SQL

`supabase/migrations/rollback/0046_daily_retro_down.sql` — RPC 10개·정책·테이블 4개·`mask_retro_text` 제거.

### 7. 하니스 `scripts/verify-retro-sql.mjs`

격리 DB(`D:/바이브코딩/.sasu-qa-db`)에 0001~0046 적용 후 JWT 4개(anon·member A·member B·lead)로:

1. A가 `create_retro_day` → `retro_days` 1행, `status='drafting'`, `jobs` 1행(같은 revision 재호출 시 jobs 여전히 1행)
2. `p_bundle.activities`에 `kind='sasu_decision'` 포함 → 예외
3. 활동 501건 → 예외 · `text` 501자 → 예외
4. `text`에 전화번호 → 저장된 값에 `[전화번호]`
5. A의 `self` 회고를 B가 select → 0행 · lead가 select → 0행
6. A가 `set_retro_visibility('dept')` → B 1행 · lead 1행
7. Tier 0에 `leads_only` 결정이 인용된 회고를 `dept`로 → `visibility_narrower_source` · `leads_only`로 → 성공 · member B 0행 · lead 1행
8. `save_retro`에 옛 revision → `40001`
9. `save_retro`에 다른 day의 activity_id → 예외 · quote가 원문에 없음 → 예외 · citations 빈 항목 → 예외
10. `confirm_retro` 뒤 `retro_revisions` origin 순서 `draft → edit → confirm`, `retro_days.topics` 반영
11. `exclude_retro_activity` 후 `claim_retro_draft`(service) 반환에 그 활동 없음
12. 데모 조직 부서로 `create_retro_day` → `demo_org` 예외 · anon이 데모 `retro_days` select 가능, 비데모 0행
13. `delete_retro_day` → 4개 테이블 cascade 0행 · B가 A의 day 삭제 → 예외
14. 미동의(consented_at null) 멤버 `create_retro_day` → 예외
15. `claim_retro_draft`를 authenticated로 호출 → 권한 예외

## Acceptance Criteria

```bash
node scripts/verify-retro-sql.mjs "D:/바이브코딩/.sasu-qa-db"      # failed 0
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"    # failed 0 (함수 권한 표 갱신 포함)
npm run lint
```

## 금지사항

- `can_see()`를 수정하거나 `self` 값을 다른 테이블·함수에 넣지 마라. 이유: 불변식 1·24 — `self`는 `retro_days` RLS의 소유 절 하나뿐이다.
- 테이블 직접 insert/update/delete 정책을 만들지 마라. 이유: 검토함과 같은 RPC 단일 쓰기 경계(ADR-054).
- 번들의 어떤 필드로도 `user_id`·`dept_id`를 정하지 마라. 이유: CLAUDE.md CRITICAL — 행위자는 세션에서.
- 활동 원문·제목·quote를 `raise exception` 메시지·`status_reason`·`jobs.payload`에 넣지 마라. 이유: 불변식 9.
- `mask_retro_text`와 `mask_review_text`를 하나로 합치지 마라. 이유: 검토함 회귀 범위를 넓히지 않는다.
- 운영 DB에 적용하지 마라. 이유: ADR-047·불변식 22 — 하니스·E2E·리뷰 통과 후 사용자 승인, 9/20 이후.
