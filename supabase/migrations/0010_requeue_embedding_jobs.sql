-- 0009 전환 직후 구버전 워커가 기록한 embed/unknown_kind 실패 job을 복구한다.
update public.jobs
set
  status = 'queued',
  attempts = 0,
  run_after = now(),
  last_error = null,
  updated_at = now()
where kind = 'embed'
  and status = 'failed'
  and last_error = 'unknown_kind';

-- 전환 시점에 job이 누락된 활성 실데이터도 다시 큐에 넣는다.
insert into public.jobs (kind, payload)
select
  'embed',
  jsonb_build_object('itemId', item.id::text)
from public.items as item
join public.departments as department on department.id = item.dept_id
join public.orgs as organization on organization.id = department.org_id
where organization.is_demo = false
  and item.deleted_at is null
  and item.embed_status = 'pending'
  and not exists (
    select 1
    from public.jobs as job
    where job.kind = 'embed'
      and job.status in ('queued', 'running')
      and job.payload ->> 'itemId' = item.id::text
  );
