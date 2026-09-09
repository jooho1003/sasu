create or replace function public.recent_decisions_as(
  p_user uuid,
  p_dept uuid,
  p_limit int default 3
)
returns table (
  id uuid,
  outcome text,
  rationale text,
  decided_at timestamptz,
  decided_by_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    decision.id,
    decision.outcome,
    decision.rationale,
    decision.decided_at,
    decision.decided_by_name
  from public.decisions as decision
  where decision.dept_id = p_dept
    and can_see(p_user, decision.dept_id, 'dept')
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by decision.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

revoke all on function public.recent_decisions_as(uuid, uuid, int) from public, anon;
grant execute on function public.recent_decisions_as(uuid, uuid, int) to authenticated, service_role;
