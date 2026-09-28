-- ADR-070, step1-B. Metadata sessions only; no audio upload or product UI.
-- Apply to production only with the matching routes and verified rollout.
-- 0052 is already deployed. Do not rewrite it or adopt pre-existing recordings.
do $$ begin
  if exists(select 1 from public.reviewed_materials where input_method<>'upload') then
    raise exception 'recording_session_migration_requires_empty_legacy_recordings';
  end if;
end $$;

create table public.review_recordings (
  id uuid primary key,
  dept_id uuid not null references public.departments,
  created_by uuid not null references auth.users,
  title text not null check(length(title) between 1 and 120),
  input_method text not null check(input_method in ('microphone','system_and_microphone')),
  visibility text not null default 'leads_only' check(visibility in ('dept','leads_only')),
  meeting_provider text not null check(meeting_provider in ('in_person','meet','zoom','other')),
  participants uuid[] not null check(cardinality(participants) between 1 and 100),
  consent_snapshot jsonb not null check(jsonb_typeof(consent_snapshot)='array'),
  consent_confirmed_by uuid not null references auth.users,
  key_version integer not null check(key_version>0),
  state text not null default 'active' check(state in ('active','saving','completed','discarded','expired','revoked')),
  state_reason text check(state_reason in ('user_discarded','session_expired','consent_withdrawn')),
  started_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default statement_timestamp()+interval '24 hours',
  updated_at timestamptz not null default clock_timestamp(),
  check(created_by=consent_confirmed_by and created_by=any(participants)),
  check(expires_at>started_at and expires_at<=started_at+interval '24 hours')
);
create index review_recordings_owner on public.review_recordings(created_by,started_at desc);
create index review_recordings_live on public.review_recordings(dept_id,expires_at) where state in ('active','saving');
alter table public.review_recordings enable row level security;
revoke all on public.review_recordings from public,anon,authenticated,service_role;
grant select on public.review_recordings to authenticated;
create policy review_recordings_owner_read on public.review_recordings for select to authenticated using (
  created_by=auth.uid() and can_see(auth.uid(),dept_id,'leads_only') and not is_demo_department(dept_id)
  and exists(select 1 from public.members m where m.dept_id=review_recordings.dept_id and m.user_id=auth.uid() and m.consented_at is not null)
);
create trigger demo_reviewer_read_only before insert or update or delete on public.review_recordings
  for each statement execute function private.reject_demo_reviewer_mutation();

