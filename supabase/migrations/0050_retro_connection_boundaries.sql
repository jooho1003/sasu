-- ADR-064: verified personal credentials, consent, live evidence and revocation fences.
create or replace function public.claim_retro_draft(p_day uuid,p_revision int,p_generation int) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; token uuid:=gen_random_uuid(); activities jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into d from retro_days where id=p_day for update;
  if d.id is null or d.status<>'drafting' or p_revision is null or p_generation is null or d.revision is distinct from p_revision or d.generation is distinct from p_generation or d.lease_until>now() then return null; end if;
  if is_demo_department(d.dept_id) or not exists(select 1 from members where dept_id=d.dept_id and user_id=d.user_id and consented_at is not null) then return null; end if;
  update retro_days set lease=token,lease_until=now()+interval '2 minutes',updated_at=clock_timestamp() where id=p_day;
  select coalesce(jsonb_agg(to_jsonb(a) order by kind,at),'[]') into activities from retro_activities a where day_id=p_day and not excluded and private.retro_activity_live(a.id,d.user_id);
  return jsonb_build_object('day',to_jsonb(d)-'input_hash'-'lease'-'lease_until','lease',token,'activities',activities,'preset',(select retro_preset from departments where id=d.dept_id));
end $$;
alter table public.retro_activities drop constraint if exists retro_activities_kind_check;
alter table public.retro_activities add constraint retro_activities_kind_check check (kind in (
  'git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search','sasu_decision','sasu_answer','sasu_card','sasu_review',
  'slack_message','meeting_attended','notion_page_changed','manual_note','voice_note','figma_version','figma_comment','notion_edit','notion_comment','gdrive_edit','gdrive_comment','gdrive_rename',
  'confluence_edit','confluence_comment','github_pr','github_review','github_push','jira_transition','jira_worklog','linear_change','crm_call','crm_meeting','crm_email','crm_note','crm_deal',
  'calendar_event','ticket_handled','ticket_closed','ats_stage','ats_interview','social_post','video_publish','metric_snapshot','department_snapshot'));

-- No production data is collected by this migration. All jobs remain behind SASU_RETROS.
alter table public.retro_connections add column auth_kind text not null default 'token' check(auth_kind in ('oauth','token'));
alter table public.retro_connections add column scopes text[] not null default '{}';
alter table public.retro_connections add column consented_at timestamptz not null default now();
alter table public.retro_connections add column lease uuid;
alter table public.retro_connections add column lease_until timestamptz;
alter table public.retro_connections add column last_requested_at timestamptz;
alter table public.retro_activities add column connection_id uuid references public.retro_connections;
-- The earlier snapshot accepted unverified credentials. They must be reconnected.
update public.retro_connections set encrypted_secret='', status='revoked', revoked_at=now();
revoke select on public.retro_connections from authenticated;
grant select(id,user_id,dept_id,provider,auth_kind,scopes,status,account_label,config,last_pulled_at,last_error,failure_count,consented_at,created_at,updated_at,revoked_at) on public.retro_connections to authenticated;
drop policy retro_connections_self on public.retro_connections;
create policy retro_connections_self on public.retro_connections for select to authenticated using(user_id=auth.uid() and can_see(auth.uid(),dept_id,'dept'));
drop policy retro_user_settings_self on public.retro_user_settings;
create policy retro_user_settings_self on public.retro_user_settings for select to authenticated using(user_id=auth.uid() and can_see(auth.uid(),dept_id,'dept'));

create table private.retro_connection_states (
  hash text primary key check(hash ~ '^[a-f0-9]{64}$'), user_id uuid not null references auth.users on delete cascade,
  dept_id uuid not null references public.departments on delete cascade, provider text not null, config jsonb not null,
  auth_kind text not null check(auth_kind in ('oauth','token')), expires_at timestamptz not null default now()+interval '10 minutes',
  consumed_at timestamptz, completed_at timestamptz
);
revoke all on private.retro_connection_states from public,anon,authenticated,service_role;

