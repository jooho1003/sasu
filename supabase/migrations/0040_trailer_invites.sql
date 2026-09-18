-- ADR-062 / phase 26 step 0: per-candidate trailer links, consent,
-- one-time submissions, scoring jobs, and retention boundaries.

create table public.trailer_invites (
  id uuid primary key default gen_random_uuid(),
  trailer_id uuid not null references public.trailers(id) on delete cascade,
  dept_id uuid not null,
  org_id uuid not null references public.orgs(id),
  email_normalized text,
  email_hash text,
  token_hash text not null unique,
  used_token_hash text unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  withdrawn_at timestamptz,
  purged_at timestamptz,
  first_opened_at timestamptz,
  consented_at timestamptz,
  consent_version text,
  open_failures int not null default 0 check (open_failures between 0 and 10),
  attempt_id uuid unique references public.trailer_attempts(id) on delete set null,
  purge_after timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trailer_invites_dept_org_fk
    foreign key (dept_id, org_id) references public.departments(id, org_id),
  constraint trailer_invites_email_identity check (
    (email_normalized is null and email_hash is null)
    or (
      email_normalized is not null
      and email_hash is not null
      and email_normalized = lower(btrim(email_normalized))
      and char_length(email_normalized) between 1 and 254
      and position('@' in email_normalized) > 1
      and position('@' in email_normalized) < char_length(email_normalized)
      and email_hash = encode(sha256(convert_to(email_normalized, 'UTF8')), 'hex')
    )
  ),
  constraint trailer_invites_token_shape check (
    token_hash ~ '^[0-9a-f]{64}$' or token_hash = 'void:' || id::text
  ),
  constraint trailer_invites_used_token_shape check (
    used_token_hash is null or used_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint trailer_invites_expiry_window check (
    expires_at = created_at + interval '7 days'
  )
);

create unique index trailer_invites_one_active_email
  on public.trailer_invites(trailer_id, email_hash)
  where revoked_at is null
    and withdrawn_at is null
    and email_hash is not null;
create index trailer_invites_trailer_created
  on public.trailer_invites(trailer_id, created_at, id);
create index trailer_invites_purge_due
  on public.trailer_invites(purge_after)
  where purged_at is null and withdrawn_at is null;

alter table public.trailer_attempts
  add column invite_id uuid unique references public.trailer_invites(id) on delete set null;

create table public.trailer_submission_counters (
  trailer_id uuid not null references public.trailers(id) on delete cascade,
  kst_date date not null,
  count int not null default 0 check (count >= 0),
  primary key (trailer_id, kst_date)
);

alter table public.trailer_invites enable row level security;
alter table public.trailer_submission_counters enable row level security;
revoke all on public.trailer_invites, public.trailer_submission_counters
  from public, anon, authenticated;
grant all on public.trailer_invites, public.trailer_submission_counters
  to service_role;
grant select on public.trailer_invites to authenticated;
create policy trailer_invites_lead_read
  on public.trailer_invites
  for select
  to authenticated
  using (public.can_see(auth.uid(), dept_id, 'leads_only'));

create or replace function private.guard_trailer_invite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_demo boolean;
begin
  select t.dept_id, t.org_id, o.is_demo
    into new.dept_id, new.org_id, v_demo
  from public.trailers t
  join public.orgs o on o.id = t.org_id
  where t.id = new.trailer_id;

  if not found then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  if v_demo then
    raise exception 'demo_forbidden' using errcode = '42501';
  end if;
  if new.email_normalized is null then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  new.email_normalized := lower(btrim(new.email_normalized));
  if char_length(new.email_normalized) not between 1 and 254
    or new.email_normalized ~ '[[:space:]]'
    or position('@' in new.email_normalized) <= 1
    or position('@' in new.email_normalized) >= char_length(new.email_normalized) then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  new.email_hash := encode(sha256(convert_to(new.email_normalized, 'UTF8')), 'hex');
  new.created_at := coalesce(new.created_at, now());
  new.expires_at := new.created_at + interval '7 days';
  return new;
end
$$;

create trigger guard_trailer_invite
before insert on public.trailer_invites
for each row execute function private.guard_trailer_invite();

-- Preserve the 0028 guard while adding the demo hard stop and immutable invite link.
create or replace function private.guard_trailer_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
  demo boolean;
begin
  if TG_OP = 'INSERT' then
    select dept_id into new.dept_id from public.trailers where id = new.trailer_id;
  end if;

  select o.trailer_assessment_enabled, o.is_demo
    into allowed, demo
  from public.trailers t
  join public.orgs o on o.id = t.org_id
  where t.id = new.trailer_id;

  if new.kind = 'candidate' and demo is true then
    raise exception 'demo_forbidden' using errcode = '42501';
  end if;
  if new.kind = 'candidate' and allowed is not true then
    raise exception 'trailer_assessment_disabled' using errcode = 'P0001';
  end if;
  if TG_OP = 'UPDATE' and (
    new.trailer_id is distinct from old.trailer_id
    or new.dept_id is distinct from old.dept_id
    or new.kind is distinct from old.kind
    or new.label is distinct from old.label
    or new.submissions is distinct from old.submissions
    or new.invite_id is distinct from old.invite_id
  ) then
    raise exception 'attempt_identity_immutable' using errcode = '42501';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end
$$;

create or replace function private.trailer_invite_gate(p_trailer uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select t.status = 'published'
      and t.scenarios_hash is not null
      and t.gate_passed_hash = t.scenarios_hash
      and t.approval_hash = t.scenarios_hash
      and o.trailer_publish_enabled
      and o.trailer_assessment_enabled
      and not o.is_demo
    from public.trailers t
    join public.orgs o on o.id = t.org_id
    where t.id = p_trailer
  ), false)