create function public.start_review_recording(p_dept uuid,p_input jsonb,p_key_version integer default 1) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; people uuid[]; prior public.review_recordings%rowtype; snapshot jsonb;
  started timestamptz; clean_title text;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not exists(select 1 from public.departments d join public.org_settings s on s.org_id=d.org_id where d.id=p_dept and s.browser_recording_enabled) then
    raise exception using errcode='42501',message='browser_recording_disabled';
  end if;
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or
    not p_input ?& array['id','title','input_method','visibility','meeting_provider','participants','consent_confirmed'] or
    p_input-array['id','title','input_method','visibility','meeting_provider','participants','consent_confirmed']<>'{}'::jsonb or
    jsonb_typeof(p_input->'id') is distinct from 'string' or (p_input->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    jsonb_typeof(p_input->'title') is distinct from 'string' or length(btrim(p_input->>'title')) not between 1 and 120 or
    coalesce(p_input->>'input_method','') not in ('microphone','system_and_microphone') or
    coalesce(p_input->>'visibility','') not in ('dept','leads_only') or
    coalesce(p_input->>'meeting_provider','') not in ('in_person','meet','zoom','other') or
    p_input->'consent_confirmed' is distinct from 'true'::jsonb or
    jsonb_typeof(p_input->'participants') is distinct from 'array' or p_key_version is null or p_key_version<1 then
    raise exception using errcode='22023',message='invalid_recording';
  end if;
  if jsonb_array_length(p_input->'participants')>100 or exists(
    select 1 from jsonb_array_elements(p_input->'participants') e where jsonb_typeof(e) is distinct from 'string' or
      (e#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then raise exception using errcode='22023',message='invalid_recording'; end if;
  if (select count(distinct value::uuid) from jsonb_array_elements_text(p_input->'participants'))<>jsonb_array_length(p_input->'participants') then
    raise exception using errcode='22023',message='invalid_recording';
  end if;
  rid:=(p_input->>'id')::uuid;
  select array_agg(u order by u) into people from (
    select value::uuid u from jsonb_array_elements_text(p_input->'participants') union select auth.uid()
  ) p;
  if cardinality(people)>100 then raise exception using errcode='22023',message='invalid_recording'; end if;
  clean_title:=public.mask_review_text(btrim(p_input->>'title'));

  -- Serialize the same ID and each user's quota across departments, then the
  -- department quota across users. Participant row locks serialize withdrawal.
  perform pg_advisory_xact_lock(hashtextextended('recording-id:'||rid::text,0));
  perform pg_advisory_xact_lock(hashtextextended('recording-user:'||auth.uid()::text,0));
  perform 1 from public.departments where id=p_dept for update;
  perform 1 from public.members where dept_id=p_dept and user_id=any(people) order by user_id for share;
  if not public.review_editor(p_dept,auth.uid()) or exists(
    select 1 from unnest(people) u where not exists(select 1 from public.members m where m.dept_id=p_dept and m.user_id=u and m.consented_at is not null)
  ) then raise exception using errcode='42501',message='participant_not_consented'; end if;
  -- Recheck the switch after waiting for quota locks.
  perform 1 from public.org_settings s join public.departments d on d.org_id=s.org_id
    where d.id=p_dept and s.browser_recording_enabled for share of s;
  if not found then raise exception using errcode='42501',message='browser_recording_disabled'; end if;
  select * into prior from public.review_recordings where id=rid for update;
  if found then
    if prior.dept_id<>p_dept or prior.created_by<>auth.uid() or prior.title<>clean_title or
      prior.participants<>people or prior.input_method<>p_input->>'input_method' or prior.visibility<>p_input->>'visibility' or
      prior.meeting_provider<>p_input->>'meeting_provider' then raise exception using errcode='40001',message='recording_conflict'; end if;
    if prior.state not in ('active','saving') or prior.expires_at<=clock_timestamp() then
      raise exception using errcode='55000',message='recording_closed';
    end if;
    -- An HTTP retry after key rotation must retain the original session version.
    return jsonb_build_object('id',prior.id,'state',prior.state,'key_version',prior.key_version,'expires_at',prior.expires_at);
  end if;
  if exists(select 1 from public.reviewed_materials where id=rid) then raise exception using errcode='40001',message='recording_conflict'; end if;
  if (select count(*) from public.review_recordings where created_by=auth.uid() and state in ('active','saving') and expires_at>clock_timestamp())>=3 or
    (select count(*) from public.review_recordings where dept_id=p_dept and state in ('active','saving') and expires_at>clock_timestamp())>=10 then
    raise exception using errcode='54000',message='recording_limit';
  end if;
  select jsonb_agg(jsonb_build_object('user_id',m.user_id,'consented_at',m.consented_at) order by m.user_id) into snapshot
    from public.members m where m.dept_id=p_dept and m.user_id=any(people);
  started:=clock_timestamp();
  insert into public.review_recordings(id,dept_id,created_by,title,input_method,visibility,meeting_provider,participants,consent_snapshot,consent_confirmed_by,key_version,started_at,expires_at,updated_at)
    values(rid,p_dept,auth.uid(),clean_title,p_input->>'input_method',p_input->>'visibility',p_input->>'meeting_provider',people,snapshot,auth.uid(),p_key_version,started,started+interval '24 hours',started);
  return jsonb_build_object('id',rid,'state','active','key_version',p_key_version,'expires_at',started+interval '24 hours');
end $$;

-- Signature preserved from 0052. No reviewed_materials row is required now.
create or replace function public.recording_key_context(p_dept uuid,p_review uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.review_recordings%rowtype;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not exists(select 1 from public.departments d join public.org_settings s on s.org_id=d.org_id where d.id=p_dept and s.browser_recording_enabled) then
    raise exception using errcode='42501',message='browser_recording_disabled';
  end if;
  select * into r from public.review_recordings where id=p_review and dept_id=p_dept and created_by=auth.uid()
    and state in ('active','saving') and expires_at>statement_timestamp();
  if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
  if exists(select 1 from unnest(r.participants) u where not exists(select 1 from public.members m where m.dept_id=p_dept and m.user_id=u and m.consented_at is not null)) then
    raise exception using errcode='42501',message='participant_not_consented';
  end if;
  return jsonb_build_object('recording_id',r.id,'user_id',r.created_by,'dept_id',r.dept_id,'key_version',r.key_version);
end $$;

-- SECURITY INVOKER: the same owner policy governs direct SELECT and these reads.
create function public.list_review_recordings(p_dept uuid,p_recording uuid default null) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc,r.id),'[]'::jsonb) from (
    select id,title,input_method,visibility,meeting_provider,participants,key_version,started_at,expires_at,state_reason,
      case when state in ('active','saving') and expires_at<=statement_timestamp() then 'expired' else state end state
    from public.review_recordings where dept_id=p_dept and
      ((p_recording is null and state in ('active','saving') and expires_at>statement_timestamp()) or id=p_recording)
    order by started_at desc,id limit 100
  ) r
$$;

create function public.discard_review_recording(p_dept uuid,p_recording uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.review_recordings%rowtype;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  select * into r from public.review_recordings where id=p_recording and dept_id=p_dept and created_by=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
  -- Saving/completed sessions will use the reviewed-material lifecycle once the
  -- conversion pipeline is installed. Do not falsely claim to purge its audio.
  if r.state in ('saving','completed') then raise exception using errcode='55000',message='recording_already_saved'; end if;
  if r.state='active' then
    update public.review_recordings set state=case when expires_at<=clock_timestamp() then 'expired' else 'discarded' end,
      state_reason=case when expires_at<=clock_timestamp() then 'session_expired' else 'user_discarded' end,updated_at=clock_timestamp()
      where id=r.id returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'state',r.state);
end $$;

create function public.sweep_review_recordings() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
  -- step1-B creates only active sessions. Upload expiry/purge is added together
  -- with the saving transition; it must never be a state-only cleanup.
  update public.review_recordings set state='expired',state_reason='session_expired',updated_at=clock_timestamp()
    where state='active' and expires_at<=clock_timestamp();
  get diagnostics affected=row_count;
  return affected;
end $$;

create function private.revoke_participant_recordings() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and new.consented_at is not null then return new; end if;
  update public.review_recordings set state='revoked',state_reason='consent_withdrawn',updated_at=clock_timestamp()
    where dept_id=old.dept_id and old.user_id=any(participants) and state in ('active','saving');
  -- Existing members_revoke_reviews handles any linked reviewed material.
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger members_revoke_recordings after update of consented_at or delete on public.members
  for each row execute function private.revoke_participant_recordings();

create function public.admin_review_recording_count() returns integer
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare oid uuid:=public.admin_org_id();
begin
  if oid is null then raise exception using errcode='42501',message='forbidden'; end if;
  return (select count(*)::integer from public.review_recordings r join public.departments d on d.id=r.dept_id
    where d.org_id=oid and r.state in ('active','saving') and r.expires_at>statement_timestamp());
end $$;

revoke all on function public.start_review_recording(uuid,jsonb,integer),public.recording_key_context(uuid,uuid),
  public.list_review_recordings(uuid,uuid),public.discard_review_recording(uuid,uuid),public.admin_review_recording_count(),
  public.sweep_review_recordings(),private.revoke_participant_recordings() from public,anon,authenticated,service_role;
grant execute on function public.start_review_recording(uuid,jsonb,integer),public.recording_key_context(uuid,uuid),
  public.list_review_recordings(uuid,uuid),public.discard_review_recording(uuid,uuid),public.admin_review_recording_count() to authenticated;
grant execute on function public.sweep_review_recordings() to service_role;
