create or replace function public.consent_via_slack(
  p_slack_user text,
  p_dept uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if coalesce(btrim(p_slack_user), '') = '' or p_dept is null then
    return false;
  end if;

  select exists (
    select 1
    from public.members
    where dept_id = p_dept
      and slack_user_id = p_slack_user
  )
  into v_exists;

  if not v_exists then
    return false;
  end if;

  update public.members
  set consented_at = now(),
      consent_version = 1
  where dept_id = p_dept
    and slack_user_id = p_slack_user
    and consented_at is null;

  return true;
end;
$$;

revoke all on function public.consent_via_slack(text, uuid)
from public, anon, authenticated;
grant execute on function public.consent_via_slack(text, uuid)
to service_role;