$$;

create or replace function private.trailer_invite_lookup(p_token text, p_email text)
returns public.trailer_invites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_email text := lower(btrim(p_email));
  v_email_hash text;
  v_inv public.trailer_invites%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;

  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into v_inv
  from public.trailer_invites
  where token_hash = v_hash
  for update;

  if not found
    or v_inv.expires_at <= now()
    or v_inv.revoked_at is not null
    or v_inv.withdrawn_at is not null
    or v_inv.purged_at is not null
    or v_inv.open_failures >= 10
    or private.trailer_invite_gate(v_inv.trailer_id) is not true then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;

  v_email_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');
  if v_email is null or v_inv.email_hash is distinct from v_email_hash then
    -- Raising here would roll this security counter back with the statement.
    -- A null composite is the internal unavailable sentinel; the public open RPC
    -- maps it to the same external invite_unavailable result as every other miss.
    update public.trailer_invites
    set open_failures = least(open_failures + 1, 10)
    where id = v_inv.id;
    return null;
  end if;

  return v_inv;
end
$$;

create or replace function private.purge_trailer_invite(p_invite uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
  v_used_hash text;
begin
  if p_reason not in ('lead_deleted', 'withdrawn', 'expired') then
    raise exception 'invalid_purge_reason' using errcode = '22023';
  end if;

  select * into v_inv
  from public.trailer_invites
  where id = p_invite
  for update;
  if not found then
    return;
  end if;

  v_used_hash := case
    when v_inv.token_hash ~ '^[0-9a-f]{64}$' then v_inv.token_hash
    else v_inv.used_token_hash
  end;

  delete from public.trailer_attempts
  where id = v_inv.attempt_id or invite_id = v_inv.id;

  update public.trailer_invites
  set email_normalized = null,
      email_hash = null,
      used_token_hash = coalesce(used_token_hash, v_used_hash),
      token_hash = 'void:' || id::text,
      withdrawn_at = case when p_reason = 'withdrawn' then coalesce(withdrawn_at, now()) else withdrawn_at end,
      purged_at = case when p_reason <> 'withdrawn' then coalesce(purged_at, now()) else purged_at end,
      purge_after = null,
      attempt_id = null
  where id = p_invite;
end
$$;

create or replace function private.count_trailer_submission(p_trailer uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int;
begin
  insert into public.trailer_submission_counters(trailer_id, kst_date, count)
  values (p_trailer, (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (trailer_id, kst_date)
  do update set count = public.trailer_submission_counters.count + 1
  returning count into n;
  if n > 500 then
    raise exception 'trailer_submission_daily_limit' using errcode = 'P0001';
  end if;
end
$$;

create or replace function public.create_trailer_invites(p_trailer uuid, p_emails text[])
returns table(
  invite_id uuid,
  email text,
  token text,
  expires_at timestamptz,
  skipped_reason text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trailer public.trailers%rowtype;
  v_demo boolean;
  v_raw text;
  v_email text;
  v_hash text;
  v_token text;
  v_seen text[] := '{}';
  v_active int;
begin
  if p_emails is null or cardinality(p_emails) not between 1 and 20 then
    raise exception 'invalid_invite_batch' using errcode = '22023';
  end if;

  select * into v_trailer
  from public.trailers
  where id = p_trailer
  for update;
  if not found or public.can_see(auth.uid(), v_trailer.dept_id, 'leads_only') is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select is_demo into v_demo from public.orgs where id = v_trailer.org_id;
  if v_demo then
    raise exception 'demo_forbidden' using errcode = '42501';
  end if;
  if private.trailer_invite_gate(p_trailer) is not true then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;

  select count(*)::int into v_active
  from public.trailer_invites
  where trailer_id = p_trailer
    and revoked_at is null
    and withdrawn_at is null
    and email_hash is not null;

  foreach v_raw in array p_emails loop
    invite_id := null;
    token := null;
    expires_at := null;
    skipped_reason := null;
    v_email := lower(btrim(v_raw));
    email := v_email;

    if v_email is null
      or char_length(v_email) not between 1 and 254
      or v_email ~ '[[:space:]]'
      or position('@' in v_email) <= 1
      or position('@' in v_email) >= char_length(v_email) then
      skipped_reason := 'invalid_email';
      return next;
      continue;
    end if;

    if v_email = any(v_seen) then
      skipped_reason := 'duplicate';
      return next;
      continue;
    end if;
    v_seen := array_append(v_seen, v_email);
    v_hash := encode(sha256(convert_to(v_email, 'UTF8')), 'hex');

    if exists (
      select 1 from public.trailer_invites ti
      where ti.trailer_id = p_trailer
        and ti.email_hash = v_hash
        and ti.revoked_at is null
        and ti.withdrawn_at is null
    ) then
      skipped_reason := 'active_exists';
      return next;
      continue;
    end if;
    if v_active >= 200 then
      raise exception 'invite_limit' using errcode = 'P0001';
    end if;

    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.trailer_invites as ti(
      trailer_id, email_normalized, email_hash, token_hash, created_by
    ) values (
      p_trailer, v_email, v_hash,
      encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid()
    )
    returning ti.id, ti.expires_at into invite_id, expires_at;
    token := v_token;
    v_active := v_active + 1;
    return next;
  end loop;
end
$$;

create or replace function public.revoke_trailer_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
begin
  select * into v_inv from public.trailer_invites where id = p_invite for update;
  if not found or public.can_see(auth.uid(), v_inv.dept_id, 'leads_only') is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_inv.purged_at is not null or v_inv.withdrawn_at is not null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is null then
    update public.trailer_invites
    set revoked_at = now(),
        used_token_hash = token_hash,
        token_hash = 'void:' || id::text
    where id = p_invite;
  end if;
end
$$;

create or replace function public.delete_trailer_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
begin
  select * into v_inv from public.trailer_invites where id = p_invite for update;
  if not found or public.can_see(auth.uid(), v_inv.dept_id, 'leads_only') is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.purge_trailer_invite(p_invite, 'lead_deleted');
end
$$;

create or replace function public.list_trailer_invites(p_trailer uuid)
returns table(
  invite_id uuid,
  email text,
  status text,
  expires_at timestamptz,
  first_opened_at timestamptz,
  consented_at timestamptz,
  submitted_at timestamptz,
  attempt_id uuid,
  attempt_status text,
  weighted_score numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
begin
  select dept_id into v_dept from public.trailers where id = p_trailer;
  if v_dept is null or public.can_see(auth.uid(), v_dept, 'leads_only') is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select ti.id,
         ti.email_normalized,
         case
           when ti.purged_at is not null then 'purged'
           when ti.withdrawn_at is not null then 'withdrawn'
           when ti.revoked_at is not null then 'revoked'
           when ta.status = 'scored' then 'scored'
           when ti.attempt_id is not null then 'submitted'
           when ti.expires_at <= now() then 'expired'
           when ti.consented_at is not null then 'consented'
           when ti.first_opened_at is not null then 'opened'
           else 'pending'
         end,
         ti.expires_at,
         ti.first_opened_at,
         ti.consented_at,
         ta.created_at,
         ta.id,
         ta.status,
         ta.weighted_score
  from public.trailer_invites ti
  left join public.trailer_attempts ta on ta.id = ti.attempt_id
  where ti.trailer_id = p_trailer
  order by ti.created_at, ti.id;
end
$$;

create or replace function public.trailer_invite_open(p_token text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
  v_result jsonb;
begin
  begin
    v_inv := private.trailer_invite_lookup(p_token, p_email);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'invite_unavailable' then
      return jsonb_build_object('error', 'invite_unavailable');
    end if;
    raise;
  end;

  if v_inv.id is null then
    return jsonb_build_object('error', 'invite_unavailable');
  end if;

  update public.trailer_invites
  set first_opened_at = coalesce(first_opened_at, now())
  where id = v_inv.id;

  select jsonb_build_object(
    'scenarios', t.scenarios,
    'apply_url', t.apply_url,
    'org_display_name', o.name,
    'state', case
      when v_inv.attempt_id is not null then 'submitted'
      when v_inv.consented_at is not null then 'ready'
      else 'consent_required'
    end,
    'consent_version', '1',
    'expires_at', v_inv.expires_at
  ) into v_result
  from public.trailers t
  join public.orgs o on o.id = t.org_id
  where t.id = v_inv.trailer_id;
  return v_result;
end
$$;

create or replace function public.trailer_invite_consent(p_token text, p_email text, p_version text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
begin
  if p_version is distinct from '1' then
    raise exception 'invalid_consent_version' using errcode = '22023';
  end if;
  v_inv := private.trailer_invite_lookup(p_token, p_email);
  if v_inv.id is null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  update public.trailer_invites
  set consented_at = coalesce(consented_at, now()),
      consent_version = coalesce(consent_version, p_version)
  where id = v_inv.id;
end
$$;

create or replace function public.submit_trailer_invite_attempt(
  p_token text,
  p_email text,
  p_submissions jsonb
)
returns table(attempt_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
  v_attempt uuid := gen_random_uuid();
  v_sequence int;
begin
  v_inv := private.trailer_invite_lookup(p_token, p_email);
  if v_inv.id is null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  if v_inv.consented_at is null then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if v_inv.attempt_id is not null then
    raise exception 'already_submitted' using errcode = 'P0001';
  end if;
  if p_submissions is null
    or jsonb_typeof(p_submissions) <> 'array'
    or jsonb_array_length(p_submissions) not between 1 and 3
    or pg_column_size(p_submissions) > 65536 then
    raise exception 'invalid_attempt' using errcode = '22023';
  end if;

  perform private.count_trailer_submission(v_inv.trailer_id);
  select count(*)::int into v_sequence
  from public.trailer_invites ti
  where ti.trailer_id = v_inv.trailer_id
    and (ti.created_at, ti.id) <= (v_inv.created_at, v_inv.id);

  insert into public.trailer_attempts(
    id, trailer_id, kind, label, submissions, invite_id
  ) values (
    v_attempt, v_inv.trailer_id, 'candidate',
    '지원자 ' || lpad(v_sequence::text, 2, '0'), p_submissions, v_inv.id
  );

  update public.trailer_invites
  set attempt_id = v_attempt,
      purge_after = now() + interval '90 days'
  where id = v_inv.id;

  insert into public.jobs(id, kind, payload)
  values (
    gen_random_uuid(), 'score_trailer_attempt',
    jsonb_build_object('attemptId', v_attempt)
  );

  return query select v_attempt;
end
$$;

create or replace function public.withdraw_trailer_invite_attempt(p_token text, p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.trailer_invites%rowtype;
begin
  v_inv := private.trailer_invite_lookup(p_token, p_email);
  if v_inv.id is null then
    raise exception 'invite_unavailable' using errcode = 'P0001';
  end if;
  perform private.purge_trailer_invite(v_inv.id, 'withdrawn');
end
$$;

create or replace function public.requeue_trailer_attempt_score(p_attempt uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.trailer_attempts%rowtype;
begin
  select * into v_attempt
  from public.trailer_attempts
  where id = p_attempt
  for update;
  if not found or public.can_see(auth.uid(), v_attempt.dept_id, 'leads_only') is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_attempt.kind <> 'candidate' or v_attempt.status <> 'failed' then
    raise exception 'attempt_not_requeueable' using errcode = 'P0001';
  end if;

  update public.trailer_attempts
  set status = 'scoring',
      status_reason = null,
      result = null,
      weighted_score = null
  where id = p_attempt;
  insert into public.jobs(id, kind, payload)
  values (gen_random_uuid(), 'score_trailer_attempt', jsonb_build_object('attemptId', p_attempt));
end
$$;

create or replace function public.purge_expired_trailer_invites()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate record;
  purged int := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for candidate in
    select id
    from public.trailer_invites
    where purged_at is null
      and withdrawn_at is null
      and (
        purge_after < now()
        or (attempt_id is null and expires_at + interval '90 days' < now())
      )
    order by created_at, id
    for update skip locked
  loop
    perform private.purge_trailer_invite(candidate.id, 'expired');
    purged := purged + 1;
  end loop;
  return purged;
end
$$;

revoke all on function private.guard_trailer_invite()
  from public, anon, authenticated, service_role;
revoke all on function private.trailer_invite_gate(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.trailer_invite_lookup(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.purge_trailer_invite(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.count_trailer_submission(uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.create_trailer_invites(uuid, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_trailer_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_trailer_invite(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_trailer_invites(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.trailer_invite_open(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.trailer_invite_consent(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_trailer_invite_attempt(text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.withdraw_trailer_invite_attempt(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.requeue_trailer_attempt_score(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_trailer_invites()
  from public, anon, authenticated, service_role;

grant execute on function public.create_trailer_invites(uuid, text[]),
  public.revoke_trailer_invite(uuid),
  public.delete_trailer_invite(uuid),
  public.list_trailer_invites(uuid),
  public.requeue_trailer_attempt_score(uuid)
  to authenticated;
grant execute on function public.trailer_invite_open(text, text),
  public.trailer_invite_consent(text, text, text),
  public.submit_trailer_invite_attempt(text, text, jsonb),
  public.withdraw_trailer_invite_attempt(text, text)
  to anon, authenticated;
grant execute on function public.purge_expired_trailer_invites()
  to service_role;
