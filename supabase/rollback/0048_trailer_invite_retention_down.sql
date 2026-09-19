-- Local rollback verification. Disable application workers before an approved rollback.
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
drop function public.sweep_trailer_invite_attempts();
drop function private.trailer_invite_lookup(text,text,boolean);
