-- ADR-060 Step 3: keep existing Notion sources on import v1 while new sources
-- can use heading chunks and reference-only ingestion.
alter table public.sources
  add column import_version smallint not null default 1
    check (import_version in (1, 2)),
  add column ingest_mode text not null default 'classify'
    check (ingest_mode in ('classify', 'reference')),
  add column root_id uuid,
  add column remote_edited_at timestamptz,
  add column parent_external_id text;

-- Preflight before applying this migration:
-- select dept_id, external_id, count(*)
-- from public.sources
-- where kind = 'notion_page' and active
-- group by dept_id, external_id
-- having count(*) > 1;
-- Any returned row is a data conflict. Do not delete it silently: this unique
-- index must fail until an operator resolves the duplicate explicitly.
create unique index notion_active_page_per_department
  on public.sources(dept_id, external_id)
  where kind = 'notion_page' and active;

create or replace function public.invalidate_item_derivatives() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare mode text;
begin
  if new.content_version=old.content_version then return new; end if;
  delete from classifications where item_id=new.id;
  -- Historical decisions/citations remain append-only; unmade decisions need fresh review.
  update decision_requests r set status='needs_review',source_invalidated=true,title='근거 변경 · 재검토 필요',background='근거 원문이 변경되어 다시 검토해야 합니다.',recommendation=null,
    slack_delivery_status='skipped',slack_delivery_error='source_changed'
    where r.status in ('open','deferred','needs_review') and (r.origin_item_id=new.id or exists(
      select 1 from citations c where c.owner_kind='decision_request' and c.owner_id=r.id and c.item_id=new.id));
  if new.deleted_at is null and length(btrim(new.content))>0 then
    select ingest_mode into mode from sources where id=new.source_id;
    if mode='reference' then
      insert into jobs(id,kind,payload) values(md5('source-embed:'||new.id||':'||new.content_version)::uuid,'embed',
        jsonb_build_object('itemId',new.id,'contentVersion',new.content_version)) on conflict(id) do nothing;
    else
      insert into jobs(id,kind,payload) values(md5('source-classify:'||new.id||':'||new.content_version)::uuid,'classify',
        jsonb_build_object('itemId',new.id,'contentVersion',new.content_version)) on conflict(id) do nothing;
    end if;
  end if;
  return new;
end $$;

drop function public.finish_notion_sync(uuid,uuid,jsonb,text);
create function public.finish_notion_sync(
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
      if s.ingest_mode='reference' then
        insert into jobs(id,kind,payload) values(md5('source-embed:'||item.id||':1')::uuid,'embed',jsonb_build_object('itemId',item.id,'contentVersion',1)) on conflict(id) do nothing;
      else
        insert into jobs(id,kind,payload) values(md5('source-classify:'||item.id||':1')::uuid,'classify',jsonb_build_object('itemId',item.id,'contentVersion',1)) on conflict(id) do nothing;
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
  update sources set title=coalesce(p_title,title),remote_edited_at=coalesce(p_remote_edited_at,remote_edited_at),last_synced_at=now(),last_error=null,sync_lease=null,sync_lease_until=null where id=s.id;
  return jsonb_build_object('inserted',n_insert,'updated',n_update,'deleted',n_delete);
end $$;

create or replace function public.release_notion_sync(p_source uuid,p_lease uuid,p_error text) returns void
language sql security definer set search_path=public,pg_temp as $$
  update sources set sync_lease=null,sync_lease_until=null,last_error=case when p_error in (
    'notion_not_configured','notion_rate_limited','notion_api_failed','notion_not_found','notion_page_too_large','notion_database_unsupported'
  ) then p_error else 'notion_api_failed' end
    where id=p_source and sync_lease=p_lease;
$$;

create function public.retire_notion_source(p_source uuid,p_lease uuid,p_reason text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype;
begin
  select * into s from sources where id=p_source and kind='notion_page' and active and sync_lease=p_lease and sync_lease_until>now() for update;
  if not found then return false; end if;
  update sources set active=false,last_error=case when p_reason in ('notion_not_found','notion_database_unsupported') then p_reason else 'notion_api_failed' end,
    sync_lease=null,sync_lease_until=null where id=s.id;
  update items set content='',deleted_at=now() where source_id=s.id and deleted_at is null;
  return true;
end $$;

create function public.convert_notion_source_v2(p_source uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype;
begin
  select x.* into s from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.id=p_source and x.kind='notion_page' and x.active and not o.is_demo
      and can_see(auth.uid(),x.dept_id,'leads_only') for update of x;
  if not found then raise exception using errcode='42501',message='source_forbidden'; end if;
  update sources set import_version=2 where id=s.id;
  if not exists(select 1 from jobs where kind='notion_import' and payload->>'sourceId'=s.id::text and status in ('queued','running')) then
    insert into jobs(kind,payload) values('notion_import',jsonb_build_object('sourceId',s.id));
  end if;
  return true;
end $$;

revoke all on function public.finish_notion_sync(uuid,uuid,jsonb,text,timestamptz),
  public.release_notion_sync(uuid,uuid,text),public.retire_notion_source(uuid,uuid,text),
  public.convert_notion_source_v2(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finish_notion_sync(uuid,uuid,jsonb,text,timestamptz),
  public.release_notion_sync(uuid,uuid,text),public.retire_notion_source(uuid,uuid,text) to service_role;
grant execute on function public.convert_notion_source_v2(uuid) to authenticated;
