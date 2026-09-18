-- ADR-060 Step 6: installation watermarks, incremental poll scheduling, and daily root reconciliation.
alter table public.notion_installations
  add column poll_watermark timestamptz,
  add column poll_cursor jsonb,
  add column next_poll_at timestamptz not null default now(),
  add column next_reconcile_at timestamptz not null default now();

alter table public.sources
  add column notion_reconcile_seen_at timestamptz;

create or replace function public.schedule_source_syncs() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; n int:=0;
begin
  for s in select x.* from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.kind='notion_page' and x.active and x.auto_sync and x.root_id is null
      and not o.is_demo and coalesce(x.next_sync_at,'epoch')<=now()
    order by x.id limit 20 for update of x skip locked loop
    if not exists(select 1 from jobs where kind='notion_import' and payload->>'sourceId'=s.id::text and status in ('queued','running')) then
      insert into jobs(kind,payload,lane) values('notion_import',jsonb_build_object('sourceId',s.id),'realtime'); n:=n+1;
    end if;
    update sources set next_sync_at=now()+interval '5 minutes' where id=s.id;
  end loop;
  return n;
end $$;

create function public.schedule_notion_polls() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare installation notion_installations%rowtype; root_id uuid; n int:=0;
begin
  for installation in select ni.* from notion_installations ni join orgs o on o.id=ni.org_id
    where ni.active and ni.encrypted_token is not null and not o.is_demo
      and (ni.next_poll_at<=now() or ni.next_reconcile_at<=now())
    for update of ni skip locked loop
    select r.id into root_id from notion_roots r
      where r.org_id=installation.org_id and r.state='idle' order by r.created_at limit 1;
    if installation.next_poll_at<=now() and root_id is not null and not exists(
      select 1 from jobs j where j.kind='notion_poll' and j.status in ('queued','running')
        and j.payload->>'rootId'=root_id::text
    ) then
      insert into jobs(kind,payload,lane) values('notion_poll',jsonb_build_object('rootId',root_id),'bulk'); n:=n+1;
      update notion_installations set next_poll_at=now()+interval '5 minutes' where org_id=installation.org_id;
    end if;
    if installation.next_reconcile_at<=now() then
      insert into jobs(kind,payload,lane)
        select 'notion_discover',jsonb_build_object('rootId',r.id,'reconcile',true),'bulk'
        from notion_roots r where r.org_id=installation.org_id and r.state='idle'
          and not exists(select 1 from jobs j where j.kind='notion_discover' and j.status in ('queued','running') and j.payload->>'rootId'=r.id::text)
        on conflict do nothing;
      update notion_installations set next_reconcile_at=now()+interval '24 hours' where org_id=installation.org_id;
    end if;
  end loop;
  return n;
end $$;

