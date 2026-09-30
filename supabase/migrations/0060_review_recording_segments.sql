-- ADR-070, step1-C. Saved recordings: manifest v1 → per-segment originals →
-- server verification → one completion → in-memory transcription windows.
-- Apply to production only with the matching worker/routes and a verified
-- rollout approval. Deployed 0034/0037/0052 bodies are replaced here, never
-- edited in place. Lock order everywhere: review_recordings →
-- reviewed_materials → review_original_segments → review_parts.

alter table public.review_recordings drop constraint review_recordings_state_reason_check;
alter table public.review_recordings add constraint review_recordings_state_reason_check
  check(state_reason in ('user_discarded','session_expired','consent_withdrawn','review_removed'));

create table public.review_original_segments (
  review_id uuid not null references public.reviewed_materials,
  segment_index integer not null check(segment_index between 0 and 29),
  attempt integer not null default 1 check(attempt between 1 and 3),
  sample_count integer not null check(sample_count between 1 and 960000),
  bytes integer not null,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  object_path text not null unique,
  status text not null default 'awaiting_upload' check(status in ('awaiting_upload','verifying','verified','failed')),
  verify_run integer not null default 0 check(verify_run between 0 and 10),
  error_code text check(error_code in ('segment_missing','segment_mismatch','segment_invalid','segment_unavailable','timeout')),
  lease uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key(review_id,segment_index),
  check(bytes=44+sample_count*2)
);
alter table public.review_original_segments enable row level security;
revoke all on public.review_original_segments from public,anon,authenticated,service_role;
grant select on public.review_original_segments to authenticated,service_role;
-- Same visibility as review_parts: readable exactly when the material is.
create policy review_original_segments_read on public.review_original_segments for select to authenticated
  using(exists(select 1 from public.reviewed_materials r where r.id=review_id));
create trigger demo_reviewer_read_only before insert or update or delete on public.review_original_segments
  for each statement execute function private.reject_demo_reviewer_mutation();

alter table public.review_access_events add column segment_index integer check(segment_index between 0 and 29);

-- Plain JSON integers only (no fractions/strings), checked in order so no cast can raise.
create function private.json_int(p_value jsonb,p_min bigint,p_max bigint) returns bigint
language plpgsql immutable set search_path=public,pg_temp as $$
declare v bigint;
begin
  if p_value is null or jsonb_typeof(p_value) is distinct from 'number' then return null; end if;
  if (p_value#>>'{}') !~ '^(0|[1-9][0-9]{0,9})$' then return null; end if;
  v:=(p_value#>>'{}')::bigint;
  if v<p_min or v>p_max then return null; end if;
  return v;
end $$;

create function private.recording_enabled(p_dept uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select s.browser_recording_enabled from public.departments d
    join public.org_settings s on s.org_id=d.org_id where d.id=p_dept),false)
$$;

create function private.recording_participants_consented(p_dept uuid,p_people uuid[]) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from unnest(p_people) u where not exists(
    select 1 from public.members m where m.dept_id=p_dept and m.user_id=u and m.consented_at is not null))
$$;

-- Deletion, manual deletion, retention and consent apply to every layout.
create function private.review_original_retained(p_review uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reviewed_materials r left join public.retention_settings s on s.dept_id=r.dept_id
    where r.id=p_review and r.deleted_at is null and r.original_deleted_at is null
    and (r.confirmed_at is null or s.review_original_days is null or r.confirmed_at+make_interval(days=>s.review_original_days)>statement_timestamp())
    and private.recording_participants_consented(r.dept_id,r.participants))
$$;

-- 0037 required original_path, which rejected every segmented original. Playback,
-- download, reextract and transcription need every segment verified.
create or replace function private.review_original_available(p_review uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select private.review_original_retained(p_review) and exists(select 1 from public.reviewed_materials r where r.id=p_review and (
    (r.original_layout='single_file' and r.original_path is not null) or
    (r.original_layout='audio_segments'
      and exists(select 1 from public.review_original_segments s where s.review_id=r.id)
      and not exists(select 1 from public.review_original_segments s where s.review_id=r.id and s.status<>'verified'))))
$$;

create function private.review_segment_states(p_review uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('index',s.segment_index,'attempt',s.attempt,'path',s.object_path,
    'status',s.status,'error_code',s.error_code) order by s.segment_index),'[]'::jsonb)
  from public.review_original_segments s where s.review_id=p_review
