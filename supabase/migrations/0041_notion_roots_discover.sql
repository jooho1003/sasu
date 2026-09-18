-- ADR-060 Step 4: department-scoped Notion roots, exclusions, and discovery.
create table public.notion_roots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  dept_id uuid not null,
  scope text not null check (scope in ('workspace', 'subtree')),
  notion_id text,
  notion_kind text check (notion_kind in ('page', 'database')),
  top_title text,
  visibility text not null default 'dept' check (visibility in ('dept', 'leads_only')),
  include_new boolean not null default true,
  card_candidates boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_role text not null check (created_role in ('org_admin', 'lead')),
  state text not null default 'pending' check (state in (
    'pending', 'discovering', 'idle', 'paused_consent',
    'paused_limit', 'failed', 'disabled'
  )),
  discover_cursor jsonb,
  discover_lease uuid,
  discover_lease_until timestamptz,
  unsupported_count integer not null default 0 check (unsupported_count >= 0),
  last_discovered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint notion_roots_dept_org_fk
    foreign key (dept_id, org_id) references public.departments(id, org_id),
  constraint notion_roots_scope_target_check check (
    (scope = 'workspace' and notion_id is null and notion_kind is null)
    or (scope = 'subtree' and notion_id is not null and notion_kind is not null)
  )
);

create unique index notion_roots_active_subtree_unique
  on public.notion_roots(dept_id, notion_id)
  where state <> 'disabled' and scope = 'subtree';
create unique index notion_roots_active_workspace_org_unique
  on public.notion_roots(org_id)
  where state <> 'disabled' and scope = 'workspace';

create table public.notion_exclusions (
  dept_id uuid not null references public.departments(id),
  notion_id text not null,
  subtree boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (dept_id, notion_id)
);

alter table public.sources
  add constraint sources_root_id_fk
    foreign key (root_id) references public.notion_roots(id);
alter table public.org_settings
  add column notion_page_limit integer not null default 2000
    check (notion_page_limit > 0);
alter table public.notion_installations
  add column unassigned_count integer not null default 0
    check (unassigned_count >= 0);

alter table public.notion_roots enable row level security;
alter table public.notion_exclusions enable row level security;
revoke all on public.notion_roots, public.notion_exclusions
  from public, anon, authenticated;
grant select on public.notion_roots, public.notion_exclusions to authenticated;
grant all on public.notion_roots, public.notion_exclusions to service_role;

create policy notion_roots_lead_read on public.notion_roots
  for select to authenticated
  using (public.can_see(auth.uid(), dept_id, 'leads_only'));
create policy notion_exclusions_lead_read on public.notion_exclusions
  for select to authenticated
  using (public.can_see(auth.uid(), dept_id, 'leads_only'));

