-- Lease recovery keeps jobs from remaining running after a function timeout or process stop.
alter table public.jobs
  add column if not exists lease_until timestamptz;

create or replace function public.claim_jobs(p_limit int)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A job that exhausted its final lease is terminal, not eligible for another handler run.
  with expired as (
    select candidate.id
    from public.jobs as candidate
    where candidate.status = 'running'
      and (candidate.lease_until is null or candidate.lease_until < now())
      and candidate.attempts >= 3 -- Must match lib/jobs.ts MAX_ATTEMPTS.
    for update skip locked
  )
  update public.jobs as job
  set status = 'failed',
      last_error = 'lease_expired',
      lease_until = null,
      updated_at = now()
  from expired
  where job.id = expired.id;

  return query
  with claimed as (
    select candidate.id
    from public.jobs as candidate
    where (
      (candidate.status = 'queued' and candidate.run_after <= now())
      or (
        candidate.status = 'running'
        and (candidate.lease_until is null or candidate.lease_until < now())
      )
    )
      and candidate.attempts < 3 -- Must match lib/jobs.ts MAX_ATTEMPTS.
    order by candidate.run_after, candidate.created_at, candidate.id
    for update skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 100))
  )
  update public.jobs as job
  set status = 'running',
      attempts = job.attempts + 1,
      lease_until = now() + interval '5 minutes',
      updated_at = now()
  from claimed
  where job.id = claimed.id
  returning job.*;
end;
$$;

revoke all on function public.claim_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_jobs(int) to service_role;