$$;

-- Callers hold the session (and, where present, material) lock first.
create function private.cancel_recording_review(p_review uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.reviewed_materials set status=case when status in ('uploading','processing','failed') then 'cancelled' else status end,
    status_reason=p_reason,original_deleted_at=coalesce(original_deleted_at,now()),candidate_sections=null,updated_at=now()
    where id=p_review and original_layout='audio_segments' and deleted_at is null;
  update public.review_original_segments set lease=null,lease_until=null,updated_at=clock_timestamp()
    where review_id=p_review and lease is not null;
  update public.jobs set status='failed',last_error='cancelled',lease_until=null
    where kind='verify_review_segment' and payload->>'reviewId'=p_review::text and status in ('queued','running');
  insert into public.jobs(id,kind,payload) values(md5('recording-purge:'||p_review)::uuid,'purge_review_files',
    jsonb_build_object('reviewId',p_review)) on conflict(id) do nothing;
end $$;

-- Callers hold the session and material locks. verify_run bounds automatic and
-- user-driven re-verification; exhausting it fails the recording visibly.
create function private.enqueue_review_segment(p_review uuid,p_index integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.review_original_segments%rowtype;
begin
  select * into s from public.review_original_segments where review_id=p_review and segment_index=p_index for update;
  if not found then return false; end if;
  if s.verify_run>=10 then
    update public.review_original_segments set status='failed',error_code='timeout',lease=null,lease_until=null,updated_at=clock_timestamp()
      where review_id=p_review and segment_index=p_index;
    update public.reviewed_materials set status='failed',status_reason='timeout',updated_at=now() where id=p_review and status='uploading';
    return false;
  end if;
  update public.review_original_segments set status='verifying',verify_run=verify_run+1,error_code=null,lease=null,lease_until=null,
    updated_at=clock_timestamp() where review_id=p_review and segment_index=p_index returning * into s;
  insert into public.jobs(id,kind,payload) values(md5('review-segment:'||s.review_id||':'||s.segment_index||':'||s.verify_run)::uuid,
    'verify_review_segment',jsonb_build_object('reviewId',s.review_id,'index',s.segment_index,'attempt',s.attempt,'run',s.verify_run))
    on conflict(id) do nothing;
  return true;
end $$;

create function public.create_review_recording(p_dept uuid,p_recording uuid,p_manifest jsonb,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.review_recordings%rowtype; prior public.reviewed_materials%rowtype; seg jsonb; ord bigint; n integer;
  idx bigint; samples bigint; size bigint; captured bigint; total_samples bigint:=0; total_bytes bigint:=0;
  canonical text:='sasu-recording-manifest-v1'||chr(10); fp text; meta jsonb;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not private.recording_enabled(p_dept) then raise exception using errcode='42501',message='browser_recording_disabled'; end if;
  -- Manifest v1 (design §5.1.1) is re-validated here; client fingerprints are never trusted.
  if p_manifest is null or jsonb_typeof(p_manifest) is distinct from 'object' then
    raise exception using errcode='22023',message='invalid_recording_manifest';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p_manifest) k) is distinct from array['segments','version']
    or private.json_int(p_manifest->'version',1,1) is null or jsonb_typeof(p_manifest->'segments') is distinct from 'array' then
    raise exception using errcode='22023',message='invalid_recording_manifest';
  end if;
  n:=jsonb_array_length(p_manifest->'segments');
  if n<1 or n>30 then raise exception using errcode='22023',message='invalid_recording_manifest'; end if;
  for seg,ord in select e.value,e.ordinality-1 from jsonb_array_elements(p_manifest->'segments') with ordinality e loop
    if jsonb_typeof(seg) is distinct from 'object' then raise exception using errcode='22023',message='invalid_recording_manifest'; end if;
    if (select array_agg(k order by k) from jsonb_object_keys(seg) k) is distinct from array['bytes','index','sample_count','sha256'] then
      raise exception using errcode='22023',message='invalid_recording_manifest';
    end if;
    idx:=private.json_int(seg->'index',0,29); samples:=private.json_int(seg->'sample_count',1,960000); size:=private.json_int(seg->'bytes',46,1920044);
    if idx is null or samples is null or size is null or idx<>ord or size<>44+samples*2 or (ord<n-1 and samples<>960000)
      or not coalesce(jsonb_typeof(seg->'sha256')='string' and (seg->>'sha256') ~ '^[a-f0-9]{64}$',false) then
      raise exception using errcode='22023',message='invalid_recording_manifest';
    end if;
    total_samples:=total_samples+samples; total_bytes:=total_bytes+size;
    canonical:=canonical||idx::text||':'||samples::text||':'||size::text||':'||(seg->>'sha256')||chr(10);
  end loop;
  if total_samples>28800000 or total_bytes>67108864 then raise exception using errcode='22023',message='invalid_recording_manifest'; end if;
  fp:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
  if p_capture is null or jsonb_typeof(p_capture) is distinct from 'object' then
    raise exception using errcode='22023',message='invalid_recording_manifest';
  end if;
  captured:=private.json_int(p_capture->'captured_samples',1,28800000);
  if (select array_agg(k order by k) from jsonb_object_keys(p_capture) k) is distinct from array['captured_samples','interrupted','paused']
    or jsonb_typeof(p_capture->'paused') is distinct from 'boolean' or jsonb_typeof(p_capture->'interrupted') is distinct from 'boolean'
    or captured is null or captured<total_samples then
    raise exception using errcode='22023',message='invalid_recording_manifest';
  end if;

  select * into rec from public.review_recordings where id=p_recording and dept_id=p_dept and created_by=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
  if rec.state in ('saving','completed') then
    select * into prior from public.reviewed_materials where id=rec.id;
    if not found or prior.fingerprint<>fp or prior.original_layout<>'audio_segments' then
      raise exception using errcode='40001',message='recording_conflict';
    end if;
    if rec.state='saving' and rec.expires_at<=clock_timestamp() then raise exception using errcode='55000',message='recording_closed'; end if;
    return jsonb_build_object('review_id',rec.id,'state',rec.state,'segments',private.review_segment_states(rec.id));
  end if;
  if rec.state<>'active' or rec.expires_at<=clock_timestamp() then raise exception using errcode='55000',message='recording_closed'; end if;
  if not private.recording_participants_consented(p_dept,rec.participants) then
    raise exception using errcode='42501',message='participant_not_consented';
  end if;
  if exists(select 1 from public.reviewed_materials where id=rec.id) then raise exception using errcode='40001',message='recording_conflict'; end if;
  meta:=p_capture||jsonb_build_object('manifest_version',1,'retained_samples',total_samples,
    'meeting_provider',rec.meeting_provider,'consent_snapshot',rec.consent_snapshot);
  if octet_length(meta::text)>16384 then raise exception using errcode='22023',message='invalid_recording_manifest'; end if;
  insert into public.reviewed_materials(id,dept_id,created_by,kind,title,filename,file_size,fingerprint,duration,visibility,participants,
      synthetic,consent_confirmed_at,original_path,original_uploaded,status,input_method,original_layout,capture_metadata,consent_confirmed_by)
    values(rec.id,rec.dept_id,rec.created_by,'audio',rec.title,left(rec.title,195)||'.wav',total_bytes,fp,total_samples/16000.0,
      rec.visibility,rec.participants,false,rec.started_at,null,false,'uploading',rec.input_method,'audio_segments',meta,rec.consent_confirmed_by);
  insert into public.review_original_segments(review_id,segment_index,attempt,sample_count,bytes,sha256,object_path)
    select rec.id,(e->>'index')::integer,1,(e->>'sample_count')::integer,(e->>'bytes')::integer,e->>'sha256',
      rec.dept_id||'/'||rec.id||'/original-segments/'||(e->>'index')::integer||'-1.wav'
    from jsonb_array_elements(p_manifest->'segments') e;
  update public.review_recordings set state='saving',updated_at=clock_timestamp() where id=rec.id;
  return jsonb_build_object('review_id',rec.id,'state','saving','segments',private.review_segment_states(rec.id));
end $$;

-- Upload completion is a request for verification only; it never marks anything saved.
create function public.finalize_review_recording(p_dept uuid,p_recording uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.review_recordings%rowtype; r public.reviewed_materials%rowtype; target integer;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not private.recording_enabled(p_dept) then raise exception using errcode='42501',message='browser_recording_disabled'; end if;
  select * into rec from public.review_recordings where id=p_recording and dept_id=p_dept and created_by=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
  if rec.state='completed' then
    return jsonb_build_object('review_id',rec.id,'state',rec.state,'segments',private.review_segment_states(rec.id));
  end if;
  if rec.state='active' and rec.expires_at>clock_timestamp() then raise exception using errcode='55000',message='recording_not_saved'; end if;
  if rec.state<>'saving' or rec.expires_at<=clock_timestamp() then raise exception using errcode='55000',message='recording_closed'; end if;
  if not private.recording_participants_consented(p_dept,rec.participants) then
    raise exception using errcode='42501',message='participant_not_consented';
  end if;
  select * into r from public.reviewed_materials where id=rec.id for update;
  if not found or r.deleted_at is not null or r.original_deleted_at is not null or r.original_layout<>'audio_segments' then
    raise exception using errcode='55000',message='recording_closed';
  end if;
  if r.status='failed' then raise exception using errcode='55000',message='recording_failed'; end if;
  if r.status<>'uploading' then raise exception using errcode='55000',message='recording_closed'; end if;
  for target in select s.segment_index from public.review_original_segments s where s.review_id=r.id and (s.status='awaiting_upload'
      or (s.status='verifying' and ((s.lease is null and s.updated_at<clock_timestamp()-interval '2 minutes') or s.lease_until<clock_timestamp())))
    order by s.segment_index loop
    perform private.enqueue_review_segment(r.id,target);
  end loop;
  return jsonb_build_object('review_id',rec.id,'state',rec.state,'segments',private.review_segment_states(rec.id));
end $$;

-- A saved but unverified recording can no longer complete once discarded.
create or replace function public.discard_review_recording(p_dept uuid,p_recording uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.review_recordings%rowtype; was text;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  select * into r from public.review_recordings where id=p_recording and dept_id=p_dept and created_by=auth.uid() for update;
  if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
  if r.state='completed' then raise exception using errcode='55000',message='recording_already_saved'; end if;
  was:=r.state;
  if r.state in ('active','saving') then
    update public.review_recordings set state=case when expires_at<=clock_timestamp() then 'expired' else 'discarded' end,
      state_reason=case when expires_at<=clock_timestamp() then 'session_expired' else 'user_discarded' end,updated_at=clock_timestamp()
      where id=r.id returning * into r;
    if was='saving' then
      perform private.cancel_recording_review(r.id,case when r.state='expired' then 'session_expired' else 'recording_discarded' end);
    end if;
  end if;
  return jsonb_build_object('id',r.id,'state',r.state);
end $$;

create function public.claim_review_segment(p_review uuid,p_index integer,p_attempt integer,p_run integer,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.review_recordings%rowtype; r public.reviewed_materials%rowtype; s public.review_original_segments%rowtype;
begin
  select * into rec from public.review_recordings where id=p_review for update;
  if not found then return null; end if;
  select * into r from public.reviewed_materials where id=p_review for update;
  if not found then return null; end if;
  select * into s from public.review_original_segments where review_id=p_review and segment_index=p_index for update;
  if not found or p_lease is null or rec.state<>'saving' or rec.expires_at<=clock_timestamp()
    or r.status<>'uploading' or r.original_layout<>'audio_segments' or not private.review_original_retained(r.id)
    or s.status<>'verifying' or s.attempt is distinct from p_attempt or s.verify_run is distinct from p_run
    or (s.lease is not null and s.lease_until>clock_timestamp())
    or not public.review_editor(r.dept_id,r.created_by) or not private.recording_enabled(r.dept_id) then return null; end if;
  update public.review_original_segments set lease=p_lease,lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp()
    where review_id=s.review_id and segment_index=s.segment_index;
  return jsonb_build_object('review_id',r.id,'dept_id',r.dept_id,'index',s.segment_index,'attempt',s.attempt,
    'object_path',s.object_path,'sample_count',s.sample_count,'bytes',s.bytes,'sha256',s.sha256);
end $$;

-- The material row lock makes completion happen exactly once, whatever order
-- concurrent verifications finish in. Partial verification never shows as saved.
create function public.finish_review_segment(p_review uuid,p_index integer,p_lease uuid,p_result text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.review_recordings%rowtype; r public.reviewed_materials%rowtype; s public.review_original_segments%rowtype;
begin
  if p_result is null or p_result not in ('verified','missing','mismatch','retry') then
    raise exception using errcode='22023',message='invalid_segment_result';
  end if;
  select * into rec from public.review_recordings where id=p_review for update;
  if not found then return false; end if;
  select * into r from public.reviewed_materials where id=p_review for update;
  if not found then return false; end if;
  select * into s from public.review_original_segments where review_id=p_review and segment_index=p_index for update;
  if not found or p_lease is null or rec.state<>'saving' or rec.expires_at<=clock_timestamp()
    or r.status<>'uploading' or r.original_layout<>'audio_segments' or not private.review_original_retained(r.id)
    or s.status<>'verifying' or s.lease is distinct from p_lease or s.lease_until<=clock_timestamp()
    or not public.review_editor(r.dept_id,r.created_by) or not private.recording_enabled(r.dept_id) then return false; end if;
  if p_result='retry' then
    update public.review_original_segments set lease=null,lease_until=null,error_code='segment_unavailable',updated_at=clock_timestamp()
      where review_id=s.review_id and segment_index=s.segment_index;
    return true;
  elsif p_result='missing' then
    update public.review_original_segments set status='awaiting_upload',lease=null,lease_until=null,error_code='segment_missing',
      updated_at=clock_timestamp() where review_id=s.review_id and segment_index=s.segment_index;
    return true;
  elsif p_result='mismatch' then
    if s.attempt>=3 then
      update public.review_original_segments set status='failed',lease=null,lease_until=null,error_code='segment_invalid',
        updated_at=clock_timestamp() where review_id=s.review_id and segment_index=s.segment_index;
      update public.reviewed_materials set status='failed',status_reason='segment_invalid',updated_at=now() where id=r.id;
    else
      -- The same recording ID keeps its key and local ciphertext; only the path moves.
      update public.review_original_segments set attempt=attempt+1,
        object_path=r.dept_id||'/'||r.id||'/original-segments/'||s.segment_index||'-'||(s.attempt+1)||'.wav',
        status='awaiting_upload',lease=null,lease_until=null,error_code='segment_mismatch',updated_at=clock_timestamp()
        where review_id=s.review_id and segment_index=s.segment_index;
    end if;
    return true;
  end if;
  update public.review_original_segments set status='verified',lease=null,lease_until=null,error_code=null,updated_at=clock_timestamp()
    where review_id=s.review_id and segment_index=s.segment_index;
  if exists(select 1 from public.review_original_segments where review_id=r.id and status<>'verified') then return true; end if;
  insert into public.review_parts(review_id,part_index,start_seconds,end_seconds,object_path,status,attempt,updated_at)
    -- least() ignores NULL, so the last window must not borrow a second.
    select r.id,cur.segment_index,cur.segment_index*60,
      cur.segment_index*60+(cur.sample_count+case when nxt.segment_index is null then 0 else least(16000,nxt.sample_count) end)/16000.0,
      r.dept_id||'/'||r.id||'/windows/'||cur.segment_index,'queued',1,now()
    from public.review_original_segments cur
    left join public.review_original_segments nxt on nxt.review_id=cur.review_id and nxt.segment_index=cur.segment_index+1
    where cur.review_id=r.id;
  insert into public.jobs(id,kind,payload)
    select md5('review-part:'||p.id||':'||p.attempt)::uuid,'process_review',jsonb_build_object('partId',p.id,'attempt',p.attempt)
    from public.review_parts p where p.review_id=r.id
    on conflict(id) do nothing;
  update public.reviewed_materials set original_uploaded=true,status='processing',status_reason=null,updated_at=now() where id=r.id;
  update public.review_recordings set state='completed',updated_at=clock_timestamp() where id=rec.id;
  return true;
end $$;

-- Storage INSERT. single_file is unchanged. Segmented originals accept only the
-- recorder's issued path while that segment awaits upload. Client writes to
-- parts/ or windows/ of a segmented material match nothing and are refused.
create or replace function public.review_storage_allowed(p_name text,p_write boolean) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_write and (
    exists(select 1 from reviewed_materials r where r.original_layout='single_file' and private.review_original_available(r.id)
      and review_editor(r.dept_id,auth.uid())
      and (r.original_path=p_name or exists(select 1 from review_parts p where p.review_id=r.id and p.object_path=p_name and p.status in ('waiting','failed'))))
    or exists(select 1 from review_original_segments s join reviewed_materials r on r.id=s.review_id join review_recordings rec on rec.id=r.id
      where s.object_path=p_name and s.status='awaiting_upload'
        and r.original_layout='audio_segments' and r.status='uploading' and r.created_by=auth.uid()
        and rec.created_by=auth.uid() and rec.state='saving' and rec.expires_at>statement_timestamp()
        and review_editor(r.dept_id,auth.uid()) and private.recording_enabled(r.dept_id) and private.review_original_retained(r.id))
  )
$$;

create or replace function public.authorize_review_access(p_dept uuid,p_review uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; eid bigint; ticket uuid; oid uuid;
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  select * into r from reviewed_materials where id=p_review and dept_id=p_dept and deleted_at is null;
  if not found then raise exception using errcode='42501',message='review_editor_required'; end if;
  if p_action is null or p_action not in ('play_original','download_original','export','reextract')
    or (p_action='play_original' and r.kind<>'audio') then raise exception using errcode='22023',message='invalid_access_action'; end if;
  -- ADR-070 decision 6: segmented originals are delivered one numbered segment at a time.
  if r.original_layout='audio_segments' and p_action in ('play_original','download_original') then
    raise exception using errcode='22023',message='segment_required';
  end if;
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

-- ADR-058 rules per segment: one event, one 60-second single-use ticket, the
-- same per-actor minute limit shared with whole-file access.
create function public.authorize_review_segment_access(p_dept uuid,p_review uuid,p_index integer,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; s review_original_segments%rowtype; eid bigint; ticket uuid; oid uuid;
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  select * into r from reviewed_materials where id=p_review and dept_id=p_dept and deleted_at is null;
  if not found then raise exception using errcode='42501',message='review_editor_required'; end if;
  if p_action is null or p_action not in ('play_original','download_original') or r.kind<>'audio' or r.original_layout<>'audio_segments' then
    raise exception using errcode='22023',message='invalid_access_action';
  end if;
  if p_index is null or p_index<0 or p_index>29 then raise exception using errcode='22023',message='invalid_segment'; end if;
  select * into s from review_original_segments where review_id=r.id and segment_index=p_index;
  if not found then raise exception using errcode='22023',message='invalid_segment'; end if;
  if s.status<>'verified' or not private.review_original_available(r.id) then raise exception using errcode='P0002',message='original_unavailable'; end if;
  select org_id into oid from departments where id=p_dept;
  if p_action='download_original' and not coalesce((select allow_original_download from org_settings where org_id=oid),false)
    then raise exception using errcode='42501',message='original_download_disabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended('review-access:'||auth.uid()::text,0));
  if (select count(*) from review_access_events where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
    then raise exception using errcode='P0001',message='rate_limited'; end if;
  insert into review_access_events(review_id,dept_id,actor_id,action,segment_index) values(r.id,r.dept_id,auth.uid(),p_action,s.segment_index)
    returning id into eid;
  insert into private.review_access_tickets(event_id) values(eid) returning token into ticket;
  return jsonb_build_object('token',ticket,'path',s.object_path,'kind',r.kind,'filename',r.filename,
    'segment_index',s.segment_index,'sample_count',s.sample_count);
end $$;

create or replace function public.consume_review_access(p_name text) returns boolean
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
  if r.original_layout='audio_segments' then
    -- The event names one segment; only that verified segment's issued path is readable.
    if a.segment_index is null or not exists(select 1 from review_original_segments s where s.review_id=r.id
      and s.segment_index=a.segment_index and s.status='verified' and s.object_path=p_name) then return false; end if;
  elsif a.segment_index is not null or r.original_path is distinct from p_name then return false;
  end if;
  if not private.review_original_available(r.id) then return false; end if;
  if a.action='play_original' and r.kind<>'audio' then return false; end if;
  if a.action='download_original' and not coalesce((select s.allow_original_download from org_settings s join departments d on d.org_id=s.org_id where d.id=r.dept_id),false) then return false; end if;
  if a.action not in ('play_original','download_original') then return false; end if;
  update private.review_access_tickets set used_transaction=txid_current() where token=t.token and used_transaction is null;
  return true;
end $$;

-- Windows are rebuilt from verified originals by the worker; tell it how.
create or replace function public.claim_review_part(p_part uuid,p_attempt integer,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed jsonb; r reviewed_materials%rowtype; idx integer;
begin
  if not coalesce(private.review_original_available((select review_id from review_parts where id=p_part)),false) then return null; end if;
  claimed:=claim_review_part_before_access_controls(p_part,p_attempt,p_lease);
  if claimed is null then return null; end if;
  select * into r from reviewed_materials where id=(claimed->>'review_id')::uuid;
  if r.original_layout is distinct from 'audio_segments' then return claimed||jsonb_build_object('original_layout','single_file'); end if;
  idx:=(claimed->>'part_index')::integer;
  return claimed||jsonb_build_object('original_layout','audio_segments',
    'manifest',jsonb_build_object('version',1,'segments',(select jsonb_agg(jsonb_build_object('index',s.segment_index,
      'sample_count',s.sample_count,'bytes',s.bytes,'sha256',s.sha256) order by s.segment_index)
      from review_original_segments s where s.review_id=r.id)),
    'segment_paths',jsonb_build_object(
      'current',(select s.object_path from review_original_segments s where s.review_id=r.id and s.segment_index=idx),
      'next',(select s.object_path from review_original_segments s where s.review_id=r.id and s.segment_index=idx+1)));
end $$;

-- Wrap the 0037 wrapper. Cancelling or deleting a saving recording ends its
-- session in the same transaction; reextract rebuilds windows server-side.
alter function public.review_action(uuid,integer,text) rename to review_action_before_recordings;
revoke all on function public.review_action_before_recordings(uuid,integer,text) from public,anon,authenticated,service_role;
create function public.review_action(p_review uuid,p_revision integer,p_action text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec review_recordings%rowtype; r reviewed_materials%rowtype; result boolean; target integer;
begin
  select * into rec from review_recordings where id=p_review for update;
  result:=review_action_before_recordings(p_review,p_revision,p_action);
  select * into r from reviewed_materials where id=p_review;
  if r.original_layout='audio_segments' then
    if p_action in ('cancel','delete','delete_original') then
      if rec.state in ('active','saving') then
        update review_recordings set state='discarded',state_reason='review_removed',updated_at=clock_timestamp() where id=rec.id;
        perform private.cancel_recording_review(r.id,'recording_discarded');
      end if;
      update jobs set status='failed',last_error='cancelled',lease_until=null
        where kind='verify_review_segment' and payload->>'reviewId'=r.id::text and status in ('queued','running');
    elsif p_action='reextract' then
      for target in select part_index from review_parts where review_id=r.id order by part_index loop
        perform queue_review_part_before_access_controls(r.id,target);
      end loop;
    end if;
  end if;
  return result;
end $$;

create or replace function public.sweep_review_recordings() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer:=0; rec public.review_recordings%rowtype; r public.reviewed_materials%rowtype; target record; stale integer;
begin
  for rec in select * from public.review_recordings where state in ('active','saving') and expires_at<=clock_timestamp()
    order by id for update skip locked loop
    update public.review_recordings set state='expired',state_reason='session_expired',updated_at=clock_timestamp() where id=rec.id;
    -- Without a live session no key exists to rebuild the originals, so an
    -- unfinished save (uploading or failed) is cancelled and purged.
    if rec.state='saving' then perform private.cancel_recording_review(rec.id,'session_expired'); end if;
    affected:=affected+1;
  end loop;
  for target in select distinct s.review_id from public.review_original_segments s where s.status='verifying'
    and ((s.lease is null and s.updated_at<clock_timestamp()-interval '2 minutes') or s.lease_until<clock_timestamp()) order by s.review_id loop
    select * into rec from public.review_recordings where id=target.review_id and state='saving' and expires_at>clock_timestamp() for update skip locked;
    continue when not found;
    select * into r from public.reviewed_materials where id=rec.id and status='uploading' and deleted_at is null and original_deleted_at is null
      for update skip locked;
    continue when not found;
    continue when not private.recording_enabled(r.dept_id) or not public.review_editor(r.dept_id,r.created_by);
    for stale in select s.segment_index from public.review_original_segments s where s.review_id=r.id and s.status='verifying'
      and ((s.lease is null and s.updated_at<clock_timestamp()-interval '2 minutes') or s.lease_until<clock_timestamp()) order by s.segment_index loop
      perform private.enqueue_review_segment(r.id,stale);
    end loop;
  end loop;
  return affected;
end $$;

create or replace function private.revoke_participant_recordings() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid;
begin
  if tg_op='UPDATE' and new.consented_at is not null then return new; end if;
  for rid in update public.review_recordings set state='revoked',state_reason='consent_withdrawn',updated_at=clock_timestamp()
    where dept_id=old.dept_id and old.user_id=any(participants) and state in ('active','saving') returning id loop
    update public.jobs set status='failed',last_error='consent_withdrawn',lease_until=null
      where kind='verify_review_segment' and payload->>'reviewId'=rid::text and status in ('queued','running');
  end loop;
  -- Existing members_revoke_reviews deletes the linked material and schedules the purge.
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.create_review_recording(uuid,uuid,jsonb,jsonb),public.finalize_review_recording(uuid,uuid),
  public.authorize_review_segment_access(uuid,uuid,integer,text),public.review_action(uuid,integer,text) from public,anon,service_role;
grant execute on function public.create_review_recording(uuid,uuid,jsonb,jsonb),public.finalize_review_recording(uuid,uuid),
  public.authorize_review_segment_access(uuid,uuid,integer,text),public.review_action(uuid,integer,text) to authenticated;
revoke all on function public.claim_review_segment(uuid,integer,integer,integer,uuid),public.finish_review_segment(uuid,integer,uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_review_segment(uuid,integer,integer,integer,uuid),public.finish_review_segment(uuid,integer,uuid,text)
  to service_role;
revoke all on function private.json_int(jsonb,bigint,bigint),private.recording_enabled(uuid),private.recording_participants_consented(uuid,uuid[]),
  private.review_original_retained(uuid),private.review_segment_states(uuid),private.cancel_recording_review(uuid,text),
  private.enqueue_review_segment(uuid,integer) from public,anon,authenticated,service_role;