create function public.claim_notion_poll(p_root uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype; watermark timestamptz; cursor_state jsonb;
begin
  select r.* into root from notion_roots r join notion_installations ni on ni.org_id=r.org_id
    join orgs o on o.id=r.org_id where r.id=p_root and r.state='idle' and ni.active and not o.is_demo for update of r;
  if not found then return null; end if;
  select poll_watermark,poll_cursor into watermark,cursor_state
  from notion_installations where org_id=root.org_id for update;
  update notion_roots set discover_lease=p_lease,discover_lease_until=now()+interval '45 seconds' where id=root.id;
  return jsonb_build_object(
    'root_id',root.id,
    'poll_watermark',watermark,
    'poll_cursor',cursor_state->>'cursor',
    'poll_offset',coalesce((cursor_state->>'offset')::integer,0),
    'poll_started_at',cursor_state->>'startedAt'
  );
end $$;

create function public.save_notion_poll_cursor(p_root uuid,p_lease uuid,p_cursor text,p_offset integer,p_started_at timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  if p_offset is null or p_offset<0 or p_offset>100 or p_started_at is null then
    raise exception using errcode='22023',message='invalid_notion_poll_offset';
  end if;
  select org_id into org from notion_roots
  where id=p_root and discover_lease=p_lease for update;
  if not found then return false; end if;
  update notion_installations set poll_cursor=jsonb_build_object(
    'cursor',p_cursor,'offset',p_offset,'startedAt',p_started_at
  ) where org_id=org;
  update notion_roots set discover_lease=null,discover_lease_until=null
  where id=p_root;
  return true;
end;
$$;

create function public.finish_notion_poll(p_root uuid,p_lease uuid,p_watermark timestamptz) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  select org_id into org from notion_roots where id=p_root and discover_lease=p_lease for update;
  if not found then return false; end if;
  update notion_installations set
    poll_watermark=greatest(coalesce(poll_watermark,'epoch'),coalesce(p_watermark,'epoch')),
    poll_cursor=null
  where org_id=org;
  update notion_roots set discover_lease=null,discover_lease_until=null where id=p_root;
  return true;
end $$;

create function public.poll_notion_page(p_root uuid,p_page text,p_parent text,p_remote_edited_at timestamptz,p_title text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype; target notion_roots%rowtype; source sources%rowtype; status text;
begin
  select * into root from notion_roots where id=p_root and state='idle'; if not found then return 'skip'; end if;
  select s.* into source from sources s join departments d on d.id=s.dept_id
    where d.org_id=root.org_id and s.kind='notion_page' and s.external_id=p_page and s.active order by (s.root_id=root.id) desc limit 1 for update;
  if found then
    if p_remote_edited_at>coalesce(source.remote_edited_at,'epoch')
      -- Notion rounds last_edited_time down to the minute: an edit made in the same
      -- minute as our last sync keeps the same timestamp, so read once more when the
      -- last sync happened inside that minute (not "now", which drifts past it).
      or (p_remote_edited_at=source.remote_edited_at and date_trunc('minute',source.last_synced_at)=date_trunc('minute',p_remote_edited_at)) then
      if not exists(select 1 from jobs j where j.kind='notion_import' and j.payload->>'sourceId'=source.id::text and j.status in ('queued','running')) then
        insert into jobs(kind,payload,lane) values('notion_import',jsonb_build_object('sourceId',source.id),'bulk');
      end if;
      return 'import';
    end if;
    return 'skip';
  end if;
  if p_parent is null then return 'skip'; end if;
  select target_root.* into target from sources parent_source
  join departments parent_department on parent_department.id=parent_source.dept_id
  join notion_roots target_root on target_root.id=parent_source.root_id
  where parent_department.org_id=root.org_id
    and parent_source.kind='notion_page' and parent_source.external_id=p_parent
    and parent_source.active and target_root.state in ('idle','discovering')
  order by (target_root.id=root.id) desc,target_root.created_at,target_root.id
  limit 1;
  if not found or not target.include_new then return 'skip'; end if;
  select register_notion_page(target.id,p_page,p_parent,p_remote_edited_at,p_title) into status;
  return case when status in ('created','linked') then 'import' else 'skip' end;
end $$;

create function public.claim_notion_reconcile(p_root uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype; missing_count integer; known_pages jsonb;
begin
  select r.* into root from notion_roots r
  join orgs o on o.id=r.org_id
  join notion_installations ni on ni.org_id=r.org_id and ni.active
  where r.id=p_root and r.state in ('idle','discovering') and not o.is_demo
  for update of r;
  if not found or (root.discover_lease_until is not null and root.discover_lease_until>=now()) then
    return null;
  end if;
  select count(*)::integer into missing_count from members
  where dept_id=root.dept_id and consented_at is null;
  if missing_count>0 then
    update notion_roots set state='paused_consent',discover_lease=null,
      discover_lease_until=null where id=root.id;
    return null;
  end if;
  if root.scope='workspace' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',source.external_id,
      'parent',source.parent_external_id
    ) order by source.id),'[]'::jsonb) into known_pages
    from sources source
    where source.root_id=root.id and source.kind='notion_page' and source.active;
  else
    known_pages:='[]'::jsonb;
  end if;
  update notion_roots set state='discovering',discover_lease=p_lease,
    discover_lease_until=now()+interval '2 minutes',last_error=null
  where id=root.id;
  return jsonb_build_object(
    'id',root.id,'scope',root.scope,'notion_id',root.notion_id,
    'notion_kind',root.notion_kind,'top_title',root.top_title,
    'discover_cursor',root.discover_cursor,'known_pages',known_pages
  );
end $$;

create function public.reconcile_notion_page(
  p_root uuid,
  p_lease uuid,
  p_page text,
  p_parent text,
  p_remote_edited_at timestamptz,
  p_title text,
  p_started_at timestamptz
) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  root notion_roots%rowtype;
  existing_source sources%rowtype;
  current_source sources%rowtype;
  registration text;
begin
  if p_started_at is null or nullif(btrim(p_page),'') is null then
    raise exception using errcode='22023',message='invalid_notion_reconcile_page';
  end if;
  select * into root from notion_roots
  where id=p_root and state='discovering' and discover_lease=p_lease
    and discover_lease_until>now()
  for update;
  if not found then return 'paused'; end if;

  select source.* into existing_source from sources source
  where source.dept_id=root.dept_id and source.kind='notion_page'
    and source.external_id=p_page and source.active
  for update;
  if not found and not root.include_new then return 'skip'; end if;

  select register_notion_page(
    root.id,p_page,p_parent,p_remote_edited_at,p_title
  ) into registration;
  if registration='excluded' then
    if existing_source.id is not null and existing_source.root_id=root.id then
      update items set content='',deleted_at=now()
      where source_id=existing_source.id and deleted_at is null;
      update sources set active=false,last_error='notion_reconciled_outside_root',
        sync_lease=null,sync_lease_until=null
      where id=existing_source.id;
    end if;
    return 'excluded';
  end if;
  if registration in ('limit','paused') then return registration; end if;

  select source.* into current_source from sources source
  where source.dept_id=root.dept_id and source.kind='notion_page'
    and source.external_id=p_page and source.active
  for update;
  if not found then return 'skip'; end if;
  if existing_source.id is not null then
    update sources set remote_edited_at=existing_source.remote_edited_at
    where id=current_source.id;
  end if;
  if current_source.root_id=root.id then
    update sources set notion_reconcile_seen_at=p_started_at
    where id=current_source.id;
  end if;
  if registration='created' then return 'created'; end if;
  if p_remote_edited_at is not null
    and p_remote_edited_at is distinct from existing_source.remote_edited_at then
    if not exists(
      select 1 from jobs where kind='notion_import'
        and payload->>'sourceId'=current_source.id::text
        and status in ('queued','running')
    ) then
      insert into jobs(kind,payload,lane)
      values('notion_import',jsonb_build_object('sourceId',current_source.id),'bulk');
    end if;
    return 'import';
  end if;
  return 'unchanged';
end $$;

create function public.finish_notion_reconcile(
  p_root uuid,
  p_lease uuid,
  p_started_at timestamptz
) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare retired integer;
begin
  perform 1 from notion_roots
  where id=p_root and state='discovering' and discover_lease=p_lease
    and discover_lease_until>now()
  for update;
  if not found then return 0; end if;

  update items set content='',deleted_at=now()
  where deleted_at is null and source_id in (
    select id from sources
    where root_id=p_root and kind='notion_page' and active
      and (notion_reconcile_seen_at is null or notion_reconcile_seen_at<p_started_at)
  );
  update sources set active=false,last_error='notion_reconciled_missing',
    sync_lease=null,sync_lease_until=null
  where root_id=p_root and kind='notion_page' and active
    and (notion_reconcile_seen_at is null or notion_reconcile_seen_at<p_started_at);
  get diagnostics retired=row_count;
  update notion_roots set state='idle',discover_cursor=null,
    discover_lease=null,discover_lease_until=null,last_discovered_at=now(),last_error=null
  where id=p_root;
  return retired;
end $$;

revoke all on function public.schedule_notion_polls(),public.claim_notion_poll(uuid,uuid),public.save_notion_poll_cursor(uuid,uuid,text,integer,timestamptz),public.finish_notion_poll(uuid,uuid,timestamptz),public.poll_notion_page(uuid,text,text,timestamptz,text),public.claim_notion_reconcile(uuid,uuid),public.reconcile_notion_page(uuid,uuid,text,text,timestamptz,text,timestamptz),public.finish_notion_reconcile(uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.schedule_notion_polls(),public.claim_notion_poll(uuid,uuid),public.save_notion_poll_cursor(uuid,uuid,text,integer,timestamptz),public.finish_notion_poll(uuid,uuid,timestamptz),public.poll_notion_page(uuid,text,text,timestamptz,text),public.claim_notion_reconcile(uuid,uuid),public.reconcile_notion_page(uuid,uuid,text,text,timestamptz,text,timestamptz),public.finish_notion_reconcile(uuid,uuid,timestamptz) to service_role;
