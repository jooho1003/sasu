-- Step2 COL-01: immutable continuation and meeting provenance.
alter table public.review_recordings
  add column continues_recording_id uuid references public.review_recordings(id),
  add constraint review_recording_no_self_continuation check (continues_recording_id is null or continues_recording_id<>id);
create unique index review_recordings_one_successor on public.review_recordings(continues_recording_id)
  where continues_recording_id is not null;

-- Preserve the original start function for legacy clients. This wrapper holds
-- its ID lock through both the original start and continuation validation, so
-- a retry cannot change a session's predecessor.
create function public.start_continued_review_recording(p_dept uuid,p_input jsonb,p_key_version integer default 1) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; previous_id uuid; existing public.review_recordings%rowtype;
  predecessor public.review_recordings%rowtype; already boolean; result jsonb;
begin
  if not public.review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if p_input is null or jsonb_typeof(p_input) is distinct from 'object' or
    not p_input ? 'continues_recording_id' or jsonb_typeof(p_input->'continues_recording_id') is distinct from 'string' or
    coalesce(p_input->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    (p_input->>'continues_recording_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='22023',message='invalid_recording';
  end if;
  rid:=(p_input->>'id')::uuid;
  previous_id:=(p_input->>'continues_recording_id')::uuid;
  if rid=previous_id then raise exception using errcode='22023',message='invalid_recording'; end if;
  perform pg_advisory_xact_lock(hashtextextended('recording-id:'||rid::text,0));
  select * into existing from public.review_recordings where id=rid for update;
  already:=found;
  if already and existing.continues_recording_id is distinct from previous_id then
    raise exception using errcode='40001',message='recording_conflict';
  end if;
  result:=public.start_review_recording(p_dept,p_input-'continues_recording_id',p_key_version);
  if not already then
    select * into predecessor from public.review_recordings
      where id=previous_id and dept_id=p_dept and created_by=auth.uid()
        and state in ('active','saving','completed') for share;
    if not found then raise exception using errcode='P0002',message='recording_unavailable'; end if;
    update public.review_recordings set continues_recording_id=previous_id where id=rid;
  end if;
  return result;
end $$;
revoke all on function public.start_continued_review_recording(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.start_continued_review_recording(uuid,jsonb,integer) to authenticated;

-- The existing save RPC owns permission, consent, manifest and idempotency
-- checks. Stamp only server-session values before its reviewed_materials insert.
create function private.stamp_review_recording_metadata() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.review_recordings%rowtype;
begin
  select * into rec from public.review_recordings where id=new.id and dept_id=new.dept_id and created_by=new.created_by;
  if not found then raise exception using errcode='22023',message='invalid_recording'; end if;
  new.capture_metadata:=new.capture_metadata||jsonb_build_object(
    'meeting',jsonb_build_object('provider',rec.meeting_provider,'title',rec.title),
    'continues_review_id',rec.continues_recording_id);
  if octet_length(new.capture_metadata::text)>16384 then
    raise exception using errcode='22023',message='invalid_recording_manifest';
  end if;
  return new;
end $$;
create trigger review_recording_metadata_stamp before insert on public.reviewed_materials
  for each row when (new.original_layout='audio_segments') execute function private.stamp_review_recording_metadata();
revoke all on function private.stamp_review_recording_metadata() from public,anon,authenticated,service_role;
