-- Manual rollback only. Run before 0028_trailer_assessment_down.sql.

drop function if exists public.purge_expired_trailer_invites();
drop function if exists public.requeue_trailer_attempt_score(uuid);
drop function if exists public.withdraw_trailer_invite_attempt(text, text);
drop function if exists public.submit_trailer_invite_attempt(text, text, jsonb);
drop function if exists public.trailer_invite_consent(text, text, text);
drop function if exists public.trailer_invite_open(text, text);
drop function if exists public.list_trailer_invites(uuid);
drop function if exists public.delete_trailer_invite(uuid);
drop function if exists public.revoke_trailer_invite(uuid);
drop function if exists public.create_trailer_invites(uuid, text[]);

drop function if exists private.count_trailer_submission(uuid);
drop function if exists private.purge_trailer_invite(uuid, text);
drop function if exists private.trailer_invite_lookup(text, text);
drop function if exists private.trailer_invite_gate(uuid);

-- Restore the exact 0028 attempt guard before removing the invite column.
create or replace function private.guard_trailer_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
begin
  if TG_OP = 'INSERT' then
    select dept_id into new.dept_id from public.trailers where id = new.trailer_id;
  end if;
  select o.trailer_assessment_enabled into allowed
  from public.trailers t
  join public.orgs o on o.id = t.org_id
  where t.id = new.trailer_id;
  if new.kind = 'candidate' and allowed is not true then
    raise exception 'trailer_assessment_disabled' using errcode = 'P0001';
  end if;
  if TG_OP = 'UPDATE' and (
    new.trailer_id is distinct from old.trailer_id
    or new.dept_id is distinct from old.dept_id
    or new.kind is distinct from old.kind
    or new.label is distinct from old.label
    or new.submissions is distinct from old.submissions
  ) then
    raise exception 'attempt_identity_immutable' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$$;
revoke all on function private.guard_trailer_attempt()
  from public, anon, authenticated, service_role;

alter table public.trailer_attempts drop column if exists invite_id;
drop table if exists public.trailer_submission_counters;
drop trigger if exists guard_trailer_invite on public.trailer_invites;
drop function if exists private.guard_trailer_invite();
drop table if exists public.trailer_invites;
