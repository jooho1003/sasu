-- ADR-057/058. Apply only after isolated Storage integration and rollout approval.
create table public.org_settings (
  org_id uuid primary key references public.orgs,
  browser_recording_enabled boolean not null default false,
  allow_original_download boolean not null default false,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);
alter table public.retention_settings add column review_original_days integer
  check (review_original_days in (30,90,365));
create table public.review_access_events (
  id bigint generated always as identity primary key,
  review_id uuid not null references public.reviewed_materials,
  dept_id uuid not null references public.departments,
  actor_id uuid not null references auth.users,
  action text not null check(action in ('play_original','download_original','export','reextract')),
  created_at timestamptz not null default clock_timestamp()
);
create index review_access_actor_time on public.review_access_events(actor_id,created_at desc);
create index review_access_dept_time on public.review_access_events(dept_id,created_at desc);
create table private.review_access_tickets (
  token uuid primary key default gen_random_uuid(),
  event_id bigint not null unique references public.review_access_events,
  expires_at timestamptz not null default clock_timestamp()+interval '60 seconds',
  used_transaction bigint
);
revoke all on private.review_access_tickets from public,anon,authenticated,service_role;
alter table public.org_settings enable row level security;
alter table public.review_access_events enable row level security;
revoke all on public.org_settings,public.review_access_events from public,anon,authenticated,service_role;
grant select on public.org_settings,public.review_access_events to authenticated,service_role;
-- New tables must preserve the reviewer hard stop introduced in 0036.
create trigger demo_reviewer_read_only before insert or update or delete on public.org_settings
  for each statement execute function private.reject_demo_reviewer_mutation();
create trigger demo_reviewer_read_only before insert or update or delete on public.review_access_events
  for each statement execute function private.reject_demo_reviewer_mutation();

create function public.can_read_review_access(p_dept uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select review_editor(p_dept,auth.uid()) or exists (
    select 1 from departments d where d.id=p_dept and private.is_org_admin(auth.uid(),d.org_id)
  )
$$;
revoke all on function public.can_read_review_access(uuid) from public,anon,service_role;
grant execute on function public.can_read_review_access(uuid) to authenticated;
create policy review_access_read on public.review_access_events for select to authenticated
  using(can_read_review_access(dept_id));
create policy review_org_settings_read on public.org_settings for select to authenticated
  using(exists(select 1 from departments d where d.org_id=org_settings.org_id and can_read_review_access(d.id)));

create function public.review_org_settings(p_dept uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  return coalesce((select jsonb_build_object('browser_recording_enabled',s.browser_recording_enabled,'allow_original_download',s.allow_original_download)
    from org_settings s join departments d on d.org_id=s.org_id where d.id=p_dept),
    '{"browser_recording_enabled":false,"allow_original_download":false}'::jsonb);
end $$;
create function public.admin_review_settings() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare oid uuid:=admin_org_id();
begin
  if oid is null then raise exception using errcode='42501',message='forbidden'; end if;
  return coalesce((select jsonb_build_object('browser_recording_enabled',browser_recording_enabled,'allow_original_download',allow_original_download) from org_settings where org_id=oid),
    '{"browser_recording_enabled":false,"allow_original_download":false}'::jsonb);
end $$;
alter table public.admin_events drop constraint admin_events_action_check;
alter table public.admin_events add constraint admin_events_action_check check(action in (
  'department_create','first_lead_invite','member_invite','invite_revoke','invite_accept',
  'lead_promote','lead_demote','member_remove','trailer_publishing_toggle','trailer_unpublish','review_settings_update'
));
create function public.admin_set_review_settings(p_recording boolean,p_download boolean) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid:=admin_org_id();
begin
  if oid is null or exists(select 1 from orgs where id=oid and is_demo) then raise exception using errcode='42501',message='forbidden'; end if;
  if p_recording is null or p_download is null then raise exception using errcode='22023',message='invalid_settings'; end if;
  insert into org_settings(org_id,browser_recording_enabled,allow_original_download,updated_by)
    values(oid,p_recording,p_download,auth.uid()) on conflict(org_id) do update
    set browser_recording_enabled=excluded.browser_recording_enabled,allow_original_download=excluded.allow_original_download,updated_by=auth.uid(),updated_at=now();
  insert into admin_events(org_id,actor_id,action,target) values(oid,auth.uid(),'review_settings_update',
    jsonb_build_object('browser_recording_enabled',p_recording,'allow_original_download',p_download));
  return true;
end $$;
create function public.admin_review_access_events(p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare oid uuid:=admin_org_id();
begin
  if oid is null then raise exception using errcode='42501',message='forbidden'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode='22023',message='invalid_limit'; end if;
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc) from (
    select a.id,a.review_id,a.dept_id,a.actor_id,a.action,a.created_at from review_access_events a
    join departments d on d.id=a.dept_id where d.org_id=oid order by a.created_at desc,a.id desc limit p_limit
  ) e),'[]'::jsonb);
