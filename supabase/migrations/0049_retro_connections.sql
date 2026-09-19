-- Phase 30: personal connector storage, derived activities, and manual notes.
alter table public.departments add column if not exists retro_preset text not null default 'general';
alter table public.departments drop constraint if exists departments_retro_preset_check;
alter table public.departments add constraint departments_retro_preset_check check (retro_preset in ('development','planning','design','sales','cs','marketing','hr','general'));
alter table public.retro_activities drop constraint if exists retro_activities_kind_check;
alter table public.retro_activities add constraint retro_activities_kind_check check (kind in (
  'git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search','sasu_decision','sasu_answer','sasu_card','sasu_review',
  'slack_message','meeting_attended','notion_page_changed','manual_note','voice_note','figma_version','figma_comment','notion_edit','notion_comment','gdrive_edit','gdrive_comment','gdrive_rename',
  'confluence_edit','confluence_comment','github_pr','github_review','github_push','jira_transition','jira_worklog','crm_call','crm_meeting','crm_email','crm_note','crm_deal',
  'calendar_event','ticket_handled','ticket_closed','ats_stage','ats_interview','social_post','video_publish','metric_snapshot'));

create table if not exists public.retro_user_settings (
  user_id uuid not null references auth.users on delete cascade,
  dept_id uuid not null references public.departments on delete cascade,
  share_consented_at timestamptz,
  share_consent_version text,
  created_at timestamptz not null default now(),
  primary key(user_id, dept_id)
);
create table if not exists public.retro_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  dept_id uuid not null references public.departments on delete cascade,
  provider text not null check (provider ~ '^[a-z][a-z0-9_]{1,39}$'),
  status text not null default 'active' check (status in ('active','error','revoked')),
  account_label text not null check (length(account_label) between 1 and 120),
  config jsonb not null default '{}',
  encrypted_secret text not null default '',
  last_pulled_at timestamptz,
  last_error text,
  failure_count int not null default 0 check (failure_count between 0 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id, dept_id, provider)
);
alter table public.retro_user_settings enable row level security;
alter table public.retro_connections enable row level security;
revoke all on public.retro_user_settings, public.retro_connections from public, anon, authenticated;
grant select on public.retro_user_settings, public.retro_connections to authenticated;
grant all on public.retro_user_settings, public.retro_connections to service_role;
drop policy if exists retro_user_settings_self on public.retro_user_settings;
drop policy if exists retro_connections_self on public.retro_connections;
create policy retro_user_settings_self on public.retro_user_settings for select to authenticated using(user_id=auth.uid());
create policy retro_connections_self on public.retro_connections for select to authenticated using(user_id=auth.uid());

create or replace function public.consent_retro_share(p_dept uuid,p_version text default '1') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from members where user_id=auth.uid() and dept_id=p_dept and consented_at is not null) then raise exception 'forbidden' using errcode='42501'; end if;
  insert into retro_user_settings(user_id,dept_id,share_consented_at,share_consent_version) values(auth.uid(),p_dept,now(),p_version)
  on conflict(user_id,dept_id) do update set share_consented_at=excluded.share_consented_at,share_consent_version=excluded.share_consent_version;
end $$;
create or replace function public.set_retro_preset(p_dept uuid,p_preset text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from members where user_id=auth.uid() and dept_id=p_dept and role='lead' and consented_at is not null) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_preset not in ('development','planning','design','sales','cs','marketing','hr','general') then raise exception 'invalid_preset' using errcode='22023'; end if;
  update departments set retro_preset=p_preset where id=p_dept;
