create or replace function public.claim_jobs(p_limit int)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimed as (
    select candidate.id
    from public.jobs as candidate
    where candidate.status = 'queued'
      and candidate.run_after <= now()
    order by candidate.run_after, candidate.created_at, candidate.id
    for update skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 100))
  )
  update public.jobs as job
  set status = 'running',
      attempts = job.attempts + 1,
      updated_at = now()
  from claimed
  where job.id = claimed.id
  returning job.*;
end;
$$;

revoke all on function public.claim_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_jobs(int) to service_role;