create function private._upsert_notion_root(
  p_org uuid,
  p_dept uuid,
  p_scope text,
  p_notion_id text,
  p_kind text,
  p_top_title text,
  p_visibility text,
  p_include_new boolean,
  p_role text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  missing_count integer;
  root_id uuid;
begin
  if p_org is null or p_dept is null
    or p_scope not in ('workspace','subtree')
    or p_visibility not in ('dept','leads_only')
    or p_include_new is null
    or p_role not in ('org_admin','lead')
    or (p_scope='workspace' and (p_notion_id is not null or p_kind is not null))
    or (p_scope='subtree' and (
      nullif(btrim(p_notion_id),'') is null
      or length(p_notion_id)>500
      or p_kind not in ('page','database')
    )) then
    raise exception using errcode='22023',message='invalid_notion_root';
  end if;
  if not exists(
    select 1 from departments d join orgs o on o.id=d.org_id
    where d.id=p_dept and d.org_id=p_org and not o.is_demo
  ) or not exists(
    select 1 from notion_installations ni
    where ni.org_id=p_org and ni.active and ni.encrypted_token is not null
  ) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  select count(*)::integer into missing_count
  from members where dept_id=p_dept and consented_at is null;
  if missing_count > 0 then
    raise exception using errcode='P0001',message='consent_required:'||missing_count;
  end if;

  if p_scope='workspace' then
    select id into root_id from notion_roots
    where org_id=p_org and scope='workspace' and state<>'disabled'
    for update;
  else
    select id into root_id from notion_roots
    where dept_id=p_dept and scope='subtree' and notion_id=p_notion_id
      and state<>'disabled'
    for update;
  end if;

  if root_id is null then
    insert into notion_roots(
      org_id,dept_id,scope,notion_id,notion_kind,top_title,visibility,
      include_new,created_by,created_role
    ) values(
      p_org,p_dept,p_scope,nullif(btrim(p_notion_id),''),p_kind,
      nullif(left(btrim(public.mask_review_text(p_top_title)),200),''),p_visibility,
      p_include_new,auth.uid(),p_role
    ) returning id into root_id;
  else
    update notion_roots set
      dept_id=p_dept,
      notion_id=nullif(btrim(p_notion_id),''),
      notion_kind=p_kind,
      top_title=nullif(left(btrim(public.mask_review_text(p_top_title)),200),''),
      visibility=p_visibility,
      include_new=p_include_new,
      created_by=auth.uid(),
      created_role=p_role,
      state='pending',
      discover_cursor=null,
      discover_lease=null,
      discover_lease_until=null,
      unsupported_count=0,
      last_error=null
    where id=root_id;
  end if;
  return root_id;
end $$;
revoke all on function private._upsert_notion_root(uuid,uuid,text,text,text,text,text,boolean,text)
  from public,anon,authenticated,service_role;

create function public.admin_upsert_notion_root(
  p_dept uuid,
  p_scope text,
  p_notion_id text,
  p_kind text,
  p_top_title text,
  p_visibility text,
  p_include_new boolean
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=public.admin_org_id();
begin
  if org is null or not exists(
    select 1 from departments where id=p_dept and org_id=org
  ) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  return private._upsert_notion_root(
    org,p_dept,p_scope,p_notion_id,p_kind,p_top_title,
    p_visibility,p_include_new,'org_admin'
  );
end $$;

create function public.lead_upsert_notion_root(
  p_dept uuid,
  p_notion_id text,
  p_kind text,
  p_visibility text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  if not public.can_see(auth.uid(),p_dept,'leads_only') then
    raise exception using errcode='42501',message='forbidden';
  end if;
  select org_id into org from departments where id=p_dept;
  if org is null then raise exception using errcode='42501',message='forbidden'; end if;
  return private._upsert_notion_root(
    org,p_dept,'subtree',p_notion_id,p_kind,null,
    p_visibility,true,'lead'
  );
end $$;

create function public.admin_notion_roots() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare org uuid:=public.admin_org_id();
begin
  if org is null then raise exception using errcode='42501',message='forbidden'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'root_id',r.id,
      'dept_name',d.name,
      'top_title',r.top_title,
      'scope',r.scope,
      'state',r.state,
      'discovered_count',(select count(*) from sources s where s.root_id=r.id),
      'completed_count',(select count(*) from sources s where s.root_id=r.id and s.active and s.last_synced_at is not null and s.last_error is null),
      'pending_count',(select count(*) from sources s where s.root_id=r.id and s.active and s.last_synced_at is null and s.last_error is null),
      'failed_count',(select count(*) from sources s where s.root_id=r.id and s.active and s.last_error is not null),
      'excluded_count',(select count(*) from notion_exclusions e where e.dept_id=r.dept_id),
      'empty_count',(select count(*) from sources s where s.root_id=r.id and s.active and s.last_synced_at is not null and not exists(select 1 from items i where i.source_id=s.id and i.deleted_at is null)),
      'unsupported_count',r.unsupported_count,
      'unassigned_count',coalesce(ni.unassigned_count,0)
    ) order by d.name,r.created_at,r.id)
    from notion_roots r
    join departments d on d.id=r.dept_id
    left join notion_installations ni on ni.org_id=r.org_id
    where r.org_id=org and r.state<>'disabled'
  ),'[]'::jsonb);
end $$;

