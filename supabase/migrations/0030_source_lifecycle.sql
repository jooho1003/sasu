-- ADR-052: one original version, atomic invalidation, no resurrection from stale jobs/backfill.
alter table public.items add column content_version bigint not null default 1;
alter table public.decision_requests add column origin_content_version bigint;
alter table public.decision_requests add column source_invalidated boolean not null default false;
alter table public.sources add column auto_sync boolean not null default false;
alter table public.sources add column next_sync_at timestamptz;
alter table public.sources add column sync_lease uuid;
alter table public.sources add column sync_lease_until timestamptz;

create table public.slack_message_versions (
  source_id uuid not null references public.sources,
  external_ref text not null,
  changed_at numeric(20,6) not null,
  deleted boolean not null default false,
  primary key(source_id,external_ref)
);
alter table public.slack_message_versions enable row level security;
revoke all on public.slack_message_versions from public,anon,authenticated;
grant all on public.slack_message_versions to service_role;

create function public.version_item() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.external_ref is not null then
      perform pg_advisory_xact_lock(hashtextextended(new.source_id::text||':'||new.external_ref,0));
      if exists(select 1 from slack_message_versions where source_id=new.source_id and external_ref=new.external_ref and deleted) then return null; end if;
    end if;
    return new;
  end if;
  if new.content is distinct from old.content or new.deleted_at is distinct from old.deleted_at then
    new.content_version:=old.content_version+1;
    new.embedding:=null; new.embed_model:=null; new.embed_status:='pending';
    if new.deleted_at is not null then new.content:=''; new.embed_status:='deleted'; end if;
  end if;
  return new;
end $$;
revoke all on function public.version_item() from public,anon,authenticated,service_role;
create trigger items_version before insert or update of content,deleted_at on public.items for each row execute function public.version_item();