create function private.retro_member(p_user uuid,p_dept uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if is_demo_department(p_dept) then raise exception 'demo_org' using errcode='42501'; end if;
  if p_user is null or not exists(select 1 from members where user_id=p_user and dept_id=p_dept and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
end $$;

create function private.retro_connection_member(p_user uuid,p_dept uuid,p_provider text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_member(p_user,p_dept);
  if p_provider in ('wanted','stibee') and not exists(select 1 from members where user_id=p_user and dept_id=p_dept and role='lead' and consented_at is not null) then raise exception 'forbidden' using errcode='42501'; end if;
end $$;
revoke all on function private.retro_connection_member(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.begin_retro_connection(p_dept uuid,p_provider text,p_hash text,p_config jsonb,p_auth_kind text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_member(auth.uid(),p_dept);
  perform private.retro_connection_member(auth.uid(),p_dept,p_provider);
  if p_provider not in ('github','figma','google_calendar','notion','jira','confluence','linear','salesmap','hubspot','pipedrive','channel_talk','intercom','zendesk','wanted','stibee','mailchimp','greenhouse','lever','workable','meta','youtube','ga4')
    or p_auth_kind not in ('oauth','token') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>8192 or p_config ?| array['endpoint','url','baseUrl','token','secret','access_token','refresh_token'] then raise exception 'invalid_connection' using errcode='22023'; end if;
  delete from private.retro_connection_states where expires_at<now();
  if (select count(*) from private.retro_connection_states where user_id=auth.uid() and completed_at is null)>=10 then raise exception 'rate_limited' using errcode='P0001'; end if;
  insert into private.retro_connection_states(hash,user_id,dept_id,provider,config,auth_kind) values(p_hash,auth.uid(),p_dept,p_provider,p_config,p_auth_kind);
  return true;
end $$;
create function public.consume_retro_connection_state(p_hash text,p_provider text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s private.retro_connection_states;
begin
  select * into s from private.retro_connection_states where hash=p_hash and user_id=auth.uid() and provider=p_provider and expires_at>now() and consumed_at is null for update;
  if s.hash is null then return null; end if;
  perform private.retro_connection_member(auth.uid(),s.dept_id,s.provider);
  update private.retro_connection_states set consumed_at=now() where hash=s.hash;
  return jsonb_build_object('dept_id',s.dept_id,'config',s.config,'auth_kind',s.auth_kind);
end $$;
create function public.complete_retro_connection(p_hash text,p_actor uuid,p_encrypted text,p_label text,p_scopes text[]) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s private.retro_connection_states; result uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into s from private.retro_connection_states where hash=p_hash and user_id=p_actor and consumed_at is not null and completed_at is null and expires_at>now() for update;
  if s.hash is null then raise exception 'invalid_state' using errcode='42501'; end if;
  perform private.retro_connection_member(p_actor,s.dept_id,s.provider);
  if p_encrypted is null or p_encrypted !~ '^v2\.' or length(p_encrypted)>30000 or p_label is null or length(btrim(p_label)) not between 1 and 120 or p_scopes is null or cardinality(p_scopes)>30 then raise exception 'invalid_connection' using errcode='22023'; end if;
  insert into retro_connections(user_id,dept_id,provider,auth_kind,scopes,encrypted_secret,account_label,config)
    values(p_actor,s.dept_id,s.provider,s.auth_kind,p_scopes,p_encrypted,mask_retro_text(p_label),s.config)
    on conflict(user_id,dept_id,provider) do update set auth_kind=excluded.auth_kind,scopes=excluded.scopes,encrypted_secret=excluded.encrypted_secret,account_label=excluded.account_label,config=excluded.config,status='active',last_error=null,failure_count=0,revoked_at=null,consented_at=now(),lease=null,lease_until=null,updated_at=now()
    returning id into result;
  update private.retro_connection_states set completed_at=now() where hash=s.hash;
  return result;
end $$;
-- Authenticated callers may never supply unverified credentials to a storage RPC.
revoke all on function public.create_retro_connection(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.consent_retro_share(p_dept uuid,p_version text default '1') returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_member(auth.uid(),p_dept);
  if p_version is distinct from '1' then raise exception 'invalid_consent_version' using errcode='22023'; end if;
  insert into retro_user_settings(user_id,dept_id,share_consented_at,share_consent_version) values(auth.uid(),p_dept,now(),'1')
  on conflict(user_id,dept_id) do update set share_consented_at=excluded.share_consented_at,share_consent_version='1';
end $$;
create function public.withdraw_retro_share(p_dept uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_member(auth.uid(),p_dept);
  -- The settings row is the common lock with set_retro_visibility.
  insert into retro_user_settings(user_id,dept_id) values(auth.uid(),p_dept) on conflict do nothing;
  update retro_user_settings set share_consented_at=null,share_consent_version=null where user_id=auth.uid() and dept_id=p_dept;
  update retro_days set visibility='self',updated_at=now() where user_id=auth.uid() and dept_id=p_dept and visibility<>'self';
end $$;
create or replace function public.set_retro_preset(p_dept uuid,p_preset text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_member(auth.uid(),p_dept);
  if not exists(select 1 from members where user_id=auth.uid() and dept_id=p_dept and role='lead') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_preset is null or p_preset not in ('development','planning','design','sales','cs','marketing','hr','general') then raise exception 'invalid_preset' using errcode='22023'; end if;
  update departments set retro_preset=p_preset where id=p_dept;
end $$;
create or replace function public.revoke_retro_connection(p_connection uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; d uuid;
begin
  select * into c from retro_connections where id=p_connection and user_id=auth.uid() for update;
  if c.id is null then raise exception 'connection_not_found' using errcode='42501'; end if;
  for d in select distinct day_id from retro_activities where connection_id=c.id order by day_id loop
    perform 1 from retro_days where id=d for update;
    delete from retro_activities where day_id=d and connection_id=c.id;
    update retro_days set activity_count=(select count(*) from retro_activities where day_id=d),lease=null,lease_until=null,input_hash=null,
      status=case when status='drafting' then 'needs_review' else status end,status_reason='retro_input_changed',updated_at=now() where id=d;
  end loop;
  update retro_connections set encrypted_secret='',status='revoked',revoked_at=now(),lease=null,lease_until=null,config='{}',updated_at=now() where id=c.id;
  update jobs set status='failed',last_error='connection_revoked',lease_until=null where kind='retro_pull' and payload->>'connectionId'=c.id::text and status in ('queued','running');
end $$;

create or replace function public.add_retro_note(p_day uuid,p_kind text,p_text text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; result uuid; n int;
begin
  d:=private.retro_owner(p_day);
  if p_kind is null or p_kind not in ('manual_note','voice_note') or length(btrim(coalesce(p_text,''))) not between 1 and 500 then raise exception 'invalid_note' using errcode='22023'; end if;
  if (select count(*) from retro_activities where day_id=p_day and kind in ('manual_note','voice_note'))>=20 then raise exception 'note_limit' using errcode='22023'; end if;
  select count(*) into n from retro_activities where day_id=p_day;
  if n>=500 then raise exception 'activity_limit' using errcode='22023'; end if;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(p_day,p_kind,gen_random_uuid()::text,left(mask_retro_text(btrim(p_text)),200),mask_retro_text(btrim(p_text)),(d.retro_date+time '12:00') at time zone d.tz,'{}') returning id into result;
  update retro_days set activity_count=n+1,lease=null,lease_until=null,input_hash=null,status=case when status='drafting' then 'needs_review' else status end,status_reason='retro_input_changed',updated_at=now() where id=p_day;
  return result;
end $$;

create or replace function public.queue_retro_pull(p_connection uuid,p_date date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; jid uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('retro-pull:'||auth.uid()::text,0));
  select * into c from retro_connections where id=p_connection and user_id=auth.uid() and status in ('active','error') for update;
  if c.id is null then raise exception 'connection_not_found' using errcode='42501'; end if;
  perform private.retro_connection_member(auth.uid(),c.dept_id,c.provider);
  if p_date is null or abs(p_date-(now() at time zone 'Asia/Seoul')::date)>1 then raise exception 'invalid_date' using errcode='22023'; end if;
  if exists(select 1 from retro_connections where user_id=auth.uid() and last_requested_at>now()-interval '1 minute') then raise exception 'rate_limited' using errcode='P0001'; end if;
  update retro_connections set last_requested_at=now() where id=c.id;
  jid:=md5('retro-pull:'||c.id||':'||p_date)::uuid;
  insert into jobs(id,kind,payload,lane) values(jid,'retro_pull',jsonb_build_object('connectionId',c.id,'date',p_date),'realtime')
  on conflict(id) do update set status='queued',attempts=0,run_after=now(),last_error=null,lane='realtime',updated_at=now() where jobs.status in ('done','failed');
  return jid;
end $$;
create function public.schedule_retro_pulls() returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare n int; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if extract(hour from now() at time zone 'Asia/Seoul')<>23 then return 0; end if;
  insert into jobs(id,kind,payload,lane)
    select md5('retro-pull:'||c.id||':'||today)::uuid,'retro_pull',jsonb_build_object('connectionId',c.id,'date',today),'bulk' from retro_connections c
    join members m on m.user_id=c.user_id and m.dept_id=c.dept_id and m.consented_at is not null
    where c.status in ('active','error') and c.failure_count<3 and (c.provider not in ('wanted','stibee') or m.role='lead') and not is_demo_department(c.dept_id)
    on conflict(id) do nothing;
  get diagnostics n=row_count; return n;
end $$;
create function public.queue_retro_pulls(p_dept uuid) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; n int:=0; today date:=(now() at time zone 'Asia/Seoul')::date;
begin
  perform private.retro_member(auth.uid(),p_dept);
  perform pg_advisory_xact_lock(hashtextextended('retro-pull:'||auth.uid()::text,0));
  if exists(select 1 from retro_connections where user_id=auth.uid() and last_requested_at>now()-interval '1 minute') then raise exception 'rate_limited' using errcode='P0001'; end if;
  for c in select * from retro_connections where user_id=auth.uid() and dept_id=p_dept and status in ('active','error') and (provider not in ('wanted','stibee') or exists(select 1 from members where user_id=auth.uid() and dept_id=p_dept and role='lead')) order by id for update loop
    update retro_connections set last_requested_at=now() where id=c.id;
    insert into jobs(id,kind,payload,lane) values(md5('retro-pull:'||c.id||':'||today)::uuid,'retro_pull',jsonb_build_object('connectionId',c.id,'date',today),'realtime')
    on conflict(id) do update set status='queued',attempts=0,run_after=now(),last_error=null,lane='realtime',updated_at=now() where jobs.status in ('done','failed');
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.queue_retro_pulls(uuid) from public,anon,authenticated,service_role;
grant execute on function public.queue_retro_pulls(uuid) to authenticated;
create function public.claim_retro_pull(p_connection uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; l uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into c from retro_connections where id=p_connection and status in ('active','error') and (lease_until is null or lease_until<now()) for update;
  if c.id is null then return null; end if;
  perform private.retro_connection_member(c.user_id,c.dept_id,c.provider);
  update retro_connections set lease=l,lease_until=now()+interval '2 minutes' where id=c.id;
  return to_jsonb(c)-'lease'-'lease_until'||jsonb_build_object('lease',l);
end $$;
-- Replace the unfenced early RPC. A copied token from a revoked job cannot restore rows.
revoke all on function public.upsert_retro_activities_as(uuid,uuid,date,jsonb) from public,anon,authenticated,service_role;
create function public.save_retro_pull(p_connection uuid,p_lease uuid,p_date date,p_activities jsonb,p_encrypted text default null) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections; d retro_days; a jsonb; saved int:=0; clean_title text; clean_text text; old retro_activities;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into c from retro_connections where id=p_connection and lease=p_lease and lease_until>now() and status in ('active','error') for update;
  if c.id is null then return null; end if;
  perform private.retro_connection_member(c.user_id,c.dept_id,c.provider);
  if p_date is null or abs(p_date-(now() at time zone 'Asia/Seoul')::date)>1 or jsonb_typeof(p_activities) is distinct from 'array' or jsonb_array_length(p_activities)>200 or octet_length(p_activities::text)>1048576 then raise exception 'invalid_activities' using errcode='22023'; end if;
  insert into retro_days(id,user_id,dept_id,retro_date,tz,collector_version) values(gen_random_uuid(),c.user_id,c.dept_id,p_date,'Asia/Seoul','connectors') on conflict(dept_id,user_id,retro_date) do nothing;
  select * into d from retro_days where user_id=c.user_id and dept_id=c.dept_id and retro_date=p_date for update;
  for a in select value from jsonb_array_elements(p_activities) loop
    if c.provider in ('wanted','stibee') then a:=jsonb_set(a,'{meta}',coalesce(a->'meta','{}')||'{"dept_context":true}'); end if;
    if jsonb_typeof(a) is distinct from 'object' or a->>'kind' is null or not (a->>'kind'=any(case c.provider
      when 'github' then array['github_pr','github_review','github_push'] when 'figma' then array['figma_version','figma_comment']
      when 'google_calendar' then array['calendar_event'] when 'notion' then array['notion_edit','notion_comment']
      when 'linear' then array['linear_change'] when 'salesmap' then array['crm_note'] when 'jira' then array['jira_transition','jira_worklog'] when 'confluence' then array['confluence_edit','confluence_comment']
      when 'hubspot' then array['crm_call','crm_meeting','crm_email','crm_note','crm_deal'] when 'pipedrive' then array['crm_call','crm_meeting','crm_email','crm_note','crm_deal']
      when 'channel_talk' then array['ticket_handled','ticket_closed'] when 'intercom' then array['ticket_handled','ticket_closed'] when 'zendesk' then array['ticket_handled']
      when 'greenhouse' then array['ats_stage','ats_interview'] when 'lever' then array['ats_stage','ats_interview'] when 'workable' then array['ats_stage','ats_interview']
      when 'wanted' then array['department_snapshot'] when 'stibee' then array['department_snapshot'] when 'meta' then array['social_post'] when 'youtube' then array['video_publish'] when 'mailchimp' then array['metric_snapshot'] when 'ga4' then array['metric_snapshot'] else '{}'::text[] end))
      or jsonb_typeof(a->'title') is distinct from 'string' or length(btrim(a->>'title')) not between 1 and 200
      or jsonb_typeof(a->'text') is distinct from 'string' or length(a->>'text')>500 or jsonb_typeof(a->'ref') is distinct from 'string' or length(a->>'ref') not between 1 and 200
      or jsonb_typeof(a->'at') is distinct from 'string' or jsonb_typeof(a->'meta') is distinct from 'object' then raise exception 'invalid_activities' using errcode='22023'; end if;
    if ((a->>'at')::timestamptz at time zone d.tz)::date<>p_date then raise exception 'invalid_date' using errcode='22023'; end if;
    clean_title:=mask_retro_text(a->>'title'); clean_text:=mask_retro_text(a->>'text');
    select * into old from retro_activities where day_id=d.id and kind=a->>'kind' and ref=a->>'ref';
    if old.id is not null and (old.connection_id is distinct from c.id or old.title<>clean_title or old.text<>clean_text) then
      if old.connection_id is distinct from c.id then raise exception 'activity_conflict' using errcode='22023'; end if;
      if exists(select 1 from retro_revisions r,jsonb_each(r.body) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') cit where r.day_id=d.id and cit->>'activity_id'=old.id::text) then continue; end if;
    end if;
    insert into retro_activities(day_id,connection_id,kind,ref,title,text,at,meta) values(d.id,c.id,a->>'kind',a->>'ref',clean_title,clean_text,(a->>'at')::timestamptz,
      coalesce((select jsonb_object_agg(key,case when jsonb_typeof(value)='string' then to_jsonb(mask_retro_text(value#>>'{}')) when jsonb_typeof(value) in ('number','boolean') then value else 'null'::jsonb end) from jsonb_each(a->'meta')),'{}'))
      on conflict(day_id,kind,ref) do update set title=excluded.title,text=excluded.text,at=excluded.at,meta=excluded.meta;
    saved:=saved+1;
  end loop;
  if (select count(*) from retro_activities where day_id=d.id)>500 or (select count(*) from retro_activities where day_id=d.id and connection_id=c.id)>200 then raise exception 'activity_limit' using errcode='22023'; end if;
  update retro_days set activity_count=(select count(*) from retro_activities where day_id=d.id),input_hash=null,lease=null,lease_until=null,status=case when status='drafting' then 'needs_review' else status end,updated_at=now() where id=d.id;
  update retro_connections set status='active',failure_count=0,last_error=null,last_pulled_at=now(),lease=null,lease_until=null,encrypted_secret=coalesce(p_encrypted,encrypted_secret),updated_at=now() where id=c.id;
  return saved;
end $$;
create function public.fail_retro_pull(p_connection uuid,p_lease uuid,p_error text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  update retro_connections set status='error',failure_count=least(99,failure_count+1),last_error=case when p_error in ('rate_limited','connection_credential_unavailable','connector_auth_failed','connector_scope_denied','connector_timeout','connector_failed') then p_error else 'connector_failed' end,lease=null,lease_until=null,updated_at=now()
    where id=p_connection and lease=p_lease and status in ('active','error');
  return found;
end $$;

create function public.refresh_retro_pull(p_connection uuid,p_lease uuid,p_encrypted text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c retro_connections;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into c from retro_connections where id=p_connection and lease=p_lease and lease_until>now() and status in ('active','error') for update;
  if c.id is null then return false; end if;
  perform private.retro_connection_member(c.user_id,c.dept_id,c.provider);
  if p_encrypted is not null and (p_encrypted !~ '^v2\.' or length(p_encrypted)>30000) then raise exception 'invalid_connection' using errcode='22023'; end if;
  update retro_connections set encrypted_secret=coalesce(p_encrypted,encrypted_secret),lease_until=now()+interval '2 minutes',updated_at=now() where id=c.id;
  return true;
end $$;
revoke all on function public.refresh_retro_pull(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.refresh_retro_pull(uuid,uuid,text) to service_role;

revoke all on function private.retro_member(uuid,uuid),public.begin_retro_connection(uuid,text,text,jsonb,text),public.consume_retro_connection_state(text,text),public.complete_retro_connection(text,uuid,text,text,text[]),public.withdraw_retro_share(uuid),public.schedule_retro_pulls(),public.claim_retro_pull(uuid),public.save_retro_pull(uuid,uuid,date,jsonb,text),public.fail_retro_pull(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.begin_retro_connection(uuid,text,text,jsonb,text),public.consume_retro_connection_state(text,text),public.withdraw_retro_share(uuid) to authenticated;
grant execute on function public.complete_retro_connection(text,uuid,text,text,text[]),public.schedule_retro_pulls(),public.claim_retro_pull(uuid),public.save_retro_pull(uuid,uuid,date,jsonb,text),public.fail_retro_pull(uuid,uuid,text) to service_role;

create or replace function public.derive_retro_activities(p_day uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; n int:=0; added int; room int;
begin
  d:=private.retro_owner(p_day);
  select greatest(0,500-count(*)) into room from retro_activities where day_id=d.id;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta,source_visibility)
    select d.id,'slack_message',i.id::text,left(mask_retro_text(i.content),200),left(mask_retro_text(i.content),500),i.spoken_at,'{}',s.visibility
    from items i join sources s on s.id=i.source_id and s.dept_id=d.dept_id and i.dept_id=d.dept_id
    join members m on m.dept_id=d.dept_id and m.user_id=d.user_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null
    where s.kind='slack_channel' and s.active and i.deleted_at is null and btrim(i.content)<>'' and (i.spoken_at at time zone d.tz)::date=d.retro_date
      and can_see(d.user_id,d.dept_id,s.visibility) and not exists(select 1 from retro_activities a where a.day_id=d.id and a.kind='slack_message' and a.ref=i.id::text)
    order by i.spoken_at,i.id limit room on conflict(day_id,kind,ref) do nothing;
  get diagnostics added=row_count; n:=n+added; room:=room-added;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta,source_visibility)
    select d.id,'meeting_attended',r.id::text,left(mask_retro_text(r.title),200),'확정된 회의에 참여했습니다.',r.confirmed_at,'{}','leads_only'
    from reviewed_materials r where r.dept_id=d.dept_id and r.kind='audio' and r.status='ready' and r.deleted_at is null and d.user_id=any(r.participants)
      and (r.confirmed_at at time zone d.tz)::date=d.retro_date and review_editor(d.dept_id,d.user_id) and can_see(d.user_id,d.dept_id,r.visibility)
      and not exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=d.dept_id and m.user_id=u and m.consented_at is not null))
      and not exists(select 1 from retro_activities a where a.day_id=d.id and a.kind='meeting_attended' and a.ref=r.id::text)
    order by r.confirmed_at,r.id limit room on conflict(day_id,kind,ref) do nothing;
  get diagnostics added=row_count; n:=n+added; room:=room-added;
  insert into retro_activities(day_id,kind,ref,title,text,at,meta,source_visibility)
    select d.id,'notion_page_changed',s.id::text,left(mask_retro_text(coalesce(nullif(btrim(s.title),''),'부서 문서')),200),
      format('문서를 다시 가져왔습니다. 새로 추가 %s건 · 삭제 %s건',
        (select count(*) from items i where i.source_id=s.id and (i.created_at at time zone d.tz)::date=d.retro_date),
        (select count(*) from items i where i.source_id=s.id and (i.deleted_at at time zone d.tz)::date=d.retro_date)),
      s.last_synced_at,'{"dept_context":true}',s.visibility
    from sources s where s.dept_id=d.dept_id and s.kind='notion_page' and s.active and (s.last_synced_at at time zone d.tz)::date=d.retro_date
      and can_see(d.user_id,d.dept_id,s.visibility) and not exists(select 1 from retro_activities a where a.day_id=d.id and a.kind='notion_page_changed' and a.ref=s.id::text)
    order by s.last_synced_at,s.id limit room on conflict(day_id,kind,ref) do nothing;
  get diagnostics added=row_count; n:=n+added;
  if n>0 then
    update retro_days set activity_count=(select count(*) from retro_activities where day_id=d.id),updated_at=now() where id=d.id;
  end if;
  return n;
end $$;
-- Only the atomic create transaction calls this function; there is no second request race.
revoke all on function public.derive_retro_activities(uuid) from public,anon,authenticated,service_role;

create or replace function public.create_retro_day(p_dept uuid,p_day uuid,p_date date,p_tz text,p_collector text,p_bundle jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; a jsonb; old retro_activities; rid uuid; j uuid; h text; n int; clean_title text; clean_text text;
begin
  if is_demo_department(p_dept) then raise exception 'demo_org' using errcode='42501'; end if;
  if auth.uid() is null or not exists(select 1 from members where dept_id=p_dept and user_id=auth.uid() and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_tz) or p_date is null or abs(p_date-(now() at time zone p_tz)::date)>7 or octet_length(p_bundle::text)>1048576 or jsonb_typeof(p_bundle->'activities') is distinct from 'array' or jsonb_array_length(p_bundle->'activities')>500 then raise exception 'invalid_bundle' using errcode='22023'; end if;
  insert into retro_days(id,dept_id,user_id,retro_date,tz,collector_version) values(p_day,p_dept,auth.uid(),p_date,p_tz,p_collector) on conflict(dept_id,user_id,retro_date) do nothing;
  select * into d from retro_days where dept_id=p_dept and user_id=auth.uid() and retro_date=p_date for update; rid:=d.id;
  if d.tz<>p_tz then raise exception 'invalid_timezone' using errcode='22023'; end if;
  for a in select value from jsonb_array_elements(p_bundle->'activities') loop
    if a->>'kind' like 'sasu_%' then raise exception 'server_only_kind' using errcode='22023'; end if;
    if jsonb_typeof(a->'kind') is distinct from 'string' or jsonb_typeof(a->'title') is distinct from 'string' or jsonb_typeof(a->'text') is distinct from 'string' or jsonb_typeof(a->'ref') is distinct from 'string' or jsonb_typeof(a->'at') is distinct from 'string' or a->>'kind' not in ('git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search') or coalesce(length(a->>'title'),0) not between 1 and 200 or length(a->>'text')>500 or coalesce(length(a->>'ref'),0) not between 1 and 200 or jsonb_typeof(a->'meta') is distinct from 'object' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if a->>'kind'='web_visit' and (a->>'ref' !~ '^https?://[^/?#]+(/[^?#]*)?$' or a->>'ref' ~ '[?#]') then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if (a->>'at')::timestamptz at time zone p_tz not between p_date::timestamp and (p_date+1)::timestamp-interval '1 microsecond' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    clean_title:=left(mask_retro_text(a->>'title'),200); clean_text:=left(mask_retro_text(a->>'text'),500);
    select * into old from retro_activities where day_id=rid and kind=a->>'kind' and ref=a->>'ref';
    if old.id is not null and (old.title<>clean_title or old.text<>clean_text) and exists(select 1 from retro_revisions r,jsonb_each(r.body) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') c where r.day_id=rid and c->>'activity_id'=old.id::text) then raise exception 'cited_activity_changed' using errcode='40001'; end if;
    insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(rid,a->>'kind',a->>'ref',clean_title,clean_text,(a->>'at')::timestamptz,
      coalesce((select jsonb_object_agg(key,case when jsonb_typeof(value)='string' then to_jsonb(mask_retro_text(value#>>'{}')) when jsonb_typeof(value) in ('number','boolean') then value else 'null'::jsonb end) from jsonb_each(a->'meta')),'{}'))
    on conflict(day_id,kind,ref) do update set title=excluded.title,text=excluded.text,at=excluded.at,meta=excluded.meta;
  end loop;
  -- Current source permission is checked before taking a personal snapshot.
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_decision',id::text,left(mask_retro_text(outcome),200),left(mask_retro_text(rationale),500),decided_at,visibility from decisions
    where dept_id=p_dept and decided_by=auth.uid() and (decided_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_answer',a.id::text,left(mask_retro_text(a.question),200),left(mask_retro_text(a.question),500),a.created_at,
      case when exists(select 1 from citations c left join items i on i.id=c.item_id left join sources src on src.id=i.source_id left join decisions cited_decision on cited_decision.id=c.decision_id where c.owner_kind='answer' and c.owner_id=a.id and (src.visibility='leads_only' or cited_decision.visibility='leads_only')) then 'leads_only' else 'dept' end
    from answers a where a.dept_id=p_dept and a.asked_by=auth.uid() and a.status='done' and (a.created_at at time zone p_tz)::date=p_date and my_answer_evidence_valid(a.id)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_card',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),closed_at,visibility from decision_requests
    where dept_id=p_dept and assignee_id=auth.uid() and (closed_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_review',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),confirmed_at,'leads_only' from reviewed_materials
    where dept_id=p_dept and confirmed_by=auth.uid() and (confirmed_at at time zone p_tz)::date=p_date and deleted_at is null and review_editor(dept_id,auth.uid())
    on conflict(day_id,kind,ref) do nothing;
  perform public.derive_retro_activities(rid);
  select count(*),md5(coalesce(jsonb_agg(jsonb_build_array(kind,ref,title,text,at,meta,excluded) order by kind,ref)::text,'')) into n,h from retro_activities where day_id=rid;
  if n>500 then raise exception 'activity_limit' using errcode='22023'; end if;
  update retro_days set activity_count=n,input_hash=h where id=rid;
  if d.input_hash is distinct from h or d.generation=0 then j:=private.queue_retro(rid); else j:=md5('retro-draft:'||rid||':'||d.generation)::uuid; end if;
  return jsonb_build_object('id',rid,'activity_count',n,'job_id',j);
end $$;

create or replace function public.set_retro_visibility(p_day uuid,p_visibility text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; r retro_revisions;
begin
  -- Lock the consent row before the day, matching withdrawal's lock order.
  select * into d from retro_days where id=p_day and user_id=auth.uid();
  if d.id is null then raise exception 'retro_not_found' using errcode='42501'; end if;
  insert into retro_user_settings(user_id,dept_id) values(auth.uid(),d.dept_id) on conflict do nothing;
  perform 1 from retro_user_settings where user_id=auth.uid() and dept_id=d.dept_id for update;
  d:=private.retro_owner(p_day);
  if p_visibility is null or p_visibility not in ('self','dept','leads_only') then raise exception 'invalid_visibility' using errcode='22023'; end if;
  if p_visibility<>'self' then
    if not exists(select 1 from retro_user_settings where user_id=d.user_id and dept_id=d.dept_id and share_consented_at is not null and share_consent_version='1') then raise exception 'share_consent_required' using errcode='42501'; end if;
    select * into r from retro_revisions where day_id=p_day and revision=d.confirmed_revision;
    if r.day_id is null then raise exception 'not_confirmed' using errcode='22023'; end if;
    perform private.retro_validate(p_day,r.title,r.body,r.topics,p_visibility,true);
  end if;
  update retro_days set visibility=p_visibility where id=p_day;
end $$;

create or replace function private.retro_activity_live(p_activity uuid,p_viewer uuid,p_visibility text default 'self') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_activities a join retro_days day on day.id=a.day_id where a.id=p_activity
    and (p_visibility<>'dept' or a.source_visibility is distinct from 'leads_only') and case a.kind
    when 'sasu_decision' then exists(select 1 from decisions d where d.id::text=a.ref and d.dept_id=day.dept_id and d.decided_by=day.user_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept'))
    when 'sasu_card' then exists(select 1 from decision_requests c where c.id::text=a.ref and c.dept_id=day.dept_id and c.assignee_id=day.user_id and c.closed_at is not null and can_see(day.user_id,c.dept_id,c.visibility) and can_see(p_viewer,c.dept_id,c.visibility) and (p_visibility<>'dept' or c.visibility='dept'))
    when 'sasu_review' then exists(select 1 from reviewed_materials r where r.id::text=a.ref and r.dept_id=day.dept_id and r.confirmed_by=day.user_id and r.confirmed_at is not null and r.deleted_at is null and review_editor(r.dept_id,day.user_id) and review_editor(r.dept_id,p_viewer) and p_visibility<>'dept')
    when 'sasu_answer' then exists(select 1 from answers ans where ans.id::text=a.ref and ans.dept_id=day.dept_id and ans.asked_by=day.user_id and ans.status='done' and ans.verified
      and can_see(day.user_id,ans.dept_id,'dept') and can_see(p_viewer,ans.dept_id,'dept')
      and exists(select 1 from citations where owner_kind='answer' and owner_id=ans.id)
      and not exists(select 1 from citations c left join items i on i.id=c.item_id left join sources s on s.id=i.source_id and s.dept_id=i.dept_id left join decisions d on d.id=c.decision_id
        where c.owner_kind='answer' and c.owner_id=ans.id and not coalesce(
          (c.item_id is not null and c.decision_id is null and i.dept_id=ans.dept_id and i.deleted_at is null and s.active and can_see(day.user_id,i.dept_id,s.visibility) and can_see(p_viewer,i.dept_id,s.visibility) and (p_visibility<>'dept' or s.visibility='dept') and length(c.quote)>0 and position(c.quote in i.content)>0)
          or (c.decision_id is not null and c.item_id is null and d.dept_id=ans.dept_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept') and length(c.quote)>0 and position(c.quote in d.outcome||E'\n'||d.rationale)>0),false)))
    when 'slack_message' then exists(select 1 from items i join sources s on s.id=i.source_id and s.dept_id=i.dept_id join members m on m.dept_id=day.dept_id and m.user_id=day.user_id and m.slack_user_id=i.author_ext_id and m.consented_at is not null where i.id::text=a.ref and i.dept_id=day.dept_id and i.deleted_at is null and s.active and s.kind='slack_channel' and can_see(day.user_id,day.dept_id,s.visibility) and can_see(p_viewer,day.dept_id,s.visibility) and (p_visibility<>'dept' or s.visibility='dept'))
    when 'meeting_attended' then exists(select 1 from reviewed_materials r where r.id::text=a.ref and r.dept_id=day.dept_id and r.kind='audio' and day.user_id=any(r.participants) and r.status='ready' and r.confirmed_at is not null and r.deleted_at is null and review_editor(day.dept_id,day.user_id) and review_editor(day.dept_id,p_viewer) and can_see(day.user_id,day.dept_id,r.visibility) and can_see(p_viewer,day.dept_id,r.visibility) and p_visibility<>'dept' and not exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=day.dept_id and m.user_id=u and m.consented_at is not null)))
    when 'department_snapshot' then p_viewer=day.user_id and exists(select 1 from members m join retro_connections c on c.id=a.connection_id and c.dept_id=m.dept_id and c.user_id=m.user_id where m.user_id=day.user_id and m.dept_id=day.dept_id and m.role='lead' and m.consented_at is not null and c.status<>'revoked' and c.provider in ('wanted','stibee'))
    when 'notion_page_changed' then exists(select 1 from sources s where s.id::text=a.ref and s.dept_id=day.dept_id and s.active and s.kind='notion_page' and can_see(day.user_id,day.dept_id,s.visibility) and can_see(p_viewer,day.dept_id,s.visibility) and (p_visibility<>'dept' or s.visibility='dept'))
    else a.connection_id is null or exists(select 1 from retro_connections c where c.id=a.connection_id and c.user_id=day.user_id and c.dept_id=day.dept_id and c.status<>'revoked') end)
$$;

create or replace function private.retro_validate(p_day uuid,p_title text,p_body jsonb,p_topics text[],p_visibility text default 'self',p_allow_excluded boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s text; i jsonb; c jsonb; a retro_activities; n int:=0; result jsonb:='{}'; entries jsonb; refs jsonb;
begin
  if p_title is null or length(btrim(mask_retro_text(p_title))) not between 1 and 60 or p_topics is null or cardinality(p_topics)>5 or exists(select 1 from unnest(p_topics) t where t is null or length(btrim(mask_retro_text(t))) not between 1 and 50) or jsonb_typeof(p_body) is distinct from 'object' or not p_body ?& array['did','learned','decided','next'] or (select count(*) from jsonb_object_keys(p_body))<>4 then raise exception 'invalid_retro' using errcode='22023'; end if;
  foreach s in array array['did','learned','decided','next'] loop
    if jsonb_typeof(p_body->s) is distinct from 'array' then raise exception 'invalid_retro' using errcode='22023'; end if;
    entries:='[]';
    for i in select value from jsonb_array_elements(p_body->s) loop
      n:=n+1;
      if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'text') is distinct from 'string' or n>200 or length(btrim(mask_retro_text(i->>'text'))) not between 1 and 2000 or jsonb_typeof(i->'citations') is distinct from 'array' or jsonb_array_length(i->'citations') not between 1 and 20 or (select count(*) from jsonb_object_keys(i))<>2 then raise exception 'invalid_retro' using errcode='22023'; end if;
      if mask_retro_text(i->>'text') ~ '\[(이메일|전화번호|계좌번호|주민번호|카드번호)\]' then raise exception 'citation_invalid' using errcode='22023'; end if;
      refs:='[]';
      for c in select value from jsonb_array_elements(i->'citations') loop
        if jsonb_typeof(c->'activity_id') is distinct from 'string' or jsonb_typeof(c->'quote') is distinct from 'string' or length(c->>'quote')>500 then raise exception 'citation_invalid' using errcode='22023'; end if;
        select * into a from retro_activities where id::text=c->>'activity_id' and day_id=p_day and (p_allow_excluded or not excluded);
        if a.id is null or coalesce(length(btrim(c->>'quote')),0)=0 or not (position(c->>'quote' in a.text)>0 or position(c->>'quote' in a.title)>0) then raise exception 'citation_invalid' using errcode='22023'; end if;
        if a.kind in ('notion_page_changed','department_snapshot') or a.meta->>'dept_context'='true' then raise exception 'citation_invalid' using errcode='22023'; end if;
        if a.kind='calendar_event' and (s<>'did' or i->>'text' !~ '(일정|계획)' or i->>'text' !~ '(확인|비교)(했습니다|했다)\.?$' or i->>'text' ~ '(참석|진행|완료|만났|면담|합의|결정|인터뷰|참여)') then raise exception 'citation_invalid' using errcode='22023'; end if;
        if a.kind='metric_snapshot' and (s<>'did' or i->>'text' !~ '(확인|비교)(했습니다|했다)\.?$' or i->>'text' ~ '(높였|늘렸|달성|개선|성과|기여|증가시|감소시|확인하고|비교하고)') then raise exception 'citation_invalid' using errcode='22023'; end if;
        if p_visibility='dept' and a.source_visibility='leads_only' then raise exception 'visibility_narrower_source' using errcode='42501'; end if;
        if not private.retro_activity_live(a.id,(select user_id from retro_days where id=p_day),p_visibility) then raise exception 'citation_invalid' using errcode='22023'; end if;
        refs:=refs||jsonb_build_array(jsonb_build_object('activity_id',a.id,'quote',c->>'quote'));
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('text',mask_retro_text(i->>'text'),'citations',refs));
    end loop;
    result:=result||jsonb_build_object(s,entries);
  end loop;
  return result;
end $$;

-- Preserve actionable provider failures without weakening the completion lease.
create or replace function public.finish_retro_draft(p_day uuid,p_revision int,p_generation int,p_lease uuid,p_title text,p_body jsonb,p_topics text[],p_error text,p_highlight text default null,p_citations jsonb default '[]') returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; b jsonb; err text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into d from retro_days where id=p_day for update;
  if d.id is null or d.status<>'drafting' or p_revision is null or p_generation is null or p_lease is null or d.revision is distinct from p_revision or d.generation is distinct from p_generation or d.lease is null or d.lease is distinct from p_lease or d.lease_until is null or d.lease_until<=clock_timestamp() then return false; end if;
  if not exists(select 1 from members where dept_id=d.dept_id and user_id=d.user_id and consented_at is not null) then return false; end if;
  if p_error is not null then
    err:=case when p_error in ('retro_no_citations','llm_budget_exceeded','llm_timeout','llm_refusal','schema_invalid','citation_invalid') then p_error else 'job_failed' end;
    update retro_days set status=case when err='retro_no_citations' then 'needs_review' else 'failed' end,status_reason=err,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
    return true;
  end if;
  b:=private.retro_validate(p_day,p_title,p_body,p_topics);
  if not exists(select 1 from jsonb_each(b) s,jsonb_array_elements(s.value)) then
    update retro_days set status='needs_review',status_reason='retro_no_citations',lease=null,lease_until=null where id=p_day; return true;
  end if;
  insert into retro_revisions(day_id,revision,origin,title,body,topics,highlight,citations) values(p_day,d.revision+1,'draft',mask_retro_text(p_title),b,array(select mask_retro_text(t) from unnest(p_topics) t),null,'[]');
  -- Highlight is optional; store it only when every top-level citation occurs in the validated body.
  if p_highlight is not null and jsonb_typeof(p_citations)='array' and jsonb_array_length(p_citations)>0 and not exists(select 1 from jsonb_array_elements(p_citations) c where not exists(select 1 from jsonb_each(b) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') bc where bc=c)) then
    update retro_revisions set highlight=left(mask_retro_text(p_highlight),500),citations=p_citations where day_id=p_day and revision=d.revision+1;
  end if;
  update retro_days set revision=revision+1,status='draft',status_reason=null,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
  return true;
end $$;