end $$;

create function private.review_original_available(p_review uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from reviewed_materials r left join retention_settings s on s.dept_id=r.dept_id
    where r.id=p_review and r.deleted_at is null and r.original_deleted_at is null and r.original_path is not null
    and (r.confirmed_at is null or s.review_original_days is null or r.confirmed_at+make_interval(days=>s.review_original_days)>statement_timestamp())
    and not exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=r.dept_id and m.user_id=u and m.consented_at is not null)))
$$;
revoke all on function private.review_original_available(uuid) from public,anon,authenticated,service_role;

create function public.authorize_review_access(p_dept uuid,p_review uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; eid bigint; ticket uuid; oid uuid;
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  select * into r from reviewed_materials where id=p_review and dept_id=p_dept and deleted_at is null;
  if not found then raise exception using errcode='42501',message='review_editor_required'; end if;
  if p_action is null or p_action not in ('play_original','download_original','export','reextract')
    or (p_action='play_original' and r.kind<>'audio') then raise exception using errcode='22023',message='invalid_access_action'; end if;
  if p_action<>'export' and not private.review_original_available(r.id) then raise exception using errcode='P0002',message='original_unavailable'; end if;
  select org_id into oid from departments where id=p_dept;
  if p_action='download_original' and not coalesce((select allow_original_download from org_settings where org_id=oid),false)
    then raise exception using errcode='42501',message='original_download_disabled'; end if;
  -- Serialize all departments for this actor; failed Storage delivery still consumes an issuance.
  perform pg_advisory_xact_lock(hashtextextended('review-access:'||auth.uid()::text,0));
  if (select count(*) from review_access_events where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
    then raise exception using errcode='P0001',message='rate_limited'; end if;
  insert into review_access_events(review_id,dept_id,actor_id,action) values(r.id,r.dept_id,auth.uid(),p_action) returning id into eid;
  if p_action in ('play_original','download_original') then
    insert into private.review_access_tickets(event_id) values(eid) returning token into ticket;
  end if;
  return jsonb_build_object('token',ticket,'path',r.original_path,'kind',r.kind,'filename',r.filename);
end $$;

create function public.consume_review_access(p_name text) returns boolean
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare raw_token text; t private.review_access_tickets%rowtype; a review_access_events%rowtype; r reviewed_materials%rowtype;
begin
  -- Do not allow sign URLs (caller controls their TTL), list, image transforms, or copy.
  if coalesce(current_setting('storage.operation',true),'') not in ('storage.object.get_authenticated','object.get_authenticated') then return false; end if;
  raw_token:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-sasu-review-access';
  if raw_token is null or raw_token !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return false; end if;
  select * into t from private.review_access_tickets where token=raw_token::uuid for update;
  if not found or t.expires_at<=clock_timestamp() or (t.used_transaction is not null and t.used_transaction<>txid_current()) then return false; end if;
  select * into a from review_access_events where id=t.event_id;
  if a.actor_id is distinct from auth.uid() or not review_editor(a.dept_id,auth.uid()) then return false; end if;
  select * into r from reviewed_materials where id=a.review_id;
  if r.original_path is distinct from p_name or not private.review_original_available(r.id) then return false; end if;
  if a.action='play_original' and r.kind<>'audio' then return false; end if;
  if a.action='download_original' and not coalesce((select s.allow_original_download from org_settings s join departments d on d.org_id=s.org_id where d.id=r.dept_id),false) then return false; end if;
  if a.action not in ('play_original','download_original') then return false; end if;
  update private.review_access_tickets set used_transaction=txid_current() where token=t.token and used_transaction is null;
  return true;
end $$;
revoke all on function public.consume_review_access(text) from public,anon,service_role;
grant execute on function public.consume_review_access(text) to authenticated;

-- Keep upload rules, but never permit old SELECT callers to bypass the access ticket.
create or replace function public.review_storage_allowed(p_name text,p_write boolean) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_write and exists(select 1 from reviewed_materials r where private.review_original_available(r.id)
    and review_editor(r.dept_id,auth.uid())
    and (r.original_path=p_name or exists(select 1 from review_parts p where p.review_id=r.id and p.object_path=p_name and p.status in ('waiting','failed'))))
$$;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists review_objects_select on storage.objects';
    execute 'create policy review_objects_select on storage.objects for select to authenticated using(bucket_id=''review-materials'' and public.consume_review_access(name))';
    -- Restrictive policy also prevents another permissive policy opening this bucket.
    execute 'create policy review_objects_access_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>''review-materials'' or public.consume_review_access(name))';
  end if;
end $$;

create function public.set_review_original_retention(p_dept uuid,p_days integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if p_days is not null and p_days not in (30,90,365) then raise exception using errcode='22023',message='invalid_retention'; end if;
  insert into retention_settings(dept_id,review_original_days,checked_by) values(p_dept,p_days,auth.uid())
    on conflict(dept_id) do update set review_original_days=p_days,checked_by=auth.uid(),updated_at=now();
  return true;
end $$;

-- Wrap the existing state machine. Logging and reextract transition commit together.
alter function public.review_action(uuid,integer,text) rename to review_action_before_access_controls;
revoke all on function public.review_action_before_access_controls(uuid,integer,text) from public,anon,authenticated,service_role;
create function public.review_action(p_review uuid,p_revision integer,p_action text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare did uuid;
begin
  if p_action='reextract' then
    select dept_id into did from reviewed_materials where id=p_review;
    perform authorize_review_access(did,p_review,'reextract');
  end if;
  return review_action_before_access_controls(p_review,p_revision,p_action);
end $$;

-- Expiry is a fence, not just a scheduler hint. Queuing cannot resume an expired original.
alter function public.queue_review_part(uuid,integer) rename to queue_review_part_before_access_controls;
revoke all on function public.queue_review_part_before_access_controls(uuid,integer) from public,anon,authenticated,service_role;
create function public.queue_review_part(p_review uuid,p_index integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from reviewed_materials where id=p_review and review_editor(dept_id,auth.uid())) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not private.review_original_available(p_review) then raise exception using errcode='P0002',message='original_unavailable'; end if;
  return queue_review_part_before_access_controls(p_review,p_index);
end $$;

alter function public.claim_review_part(uuid,integer,uuid) rename to claim_review_part_before_access_controls;
revoke all on function public.claim_review_part_before_access_controls(uuid,integer,uuid) from public,anon,authenticated,service_role;
create function public.claim_review_part(p_part uuid,p_attempt integer,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(private.review_original_available((select review_id from review_parts where id=p_part)),false) then return null; end if;
  return claim_review_part_before_access_controls(p_part,p_attempt,p_lease);
end $$;
alter function public.finish_review_part(uuid,uuid,jsonb,text) rename to finish_review_part_before_access_controls;
revoke all on function public.finish_review_part_before_access_controls(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
create function public.finish_review_part(p_part uuid,p_lease uuid,p_sections jsonb,p_error text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not coalesce(private.review_original_available((select review_id from review_parts where id=p_part)),false) then return false; end if;
  return finish_review_part_before_access_controls(p_part,p_lease,p_sections,p_error);
end $$;
revoke all on function public.claim_review_part(uuid,integer,uuid),public.finish_review_part(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.claim_review_part(uuid,integer,uuid),public.finish_review_part(uuid,uuid,jsonb,text) to service_role;

create function public.sweep_review_originals() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; n integer:=0;
begin
  for r in select m.* from reviewed_materials m join retention_settings s on s.dept_id=m.dept_id
    where m.original_deleted_at is null and m.deleted_at is null and m.confirmed_at is not null
      and s.review_original_days is not null and m.confirmed_at+make_interval(days=>s.review_original_days)<=now()
    order by m.id limit 100 for update of m skip locked loop
    update reviewed_materials set original_deleted_at=now(),status=case when status in ('uploading','processing') then 'cancelled' else status end,
      status_reason='original_expired',updated_at=now() where id=r.id;
    update review_parts set status=case when status='done' then status else 'cancelled' end,lease=null,lease_until=null,updated_at=now() where review_id=r.id;
    update jobs set status='failed',last_error='original_expired',lease_until=null where kind='process_review'
      and payload->>'partId' in (select id::text from review_parts where review_id=r.id) and status in ('queued','running');
    insert into jobs(id,kind,payload) values(md5('review-expiry:'||r.id)::uuid,'purge_review_files',jsonb_build_object('reviewId',r.id)) on conflict(id) do nothing;
    n:=n+1;
  end loop;
  delete from private.review_access_tickets where expires_at<now()-interval '1 minute';
  return n;
end $$;
revoke all on function public.sweep_review_originals() from public,anon,authenticated;
grant execute on function public.sweep_review_originals() to service_role;
revoke all on function public.review_org_settings(uuid),public.admin_review_settings(),public.admin_set_review_settings(boolean,boolean),public.admin_review_access_events(integer),public.authorize_review_access(uuid,uuid,text),public.set_review_original_retention(uuid,integer),public.review_action(uuid,integer,text),public.queue_review_part(uuid,integer) from public,anon,service_role;
grant execute on function public.review_org_settings(uuid),public.admin_review_settings(),public.admin_set_review_settings(boolean,boolean),public.admin_review_access_events(integer),public.authorize_review_access(uuid,uuid,text),public.set_review_original_retention(uuid,integer),public.review_action(uuid,integer,text),public.queue_review_part(uuid,integer) to authenticated;