create function public.invalidate_item_derivatives() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.content_version=old.content_version then return new; end if;
  delete from classifications where item_id=new.id;
  -- Historical decisions/citations remain append-only; unmade decisions need fresh review.
  update decision_requests r set status='needs_review',source_invalidated=true,title='근거 변경 · 재검토 필요',background='근거 원문이 변경되어 다시 검토해야 합니다.',recommendation=null,
    slack_delivery_status='skipped',slack_delivery_error='source_changed'
    where r.status in ('open','deferred','needs_review') and (r.origin_item_id=new.id or exists(
      select 1 from citations c where c.owner_kind='decision_request' and c.owner_id=r.id and c.item_id=new.id));
  if new.deleted_at is null and length(btrim(new.content))>0 then
    insert into jobs(id,kind,payload) values(md5('source-classify:'||new.id||':'||new.content_version)::uuid,'classify',
      jsonb_build_object('itemId',new.id,'contentVersion',new.content_version)) on conflict(id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.invalidate_item_derivatives() from public,anon,authenticated,service_role;
create trigger items_invalidate after update on public.items for each row execute function public.invalidate_item_derivatives();

create function public.apply_slack_change(p_event text,p_source uuid,p_ref text,p_changed_at text,p_author text,p_content text,p_deleted boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; m members%rowtype; v slack_message_versions%rowtype; current_item items%rowtype; eid text;
begin
  if p_deleted is null or p_ref !~ '^\d{1,12}\.\d{1,6}$' or p_changed_at !~ '^\d{1,12}\.\d{1,6}$' or nullif(p_event,'') is null
    or p_ref is null or p_changed_at is null then raise exception using errcode='22023',message='invalid_change'; end if;
  if p_changed_at::numeric<p_ref::numeric then return false; end if;
  select x.* into s from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.id=p_source and x.kind='slack_channel' and x.active and not o.is_demo for share of x;
  if not found then return false; end if;
  if not p_deleted then
    select * into m from members where dept_id=s.dept_id and slack_user_id=p_author and consented_at is not null for share;
    if not found or p_content is null then return false; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(s.id::text||':'||p_ref,0));
  select * into v from slack_message_versions where source_id=s.id and external_ref=p_ref;
  if found and (v.deleted or v.changed_at>=p_changed_at::numeric) then return false; end if;
  select * into current_item from items where source_id=s.id and external_ref=p_ref for update;
  if not p_deleted and current_item.id is not null and current_item.author_ext_id is distinct from p_author then return false; end if;
  insert into ingest_events(event_id) values(p_event) on conflict do nothing returning event_id into eid;
  if eid is null then return false; end if;
  insert into slack_message_versions values(s.id,p_ref,p_changed_at::numeric,p_deleted)
    on conflict(source_id,external_ref) do update set changed_at=excluded.changed_at,deleted=excluded.deleted;
  if p_deleted then
    update items set content='',deleted_at=now() where source_id=s.id and external_ref=p_ref and deleted_at is null;
  elsif current_item.id is not null then
    update items set content=p_content where id=current_item.id and deleted_at is null;
  else
    insert into items(source_id,dept_id,external_ref,author_ext_id,author,spoken_at,content)
      values(s.id,s.dept_id,p_ref,p_author,m.display_name,to_timestamp(p_ref::numeric),p_content) returning * into current_item;
    if length(btrim(p_content))>0 then
      insert into jobs(id,kind,payload) values(md5('source-classify:'||current_item.id||':1')::uuid,'classify',jsonb_build_object('itemId',current_item.id,'contentVersion',1)) on conflict(id) do nothing;
    end if;
  end if;
  return true;
end $$;
revoke all on function public.apply_slack_change(text,uuid,text,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.apply_slack_change(text,uuid,text,text,text,text,boolean) to service_role;

create function public.complete_item_classification(p_item uuid,p_version bigint,p_values jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from items i join sources s on s.id=i.source_id where i.id=p_item and i.content_version=p_version and i.deleted_at is null and s.active for share of i,s;
  if not found then return false; end if;
  if p_values->>'label' not in ('decision','action','info','chatter','unclassified') or p_values->>'method' not in ('rule','llm') then
    raise exception using errcode='22023',message='invalid_classification'; end if;
  insert into classifications(item_id,label,method,confidence,deadline_hint,assignee_hint,reasoning)
    values(p_item,p_values->>'label',p_values->>'method',(p_values->>'confidence')::numeric,(p_values->>'deadline_hint')::timestamptz,p_values->>'assignee_hint',p_values->>'reasoning')
    on conflict(item_id) do update set label=excluded.label,method=excluded.method,confidence=excluded.confidence,deadline_hint=excluded.deadline_hint,assignee_hint=excluded.assignee_hint,reasoning=excluded.reasoning;
  return true;
end $$;
create function public.complete_item_embedding(p_item uuid,p_version bigint,p_embedding vector(1024),p_model text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update items i set embedding=p_embedding,embed_model=p_model,embed_status='done'
    where i.id=p_item and i.content_version=p_version and i.deleted_at is null and exists(select 1 from sources s where s.id=i.source_id and s.active);
  return found;
end $$;
revoke all on function public.complete_item_classification(uuid,bigint,jsonb),public.complete_item_embedding(uuid,bigint,vector,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_item_classification(uuid,bigint,jsonb),public.complete_item_embedding(uuid,bigint,vector,text) to service_role;

create function public.begin_notion_sync(p_source uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update sources s set sync_lease=p_lease,sync_lease_until=now()+interval '5 minutes' where s.id=p_source and s.active and s.kind='notion_page'
    and (s.sync_lease_until is null or s.sync_lease_until<now())
    and exists(select 1 from departments d join orgs o on o.id=d.org_id where d.id=s.dept_id and not o.is_demo);
  return found;
end $$;
create function public.finish_notion_sync(p_source uuid,p_lease uuid,p_items jsonb,p_title text) returns jsonb
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
      insert into jobs(id,kind,payload) values(md5('source-classify:'||item.id||':1')::uuid,'classify',jsonb_build_object('itemId',item.id,'contentVersion',1)) on conflict(id) do nothing;
      n_insert:=n_insert+1;
    elsif item.content is distinct from row->>'content' or item.deleted_at is not null then
      update items set content=row->>'content',deleted_at=null where id=item.id;
      n_update:=n_update+1;
    end if;
  end loop;
  update items i set content='',deleted_at=now() where i.source_id=s.id and i.deleted_at is null
    and not exists(select 1 from jsonb_array_elements(p_items) x where x->>'external_ref'=i.external_ref);
  get diagnostics n_delete=row_count;
  update sources set title=coalesce(p_title,title),last_synced_at=now(),last_error=null,sync_lease=null,sync_lease_until=null where id=s.id;
  return jsonb_build_object('inserted',n_insert,'updated',n_update,'deleted',n_delete);
end $$;
create function public.release_notion_sync(p_source uuid,p_lease uuid,p_error text) returns void
language sql security definer set search_path=public,pg_temp as $$
  update sources set sync_lease=null,sync_lease_until=null,last_error=case when p_error in ('notion_not_configured','notion_rate_limited','notion_api_failed') then p_error else 'notion_api_failed' end
    where id=p_source and sync_lease=p_lease;
$$;
create function public.schedule_source_syncs() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; n int:=0;
begin
  for s in select x.* from sources x join departments d on d.id=x.dept_id join orgs o on o.id=d.org_id
    where x.kind='notion_page' and x.active and x.auto_sync and not o.is_demo and coalesce(x.next_sync_at,'epoch')<=now()
    order by x.id limit 20 for update of x skip locked loop
    if not exists(select 1 from jobs where kind='notion_import' and payload->>'sourceId'=s.id::text and status in ('queued','running')) then
      insert into jobs(kind,payload) values('notion_import',jsonb_build_object('sourceId',s.id)); n:=n+1;
    end if;
    update sources set next_sync_at=now()+interval '5 minutes' where id=s.id;
  end loop;
  return n;
end $$;
create function public.set_notion_auto_sync(p_source uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update sources s set auto_sync=p_enabled,next_sync_at=case when p_enabled then now() else null end
    where s.id=p_source and s.kind='notion_page' and s.active and p_enabled is not null and can_see(auth.uid(),s.dept_id,'leads_only')
    and exists(select 1 from departments d join orgs o on o.id=d.org_id where d.id=s.dept_id and not o.is_demo);
  if not found then raise exception using errcode='42501',message='source_forbidden'; end if;
end $$;
revoke all on function public.begin_notion_sync(uuid,uuid),public.finish_notion_sync(uuid,uuid,jsonb,text),public.release_notion_sync(uuid,uuid,text),public.schedule_source_syncs(),public.set_notion_auto_sync(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.begin_notion_sync(uuid,uuid),public.finish_notion_sync(uuid,uuid,jsonb,text),public.release_notion_sync(uuid,uuid,text),public.schedule_source_syncs() to service_role;
grant execute on function public.set_notion_auto_sync(uuid,boolean) to authenticated;

-- Publish a freshly generated card only if its origin and every quoted source are still current.
create function public.guard_card_source_version() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare i items%rowtype;
begin
  if new.source_invalidated and new.status='open' then raise exception using errcode='40001',message='source_changed'; end if;
  if new.origin_content_version is null or new.source_invalidated then return new; end if;
  if tg_op='INSERT' or (new.status='open' and old.status<>'open') then
    select * into i from items where id=new.origin_item_id for share;
    if i.id is null or i.deleted_at is not null or i.content_version<>new.origin_content_version then
      raise exception using errcode='40001',message='source_changed'; end if;
    if tg_op='UPDATE' and exists(select 1 from citations c left join items x on x.id=c.item_id left join sources s on s.id=x.source_id
      where c.owner_kind='decision_request' and c.owner_id=new.id and c.item_id is not null
      and (x.id is null or x.deleted_at is not null or not s.active or position(c.quote in x.content)=0)) then
      raise exception using errcode='40001',message='source_changed'; end if;
  end if;
  return new;
end $$;
create function public.queue_invalidated_card() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.source_invalidated and new.slack_message_ts is not null and new.slack_channel_id is not null then
    insert into jobs(id,kind,payload) values(md5('invalidate-card:'||new.id||':'||new.slack_message_ts)::uuid,'send_slack',jsonb_build_object('requestId',new.id)) on conflict(id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.guard_card_source_version(),public.queue_invalidated_card() from public,anon,authenticated,service_role;
create trigger cards_source_version before insert or update of status on public.decision_requests for each row execute function public.guard_card_source_version();
create trigger cards_invalidated after update on public.decision_requests for each row execute function public.queue_invalidated_card();

-- Preserve audit snapshots but don't present invalidated card quotes as current evidence.
create policy citations_current_card on public.citations as restrictive for select to authenticated
  using(owner_kind<>'decision_request' or exists(select 1 from public.decision_requests r where r.id=owner_id and not r.source_invalidated));

create function public.fail_source_job(p_job uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j jobs%rowtype; i items%rowtype; v bigint;
begin
  select * into j from jobs where id=p_job;
  if not found or j.kind not in ('classify','embed','make_card') then return; end if;
  v:=coalesce((j.payload->>'contentVersion')::bigint,1);
  select * into i from items where id=coalesce(j.payload->>'itemId',j.payload->>'item_id')::uuid and content_version=v and deleted_at is null for update;
  if not found then return; end if;
  if j.kind='classify' then
    insert into classifications(item_id,label,method) values(i.id,'unclassified','llm') on conflict(item_id) do nothing;
  elsif j.kind='embed' then
    update items set embed_status='failed' where id=i.id and embed_status='pending';
  end if;
  -- Card generation inserts needs_review first. A failed duplicate must never demote an open/decided card.
end $$;
revoke all on function public.fail_source_job(uuid) from public,anon,authenticated,service_role;
grant execute on function public.fail_source_job(uuid) to service_role;

create function public.append_current_card_evidence(p_request uuid,p_item uuid,p_version bigint,p_quote text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare i items%rowtype; r decision_requests%rowtype; visibility text;
begin
  select * into i from items where id=p_item and content_version=p_version and deleted_at is null and content=p_quote for share;
  if not found then return false; end if;
  select s.visibility into visibility from sources s where s.id=i.source_id and s.active for share;
  if not found then return false; end if;
  select * into r from decision_requests where id=p_request and dept_id=i.dept_id and status='open' and not source_invalidated for update;
  if not found or (visibility='leads_only' and r.visibility<>'leads_only') then return false; end if;
  insert into citations(owner_kind,owner_id,item_id,quote) values('decision_request',r.id,i.id,p_quote)
    on conflict(owner_kind,owner_id,item_id) where item_id is not null do nothing;
  return true;
end $$;
revoke all on function public.append_current_card_evidence(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.append_current_card_evidence(uuid,uuid,bigint,text) to service_role;
