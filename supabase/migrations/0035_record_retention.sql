-- Metadata only. No independent permanent copy of deleted Slack messages.
create table public.retention_settings (
  dept_id uuid primary key references public.departments, plan text not null default 'unknown' check(plan in ('unknown','free','paid')),
  expires_at date, retention_days integer check(retention_days in (90,365)), checked_at timestamptz, checked_by uuid references auth.users,
  updated_at timestamptz not null default now()
);
create table public.retention_exports (
  id uuid primary key default gen_random_uuid(), dept_id uuid not null references public.departments, source_id uuid not null references public.sources,
  created_by uuid not null references auth.users, range_from timestamptz not null, range_to timestamptz not null,
  record_count integer not null, checksum text not null, created_at timestamptz not null default now()
);
alter table public.retention_settings enable row level security;
alter table public.retention_exports enable row level security;
revoke all on public.retention_settings,public.retention_exports from public,anon,authenticated;
grant select on public.retention_settings,public.retention_exports to authenticated;
grant all on public.retention_settings,public.retention_exports to service_role;
create policy retention_settings_read on public.retention_settings for select to authenticated using(can_see(auth.uid(),dept_id,'leads_only'));
create policy retention_exports_read on public.retention_exports for select to authenticated using(can_see(auth.uid(),dept_id,'leads_only'));
create function public.set_retention_settings(p_dept uuid,p_plan text,p_expires date,p_days integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='lead_required'; end if;
  if p_plan is null or p_plan not in ('unknown','free','paid') or (p_days is not null and p_days not in (90,365)) then raise exception using errcode='22023',message='invalid_retention_settings'; end if;
  insert into retention_settings(dept_id,plan,expires_at,retention_days,checked_at,checked_by) values(p_dept,p_plan,p_expires,p_days,now(),auth.uid())
    on conflict(dept_id) do update set plan=excluded.plan,expires_at=excluded.expires_at,retention_days=excluded.retention_days,checked_at=now(),checked_by=auth.uid(),updated_at=now();
  return true;
end $$;
create function public.retention_overview(p_dept uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not can_see(auth.uid(),p_dept,'leads_only') then raise exception using errcode='42501',message='lead_required'; end if;
  return jsonb_build_object('sources',coalesce((select jsonb_agg(t) from (
    select s.id,s.title,s.visibility,s.active,s.last_synced_at,s.last_error,
      (select count(*) from items i where i.source_id=s.id and i.deleted_at is null and exists(select 1 from members m where m.dept_id=s.dept_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null)) as item_count,
      (select min(coalesce(i.spoken_at,i.created_at)) from items i where i.source_id=s.id and i.deleted_at is null and exists(select 1 from members m where m.dept_id=s.dept_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null)) as first_record_at,
      (select max(coalesce(i.spoken_at,i.created_at)) from items i where i.source_id=s.id and i.deleted_at is null and exists(select 1 from members m where m.dept_id=s.dept_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null)) as last_record_at,
      (select max(e.created_at) from retention_exports e where e.source_id=s.id) as last_export_at
    from sources s where s.dept_id=p_dept and s.kind='slack_channel' and can_see(auth.uid(),s.dept_id,s.visibility)
  ) t),'[]'::jsonb),'settings',(select to_jsonb(r) from retention_settings r where r.dept_id=p_dept));
end $$;
create function public.retention_records(p_source uuid,p_from timestamptz,p_to timestamptz) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s sources%rowtype;
begin
  select * into s from sources where id=p_source and kind='slack_channel';
  if not found or not review_editor(s.dept_id,auth.uid()) or not can_see(auth.uid(),s.dept_id,s.visibility) then raise exception using errcode='42501',message='source_not_visible'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='invalid_range'; end if;
  return coalesce((select jsonb_agg(t) from (select i.id,i.source_id,i.external_ref,i.content_version,i.content,i.author,i.spoken_at,i.created_at,s.visibility from items i
    where i.source_id=s.id and i.deleted_at is null and length(i.content)>0 and coalesce(i.spoken_at,i.created_at)>=p_from and coalesce(i.spoken_at,i.created_at)<p_to
      and exists(select 1 from members m where m.dept_id=s.dept_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null)
    order by coalesce(i.spoken_at,i.created_at),i.id limit 5001) t),'[]');
end $$;
create function public.record_retention_export(p_source uuid,p_from timestamptz,p_to timestamptz,p_count integer,p_checksum text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s sources%rowtype; eid uuid;
begin
  select * into s from sources where id=p_source and kind='slack_channel';
  if not found or not review_editor(s.dept_id,auth.uid()) then raise exception using errcode='42501',message='lead_required'; end if;
  if p_count<0 or p_count>5000 or p_checksum !~ '^[a-f0-9]{64}$' or p_to<=p_from then raise exception using errcode='22023',message='invalid_export'; end if;
  insert into retention_exports(dept_id,source_id,created_by,range_from,range_to,record_count,checksum) values(s.dept_id,s.id,auth.uid(),p_from,p_to,p_count,p_checksum) returning id into eid;
  return eid;
end $$;
revoke all on function public.set_retention_settings(uuid,text,date,integer),public.retention_overview(uuid),public.retention_records(uuid,timestamptz,timestamptz),public.record_retention_export(uuid,timestamptz,timestamptz,integer,text) from public,anon,service_role;
grant execute on function public.set_retention_settings(uuid,text,date,integer),public.retention_overview(uuid),public.retention_records(uuid,timestamptz,timestamptz),public.record_retention_export(uuid,timestamptz,timestamptz,integer,text) to authenticated;