create function public.set_notion_exclusion(
  p_dept uuid,
  p_notion_id text,
  p_subtree boolean,
  p_excluded boolean
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.can_see(auth.uid(),p_dept,'leads_only') then
    raise exception using errcode='42501',message='forbidden';
  end if;
  if nullif(btrim(p_notion_id),'') is null or length(p_notion_id)>500
    or p_subtree is null or p_excluded is null then
    raise exception using errcode='22023',message='invalid_notion_exclusion';
  end if;
  if not p_excluded then
    delete from notion_exclusions where dept_id=p_dept and notion_id=p_notion_id;
    return found;
  end if;
  insert into notion_exclusions(dept_id,notion_id,subtree,created_by)
    values(p_dept,p_notion_id,p_subtree,auth.uid())
    on conflict(dept_id,notion_id) do update
      set subtree=excluded.subtree,created_by=auth.uid(),created_at=now();

  with recursive affected(id,external_id,path) as (
    select s.id,s.external_id,array[s.external_id]::text[] from sources s
    where s.dept_id=p_dept and s.kind='notion_page' and s.active
      and s.external_id=p_notion_id
    union all
    select child.id,child.external_id,parent.path||child.external_id from sources child
    join affected parent on child.parent_external_id=parent.external_id
    where p_subtree and child.dept_id=p_dept and child.kind='notion_page' and child.active
      and not child.external_id=any(parent.path)
  )
  update items set content='',deleted_at=now()
  where deleted_at is null and source_id in (select id from affected);

  with recursive affected(id,external_id,path) as (
    select s.id,s.external_id,array[s.external_id]::text[] from sources s
    where s.dept_id=p_dept and s.kind='notion_page' and s.active
      and s.external_id=p_notion_id
    union all
    select child.id,child.external_id,parent.path||child.external_id from sources child
    join affected parent on child.parent_external_id=parent.external_id
    where p_subtree and child.dept_id=p_dept and child.kind='notion_page' and child.active
      and not child.external_id=any(parent.path)
  )
  update sources set active=false,last_error='notion_excluded',
    sync_lease=null,sync_lease_until=null
  where id in (select id from affected);
  return true;
end $$;

create function public.claim_notion_discovery(p_root uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare root notion_roots%rowtype; missing_count integer;
begin
  select r.* into root from notion_roots r
  join orgs o on o.id=r.org_id
  join notion_installations ni on ni.org_id=r.org_id and ni.active
  where r.id=p_root and r.state<>'disabled' and not o.is_demo
  for update of r;
  if not found or (root.discover_lease_until is not null and root.discover_lease_until>=now()) then
    return null;
  end if;
  -- The workspace root is the fallback of last resort (design §4): it must not
  -- claim pages that a subtree root of another department is still discovering.
  if root.scope='workspace' and exists(
    select 1 from notion_roots other
    where other.org_id=root.org_id and other.id<>root.id and other.scope='subtree'
      and (other.state='pending' or (other.state='discovering'
        and other.discover_lease_until is not null and other.discover_lease_until>=now()))
  ) then
    return null;
  end if;
  select count(*)::integer into missing_count from members
  where dept_id=root.dept_id and consented_at is null;
  if missing_count>0 then
    update notion_roots set state='paused_consent',discover_lease=null,
      discover_lease_until=null where id=root.id;
    return null;
  end if;
  update notion_roots set state='discovering',discover_lease=p_lease,
    discover_lease_until=now()+interval '2 minutes',last_error=null
  where id=root.id;
  return jsonb_build_object(
    'id',root.id,'scope',root.scope,'notion_id',root.notion_id,
    'notion_kind',root.notion_kind,'top_title',root.top_title,
    'discover_cursor',root.discover_cursor
  );
end $$;

create function public.save_discover_cursor(
  p_root uuid,
  p_lease uuid,
  p_cursor jsonb,
  p_done boolean
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update notion_roots set
    discover_cursor=case when p_done then null else p_cursor end,
    state=case when p_done then 'idle' else 'discovering' end,
    last_discovered_at=case when p_done then now() else last_discovered_at end,
    discover_lease=null,
    discover_lease_until=null,
    last_error=null
  where id=p_root and discover_lease=p_lease;
  return found;
end $$;

create function public.record_notion_discover_unsupported(
  p_root uuid,
  p_count integer
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_count is null or p_count<0 then
    raise exception using errcode='22023',message='invalid_count';
  end if;
  update notion_roots set unsupported_count=unsupported_count+p_count where id=p_root;
  return found;
end $$;

create function public.set_notion_unassigned_count(
  p_root uuid,
  p_count integer
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_count is null or p_count<0 then
    raise exception using errcode='22023',message='invalid_count';
  end if;
  update notion_installations ni set unassigned_count=p_count
  from notion_roots r where r.id=p_root and ni.org_id=r.org_id;
  return found;
end $$;

create function public.notion_page_is_assigned(
  p_root uuid,
  p_page text,
  p_parent text
) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from notion_roots current_root
    where current_root.id=p_root and exists(
      select 1 from notion_roots candidate
      where candidate.org_id=current_root.org_id and candidate.state<>'disabled'
        and (
          candidate.scope='workspace'
          or candidate.notion_id in (p_page,p_parent)
          or exists(
            select 1 from sources s
            where s.root_id=candidate.id and s.active
              and s.external_id in (p_page,p_parent)
          )
        )
    )
  )
$$;

create function public.register_notion_page(
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

  -- Nearest ancestor subtree root wins. A department-scoped root only competes
  -- inside its own department; the workspace fallback competes against every
  -- subtree root in the organization, so another department's mapping keeps
  -- its pages out of the fallback department.
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
  -- Owned by another department's subtree root: the fallback must not copy it here.
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
  insert into jobs(id,kind,payload)
    values(md5('notion-root-import:'||source_id)::uuid,'notion_import',jsonb_build_object('sourceId',source_id))
    on conflict(id) do nothing;
  return 'created';
exception when unique_violation then
  update sources set root_id=root.id
  where dept_id=root.dept_id and kind='notion_page'
    and external_id=p_page and active;
  return 'linked';
end $$;

create function public.queue_notion_database(
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
    insert into jobs(kind,payload) values('notion_discover',jsonb_build_object('rootId',root.id));
  end if;
  return true;
end $$;

create function public.settle_notion_root(p_root uuid) returns boolean
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
      insert into jobs(kind,payload)
        values('notion_discover',jsonb_build_object('rootId',root.id));
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
    when job.kind='notion_discover' then root.dept_id
    else null
  end into dept
  from jobs job
  left join sources source
    on job.kind='notion_import' and source.id=(job.payload->>'sourceId')::uuid
  left join notion_roots root
    on job.kind='notion_discover' and root.id=(job.payload->>'rootId')::uuid
  where job.id=p_job;
  return public.notion_installation_for_department(dept);
end $$;

revoke all on function public.admin_upsert_notion_root(uuid,text,text,text,text,text,boolean),
  public.lead_upsert_notion_root(uuid,text,text,text),public.admin_notion_roots(),
  public.set_notion_exclusion(uuid,text,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_upsert_notion_root(uuid,text,text,text,text,text,boolean),
  public.lead_upsert_notion_root(uuid,text,text,text),public.admin_notion_roots(),
  public.set_notion_exclusion(uuid,text,boolean,boolean)
  to authenticated;

revoke all on function public.claim_notion_discovery(uuid,uuid),
  public.save_discover_cursor(uuid,uuid,jsonb,boolean),
  public.record_notion_discover_unsupported(uuid,integer),
  public.set_notion_unassigned_count(uuid,integer),
  public.notion_page_is_assigned(uuid,text,text),
  public.register_notion_page(uuid,text,text,timestamptz,text),
  public.queue_notion_database(uuid,text,text),public.settle_notion_root(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_notion_discovery(uuid,uuid),
  public.save_discover_cursor(uuid,uuid,jsonb,boolean),
  public.record_notion_discover_unsupported(uuid,integer),
  public.set_notion_unassigned_count(uuid,integer),
  public.notion_page_is_assigned(uuid,text,text),
  public.register_notion_page(uuid,text,text,timestamptz,text),
  public.queue_notion_database(uuid,text,text),public.settle_notion_root(uuid)
  to service_role;

revoke all on function public.notion_installation_for_job(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.notion_installation_for_job(uuid) to service_role;
