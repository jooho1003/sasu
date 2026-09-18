-- ADR-060 Step 5: isolate bulk collection from realtime work and batch v2 embeddings.
alter table public.jobs
  add column lane text not null default 'realtime'
    check (lane in ('realtime', 'bulk')),
  add column rerun_requested boolean not null default false;

create index jobs_lane_claim
  on public.jobs(lane, run_after, created_at, id)
  where status = 'queued';

alter table public.notion_installations
  add column job_lease_id uuid,
  add column job_lease_until timestamptz;

update public.jobs job
set lane = 'bulk'
where job.kind in ('notion_discover', 'notion_poll', 'embed_batch')
   or (
     job.kind = 'notion_import'
     and exists (
       select 1 from public.sources source
       where source.id = (job.payload->>'sourceId')::uuid
         and source.root_id is not null
     )
   );

create or replace function public.claim_jobs(p_limit int, p_lane text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_lane not in ('realtime', 'bulk') then
    raise exception using errcode = '22023', message = 'invalid_job_lane';
  end if;

  with expired as (
    select candidate.id
    from public.jobs candidate
    where candidate.lane = p_lane
      and candidate.status = 'running'
      and (candidate.lease_until is null or candidate.lease_until < now())
      and candidate.attempts >= 3
    for update skip locked
  )
  update public.jobs job
  set status = 'failed',
      last_error = 'lease_expired',
      lease_until = null,
      updated_at = now()
  from expired
  where job.id = expired.id;

  return query
  with claimed as (
    select candidate.id
    from public.jobs candidate
    where candidate.lane = p_lane
      and (
        (candidate.status = 'queued' and candidate.run_after <= now())
        or (
          candidate.status = 'running'
          and (candidate.lease_until is null or candidate.lease_until < now())
        )
      )
      and candidate.attempts < 3
    order by candidate.run_after, candidate.created_at, candidate.id
    for update skip locked
    limit greatest(0, least(coalesce(p_limit, 0), 100))
  )
  update public.jobs job
  set status = 'running',
      attempts = job.attempts + 1,
      lease_until = now() + interval '5 minutes',
      updated_at = now()
  from claimed
  where job.id = claimed.id
  returning job.*;
end
$$;

-- Compatibility callers without a lane stay on the realtime queue.
create or replace function public.claim_jobs(p_limit int)
returns setof public.jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.claim_jobs(p_limit, 'realtime')
$$;

create function public.acquire_notion_job_lease(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dept uuid;
  org uuid;
begin
  select case
    when job.kind = 'notion_import' then source.dept_id
    when job.kind in ('notion_discover', 'notion_poll') then root.dept_id
    else null
  end into dept
  from public.jobs job
  left join public.sources source
    on job.kind = 'notion_import'
   and source.id = (job.payload->>'sourceId')::uuid
  left join public.notion_roots root
    on job.kind in ('notion_discover', 'notion_poll')
   and root.id = (job.payload->>'rootId')::uuid
  where job.id = p_job;

  if dept is null then return true; end if;
  select department.org_id into org
  from public.departments department where department.id = dept;
  if org is null or not exists (
    select 1 from public.notion_installations installation
    where installation.org_id = org and installation.active
  ) then
    -- The credential resolver owns the visible notion_not_configured failure.
    return true;
  end if;

  update public.notion_installations installation
  set job_lease_id = p_job,
      job_lease_until = now() + interval '5 minutes'
  where installation.org_id = org
    and installation.active
    and (
      installation.job_lease_id = p_job
      or installation.job_lease_until is null
      or installation.job_lease_until < now()
    );
  return found;
end
$$;

create function public.release_notion_job_lease(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notion_installations
  set job_lease_id = null,
      job_lease_until = null
  where job_lease_id = p_job;
  return found;
end
$$;

create function public.queue_embed_batch(p_dept uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_id uuid := md5('embed-batch:' || p_dept::text)::uuid;
begin
  if p_dept is null or not exists (
    select 1
    from public.items item
    join public.sources source on source.id = item.source_id
    where item.dept_id = p_dept
      and item.embed_status = 'pending'
      and item.deleted_at is null
      and source.active
      and source.import_version = 2
  ) then
    return null;
  end if;

  insert into public.jobs as current_job(
    id, kind, payload, lane, status, attempts, run_after, last_error,
    lease_until, rerun_requested, updated_at
  ) values (
    job_id, 'embed_batch', jsonb_build_object('deptId', p_dept), 'bulk',
    'queued', 0, now(), null, null, false, now()
  )
  on conflict(id) do update set
    payload = excluded.payload,
    lane = 'bulk',
    status = case when current_job.status = 'running' then 'running' else 'queued' end,
    attempts = case when current_job.status = 'running' then current_job.attempts else 0 end,
    run_after = case when current_job.status = 'running' then current_job.run_after else now() end,
    last_error = case when current_job.status = 'running' then current_job.last_error else null end,
    lease_until = case when current_job.status = 'running' then current_job.lease_until else null end,
    rerun_requested = current_job.status = 'running',
    updated_at = now();
  return job_id;
end
$$;

create function public.complete_embed_batch_job(p_job uuid, p_requeue boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_status text;
begin
  update public.jobs job
  set status = case
        when coalesce(p_requeue, false) or job.rerun_requested then 'queued'
        else 'done'
      end,
      attempts = case
        when coalesce(p_requeue, false) or job.rerun_requested then 0
        else job.attempts
      end,
      run_after = case
        when coalesce(p_requeue, false) or job.rerun_requested then now()
        else job.run_after
      end,
      last_error = null,
      lease_until = null,
      rerun_requested = false,
      updated_at = now()
  where job.id = p_job
    and job.kind = 'embed_batch'
    and job.status = 'running'
  returning job.status into next_status;
  return next_status;
end
$$;

create or replace function public.invalidate_item_derivatives()
returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare mode text;
begin
  if new.content_version=old.content_version then return new; end if;
  delete from classifications where item_id=new.id;
  update decision_requests r set status='needs_review',source_invalidated=true,title='근거 변경 · 재검토 필요',background='근거 원문이 변경되어 다시 검토해야 합니다.',recommendation=null,
    slack_delivery_status='skipped',slack_delivery_error='source_changed'
    where r.status in ('open','deferred','needs_review') and (r.origin_item_id=new.id or exists(
      select 1 from citations c where c.owner_kind='decision_request' and c.owner_id=r.id and c.item_id=new.id));
  if new.deleted_at is null and length(btrim(new.content))>0 then
    select ingest_mode into mode from sources where id=new.source_id;
    if mode='reference' then
      perform public.queue_embed_batch(new.dept_id);
    else
      insert into jobs(id,kind,payload,lane) values(md5('source-classify:'||new.id||':'||new.content_version)::uuid,'classify',
        jsonb_build_object('itemId',new.id,'contentVersion',new.content_version),'realtime') on conflict(id) do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function public.finish_notion_sync(
  p_source uuid,
  p_lease uuid,
  p_items jsonb,
  p_title text,
  p_remote_edited_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; row jsonb; item items%rowtype; n_insert int:=0; n_update int:=0; n_delete int:=0;
begin
  select * into s from sources where id=p_source and active and sync_lease=p_lease and sync_lease_until>now() for update;
  if not found then return null; end if;
  if jsonb_typeof(p_items)<>'array' or exists(select 1 from jsonb_array_elements(p_items) x where nullif(x->>'external_ref','') is null or x->>'content' is null)
    or (select count(*)<>count(distinct x->>'external_ref') from jsonb_array_elements(p_items) x) then
    raise exception using errcode='22023',message='invalid_snapshot'; end if;
  for row in select * from jsonb_array_elements(p_items) loop
    select * into item from items where source_id=s.id and external_ref=row->>'external_ref' for update;
    if not found then
      insert into items(source_id,dept_id,external_ref,author,content) values(s.id,s.dept_id,row->>'external_ref','Notion',row->>'content') returning * into item;
      if s.ingest_mode='classify' then
        insert into jobs(id,kind,payload,lane) values(md5('source-classify:'||item.id||':1')::uuid,'classify',jsonb_build_object('itemId',item.id,'contentVersion',1),'realtime') on conflict(id) do nothing;
      end if;
      n_insert:=n_insert+1;
    elsif item.content is distinct from row->>'content' or item.deleted_at is not null then
      update items set content=row->>'content',deleted_at=null where id=item.id;
      n_update:=n_update+1;
    end if;
  end loop;
  update items i set content='',deleted_at=now() where i.source_id=s.id and i.deleted_at is null
    and not exists(select 1 from jsonb_array_elements(p_items) x where x->>'external_ref'=i.external_ref);
  get diagnostics n_delete=row_count;
  if s.ingest_mode='reference' then perform public.queue_embed_batch(s.dept_id); end if;
  update sources set title=coalesce(p_title,title),remote_edited_at=coalesce(p_remote_edited_at,remote_edited_at),last_synced_at=now(),last_error=null,sync_lease=null,sync_lease_until=null where id=s.id;
  return jsonb_build_object('inserted',n_insert,'updated',n_update,'deleted',n_delete);
end $$;

create or replace function public.convert_notion_source_v2(p_source uuid)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype;
begin
  select x.* into s from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.id=p_source and x.kind='notion_page' and x.active and not o.is_demo
      and can_see(auth.uid(),x.dept_id,'leads_only') for update of x;
  if not found then raise exception using errcode='42501',message='source_forbidden'; end if;
  update sources set import_version=2 where id=s.id;
  if not exists(select 1 from jobs where kind='notion_import' and payload->>'sourceId'=s.id::text and status in ('queued','running')) then
    insert into jobs(kind,payload,lane) values('notion_import',jsonb_build_object('sourceId',s.id),case when s.root_id is null then 'realtime' else 'bulk' end);
  end if;
  return true;
end $$;

create or replace function public.schedule_source_syncs()
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; n int:=0;
begin
  for s in select x.* from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.kind='notion_page' and x.active and x.auto_sync and not o.is_demo and coalesce(x.next_sync_at,'epoch')<=now()
    order by x.id limit 20 for update of x skip locked loop
    if not exists(select 1 from jobs where kind='notion_import' and payload->>'sourceId'=s.id::text and status in ('queued','running')) then
      insert into jobs(kind,payload,lane) values('notion_import',jsonb_build_object('sourceId',s.id),case when s.root_id is null then 'realtime' else 'bulk' end); n:=n+1;
    end if;
    update sources set next_sync_at=now()+interval '5 minutes' where id=s.id;
  end loop;
  return n;
end $$;

create or replace function public.register_notion_page(
  p_root uuid,
  p_page text,
  p_parent text,
  p_remote_edited_at timestamptz,
  p_title text
) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  root notion_roots%rowtype;
  existing_source sources%rowtype;
  closer_root uuid;
  closer_dept uuid;
  page_limit integer;
  page_count integer;
  missing_count integer;
  source_id uuid;
begin
  if nullif(btrim(p_page),'') is null or length(p_page)>500
    or (p_parent is not null and length(p_parent)>500) then
    raise exception using errcode='22023',message='invalid_notion_page';
  end if;
  select * into root from notion_roots where id=p_root for update;
  if not found or root.state not in ('discovering','idle') then return 'paused'; end if;
  if root.state='idle' and not root.include_new and root.last_discovered_at is not null then
    return 'paused';
  end if;
  select count(*)::integer into missing_count from members
  where dept_id=root.dept_id and consented_at is null;
  if missing_count>0 then
    update notion_roots set state='paused_consent',discover_lease=null,
      discover_lease_until=null where id=root.id;
    return 'paused';
  end if;

  if exists(
    with recursive lineage(value,depth,path) as (
      select value,depth,path from (values
        (p_page,0,array[p_page]::text[]),
        (p_parent,1,array[p_page,p_parent]::text[])
      ) seed(value,depth,path) where value is not null
      union all
      select s.parent_external_id,lineage.depth+1,lineage.path||s.parent_external_id
      from lineage join sources s
        on s.dept_id=root.dept_id and s.kind='notion_page'
        and s.active and s.external_id=lineage.value
      where s.parent_external_id is not null
        and not s.parent_external_id=any(lineage.path)
    )
    select 1 from lineage join notion_exclusions e
      on e.dept_id=root.dept_id and e.notion_id=lineage.value
      and (lineage.depth=0 or e.subtree)
  ) then
    return 'excluded';
  end if;

  with recursive lineage(value,depth,path) as (
    select value,depth,path from (values
      (p_page,0,array[p_page]::text[]),
      (p_parent,1,array[p_page,p_parent]::text[])
    ) seed(value,depth,path) where value is not null
    union all
    select s.parent_external_id,lineage.depth+1,lineage.path||s.parent_external_id
    from lineage join sources s
      on s.kind='notion_page' and s.active and s.external_id=lineage.value
      and (s.dept_id=root.dept_id or (root.scope='workspace' and s.dept_id in (
        select id from departments where org_id=root.org_id)))
    where s.parent_external_id is not null
      and not s.parent_external_id=any(lineage.path)
  ), ranked as (
    select candidate.id,candidate.dept_id,lineage.depth
    from lineage join notion_roots candidate
      on (candidate.dept_id=root.dept_id or (root.scope='workspace' and candidate.org_id=root.org_id))
      and candidate.scope='subtree'
      and candidate.state<>'disabled'
      and candidate.notion_id=lineage.value
    order by lineage.depth,candidate.created_at,candidate.id
    limit 1
  ) select id,dept_id into closer_root,closer_dept from ranked;
  if closer_root=root.id then closer_root:=null; closer_dept:=null; end if;
  if closer_root is not null and closer_dept<>root.dept_id then return 'excluded'; end if;

  select * into existing_source from sources
  where dept_id=root.dept_id and kind='notion_page'
    and external_id=p_page and active
  for update;
  if found then
    if closer_root is not null then
      update sources set root_id=closer_root where id=existing_source.id;
    else
      update sources set root_id=root.id,
        parent_external_id=coalesce(p_parent,parent_external_id),
        remote_edited_at=coalesce(p_remote_edited_at,remote_edited_at),
        title=coalesce(nullif(left(public.mask_review_text(p_title),200),''),title)
      where id=existing_source.id;
    end if;
    return 'linked';
  end if;
  if closer_root is not null then return 'linked'; end if;

  select coalesce(os.notion_page_limit,2000) into page_limit
  from (select root.org_id org_id) current_org
  left join org_settings os on os.org_id=current_org.org_id;
  select count(*)::integer into page_count from sources s
  join departments d on d.id=s.dept_id
  where d.org_id=root.org_id and s.kind='notion_page' and s.active;
  if page_count>=page_limit then
    update notion_roots set state='paused_limit',discover_lease=null,
      discover_lease_until=null where id=root.id;
    return 'limit';
  end if;

  insert into sources(
    dept_id,kind,external_id,title,visibility,is_principles,active,
    auto_sync,import_version,ingest_mode,root_id,remote_edited_at,
    parent_external_id
  ) values(
    root.dept_id,'notion_page',p_page,
    nullif(left(public.mask_review_text(p_title),200),''),root.visibility,false,true,
    false,2,case when root.card_candidates then 'classify' else 'reference' end,
    root.id,p_remote_edited_at,p_parent
  ) returning id into source_id;
  insert into jobs(id,kind,payload,lane)
    values(md5('notion-root-import:'||source_id)::uuid,'notion_import',jsonb_build_object('sourceId',source_id),'bulk')
    on conflict(id) do nothing;
  return 'created';
exception when unique_violation then
  update sources set root_id=root.id
  where dept_id=root.dept_id and kind='notion_page'
    and external_id=p_page and active;
  return 'linked';
end $$;

create or replace function public.queue_notion_database(
  p_root uuid,
  p_database text,
  p_parent text
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype; cursor jsonb; databases jsonb;
begin
  select * into root from notion_roots where id=p_root for update;
  if not found or root.state not in ('discovering','idle')
    or nullif(btrim(p_database),'') is null then return false; end if;
  if root.state='idle' and not root.include_new and root.last_discovered_at is not null then
    return false;
  end if;
  cursor:=coalesce(root.discover_cursor,'{"mode":"database","pending":[],"databases":[],"databaseIndex":0,"dataSourceCursor":null}'::jsonb);
  databases:=coalesce(cursor->'databases','[]'::jsonb);
  if not exists(
    select 1 from jsonb_array_elements(databases) entry
    where entry->>'id'=p_database
  ) then
    databases:=databases||jsonb_build_array(jsonb_build_object('id',p_database,'parent',p_parent));
  end if;
  cursor:=jsonb_set(cursor,'{mode}','"database"'::jsonb,true);
  cursor:=jsonb_set(cursor,'{databases}',databases,true);
  update notion_roots set discover_cursor=cursor,state='discovering' where id=root.id;
  if not exists(
    select 1 from jobs where kind='notion_discover'
      and payload->>'rootId'=root.id::text and status in ('queued','running')
  ) then
    insert into jobs(kind,payload,lane) values('notion_discover',jsonb_build_object('rootId',root.id),'bulk');
  end if;
  return true;
end $$;

create or replace function public.settle_notion_root(p_root uuid)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype;
begin
  select * into root from notion_roots where id=p_root for update;
  if not found or root.state<>'discovering'
    or exists(
      select 1 from sources s where s.root_id=root.id and s.active
        and s.last_synced_at is null and s.last_error is null
    )
    or exists(
      select 1 from jobs j where j.kind='notion_discover'
        and j.payload->>'rootId'=root.id::text and j.status='queued'
    ) then
    return false;
  end if;
  if root.scope='subtree'
    and coalesce(root.discover_cursor->>'unassignedDone','false')<>'true' then
    update notion_roots set
      discover_cursor='{"mode":"imports","unassignedCursor":null,"unassignedCount":0}'::jsonb,
      discover_lease=null,discover_lease_until=null
    where id=root.id;
    if not exists(
      select 1 from jobs where kind='notion_discover'
        and payload->>'rootId'=root.id::text and status in ('queued','running')
    ) then
      insert into jobs(kind,payload,lane)
        values('notion_discover',jsonb_build_object('rootId',root.id),'bulk');
    end if;
    return true;
  end if;
  update notion_roots set state='idle',discover_cursor=null,
    last_discovered_at=now(),last_error=null
  where id=root.id;
  return true;
end $$;

create or replace function public.notion_installation_for_job(p_job uuid)
returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare dept uuid;
begin
  select case
    when job.kind='notion_import' then source.dept_id
    when job.kind in ('notion_discover','notion_poll') then root.dept_id
    else null
  end into dept
  from jobs job
  left join sources source
    on job.kind='notion_import' and source.id=(job.payload->>'sourceId')::uuid
  left join notion_roots root
    on job.kind in ('notion_discover','notion_poll') and root.id=(job.payload->>'rootId')::uuid
  where job.id=p_job;
  return public.notion_installation_for_department(dept);
end $$;

-- Existing queued v2 reference jobs are superseded by one department batch.
update public.jobs job
set status='done',last_error='superseded_by_embed_batch',lease_until=null,updated_at=now()
where job.kind='embed' and job.status='queued' and exists(
  select 1 from public.items item join public.sources source on source.id=item.source_id
  where item.id=(job.payload->>'itemId')::uuid
    and source.import_version=2 and source.ingest_mode='reference'
);

do $$
declare department_id uuid;
begin
  for department_id in
    select distinct item.dept_id from public.items item
    join public.sources source on source.id=item.source_id
    where item.embed_status='pending' and item.deleted_at is null
      and source.active and source.import_version=2
  loop
    perform public.queue_embed_batch(department_id);
  end loop;
end
$$;

create or replace function public.run_bulk_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $fn$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  select value into v_url from public.worker_config where key='jobs_run_url';
  select value into v_secret from public.worker_config where key='jobs_trigger_secret';
  if v_url is null or v_secret is null then
    raise notice 'worker_config 미설정 — scripts/setup-worker-cron.ts 를 실행하라';
    return null;
  end if;
  select net.http_post(
    url := v_url || case when position('?' in v_url)>0 then '&lane=bulk' else '?lane=bulk' end,
    headers := jsonb_build_object('Content-Type','application/json','x-jobs-secret',v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  ) into v_request_id;
  return v_request_id;
end
$fn$;

-- PGlite does not provide pg_cron. Production Postgres schedules this branch.
do $schedule$
begin
  if to_regnamespace('cron') is not null then
    execute 'select cron.unschedule(''sasu-jobs-bulk-tick'') where exists (select 1 from cron.job where jobname=''sasu-jobs-bulk-tick'')';
    execute 'select cron.schedule(''sasu-jobs-bulk-tick'',''* * * * *'',''select public.run_bulk_jobs_tick();'')';
  end if;
end
$schedule$;

revoke all on function public.claim_jobs(int), public.claim_jobs(int,text),
  public.acquire_notion_job_lease(uuid), public.release_notion_job_lease(uuid),
  public.queue_embed_batch(uuid), public.complete_embed_batch_job(uuid,boolean),
  public.notion_installation_for_job(uuid), public.run_bulk_jobs_tick()
  from public,anon,authenticated,service_role;
grant execute on function public.claim_jobs(int), public.claim_jobs(int,text),
  public.acquire_notion_job_lease(uuid), public.release_notion_job_lease(uuid),
  public.queue_embed_batch(uuid), public.complete_embed_batch_job(uuid,boolean),
  public.notion_installation_for_job(uuid) to service_role;

revoke all on function public.invalidate_item_derivatives(),
  public.finish_notion_sync(uuid,uuid,jsonb,text,timestamptz),
  public.convert_notion_source_v2(uuid), public.schedule_source_syncs(),
  public.register_notion_page(uuid,text,text,timestamptz,text),
  public.queue_notion_database(uuid,text,text), public.settle_notion_root(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.finish_notion_sync(uuid,uuid,jsonb,text,timestamptz),
  public.schedule_source_syncs(),
  public.register_notion_page(uuid,text,text,timestamptz,text),
  public.queue_notion_database(uuid,text,text), public.settle_notion_root(uuid)
  to service_role;
grant execute on function public.convert_notion_source_v2(uuid) to authenticated;