end $$;
create or replace function public.create_retro_connection(p_dept uuid,p_provider text,p_account_label text,p_config jsonb,p_encrypted_secret text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;
begin
  if auth.uid() is null or not exists(select 1 from members where user_id=auth.uid() and dept_id=p_dept and consented_at is not null) then raise exception 'forbidden' using errcode='42501'; end if;
  if length(coalesce(p_encrypted_secret,''))>10000 or jsonb_typeof(coalesce(p_config,'{}')) is distinct from 'object' then raise exception 'invalid_connection' using errcode='22023'; end if;
  insert into retro_connections(user_id,dept_id,provider,account_label,config,encrypted_secret,status,revoked_at)
  values(auth.uid(),p_dept,p_provider,left(btrim(p_account_label),120),p_config,p_encrypted_secret,'active',null)
  on conflict(user_id,dept_id,provider) do update set account_label=excluded.account_label,config=excluded.config,encrypted_secret=excluded.encrypted_secret,status='active',revoked_at=null,last_error=null,updated_at=now()
  returning id into result;
  return result;
end $$;
create or replace function public.revoke_retro_connection(p_connection uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections;
begin
  select * into c from retro_connections where id=p_connection and user_id=auth.uid() for update;
  if c.id is null then raise exception 'connection_not_found' using errcode='22023'; end if;
  delete from retro_activities a using retro_days d where d.id=a.day_id and d.user_id=c.user_id and d.dept_id=c.dept_id and a.kind like replace(c.provider,'_','\\_')||'\\_%' escape '\\';
  update retro_connections set encrypted_secret='',status='revoked',revoked_at=now(),updated_at=now() where id=c.id;
end $$;
create or replace function public.add_retro_note(p_day uuid,p_kind text,p_text text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; result uuid;
begin
  select * into d from retro_days where id=p_day and user_id=auth.uid() for update;
  if d.id is null then raise exception 'retro_not_found' using errcode='22023'; end if;
  if p_kind not in ('manual_note','voice_note') or length(btrim(coalesce(p_text,''))) not between 1 and 500 then raise exception 'invalid_note' using errcode='22023'; end if;
  if (select count(*) from retro_activities where day_id=p_day and kind in ('manual_note','voice_note')) >= 20 then raise exception 'note_limit' using errcode='22023'; end if;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(p_day,p_kind,gen_random_uuid()::text,left(mask_retro_text(btrim(p_text)),200),left(mask_retro_text(btrim(p_text)),500),now(),'{}') returning id into result;
  update retro_days set activity_count=(select count(*) from retro_activities where day_id=p_day),status=case when status='drafting' then 'needs_review' else status end,updated_at=now() where id=p_day;
  return result;
end $$;
revoke all on function public.consent_retro_share(uuid,text),public.set_retro_preset(uuid,text),public.create_retro_connection(uuid,text,text,jsonb,text),public.revoke_retro_connection(uuid),public.add_retro_note(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consent_retro_share(uuid,text),public.set_retro_preset(uuid,text),public.create_retro_connection(uuid,text,text,jsonb,text),public.revoke_retro_connection(uuid),public.add_retro_note(uuid,text,text) to authenticated;

create or replace function public.upsert_retro_activities_as(p_user uuid,p_dept uuid,p_date date,p_activities jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d uuid; a jsonb; saved integer := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from members where user_id=p_user and dept_id=p_dept and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
  insert into retro_days(user_id,dept_id,retro_date,tz,collector_version,status) values(p_user,p_dept,p_date,'Asia/Seoul','connectors','collecting') on conflict(dept_id,user_id,retro_date) do nothing;
  select id into d from retro_days where user_id=p_user and dept_id=p_dept and retro_date=p_date for update;
  for a in select value from jsonb_array_elements(coalesce(p_activities,'[]')) loop
    if jsonb_typeof(a)='object' and length(coalesce(a->>'kind','')) between 1 and 50 and length(coalesce(a->>'ref','')) between 1 and 200 and length(coalesce(a->>'title','')) between 1 and 200 then
      insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(d,a->>'kind',a->>'ref',left(mask_retro_text(a->>'title'),200),left(mask_retro_text(a->>'text'),500),coalesce((a->>'at')::timestamptz,now()),coalesce(a->'meta','{}')) on conflict(day_id,kind,ref) do update set title=excluded.title,text=excluded.text,at=excluded.at,meta=excluded.meta;
      saved := saved + 1;
    end if;
  end loop;
  update retro_days set activity_count=(select count(*) from retro_activities where day_id=d),updated_at=now() where id=d;
  return saved;
end $$;
revoke all on function public.upsert_retro_activities_as(uuid,uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_retro_activities_as(uuid,uuid,date,jsonb) to service_role;
create or replace function public.queue_retro_pull(p_connection uuid,p_date date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; jid uuid;
begin
  select * into c from retro_connections where id=p_connection and user_id=auth.uid() and status='active';
  if c.id is null then raise exception 'connection_not_found' using errcode='22023'; end if;
  if p_date is null or abs(p_date-(now() at time zone 'Asia/Seoul')::date)>1 then raise exception 'invalid_date' using errcode='22023'; end if;
  if exists(select 1 from jobs where kind='retro_pull' and payload->>'connectionId'=p_connection::text and payload->>'date'=p_date::text and status in ('queued','running')) then return null; end if;
  jid:=gen_random_uuid(); insert into jobs(id,kind,payload,lane) values(jid,'retro_pull',jsonb_build_object('connectionId',p_connection,'date',p_date),'realtime'); return jid;
end $$;
revoke all on function public.queue_retro_pull(uuid,date) from public,anon,authenticated;
grant execute on function public.queue_retro_pull(uuid,date) to authenticated;
create or replace function public.derive_retro_activities(p_day uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; n integer := 0;
begin
  select * into d from retro_days where id=p_day and user_id=auth.uid() for update;
  if d.id is null then raise exception 'retro_not_found' using errcode='22023'; end if;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta,source_visibility)
    select d.id,'slack_message',i.id::text,left(mask_retro_text(coalesce(i.content,'')),200),left(mask_retro_text(coalesce(i.content,'')),500),i.spoken_at,jsonb_build_object('channel_visibility',s.visibility),s.visibility
    from items i join sources s on s.id=i.source_id and s.dept_id=d.dept_id join members m on m.dept_id=d.dept_id and m.user_id=d.user_id and m.slack_user_id=i.author_ext_id
    where s.kind='slack_channel' and i.spoken_at is not null and (i.spoken_at at time zone d.tz)::date=d.retro_date and i.deleted_at is null
    on conflict(day_id,kind,ref) do nothing;
  get diagnostics n = row_count;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta,source_visibility)
    select d.id,'notion_page_changed',s.id::text,left(mask_retro_text(s.title),200),left(mask_retro_text('오늘 부서에서 문서를 새로 가져왔습니다.'),500),s.last_synced_at,jsonb_build_object('dept_context',true),s.visibility
    from sources s where s.dept_id=d.dept_id and s.kind='notion_page' and s.last_synced_at is not null and (s.last_synced_at at time zone d.tz)::date=d.retro_date
    on conflict(day_id,kind,ref) do nothing;
  update retro_days set activity_count=(select count(*) from retro_activities where day_id=d.id),updated_at=now() where id=d.id;
  return n;
end $$;
revoke all on function public.derive_retro_activities(uuid) from public,anon,authenticated;
grant execute on function public.derive_retro_activities(uuid) to authenticated;
