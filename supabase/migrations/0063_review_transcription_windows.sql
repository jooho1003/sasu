-- ADR-072: recording windows pass only a numeric word boundary between jobs.
-- The provider's word/segment text remains in worker memory; review_parts
-- receives only masked sections and this time value.
alter table public.review_parts
  add column last_word_end_seconds double precision
  check (last_word_end_seconds is null or
    (last_word_end_seconds >= 0 and last_word_end_seconds <= 61));

-- A recording part can claim only after its predecessor is complete. Initial
-- recording jobs are still reserved together by 0060; early jobs exit without
-- an LLM call and the preceding finish enqueues a fresh wake-up job.
create or replace function public.claim_review_part(p_part uuid,p_attempt integer,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed jsonb; r public.reviewed_materials%rowtype; p public.review_parts%rowtype;
  prior public.review_parts%rowtype; idx integer;
begin
  if not coalesce(private.review_original_available((select review_id from public.review_parts where id=p_part)),false) then return null; end if;
  select * into p from public.review_parts where id=p_part;
  if not found then return null; end if;
  select * into r from public.reviewed_materials where id=p.review_id;
  if r.original_layout='audio_segments' and p.part_index>0 then
    select * into prior from public.review_parts where review_id=p.review_id and part_index=p.part_index-1;
    if not found or prior.status<>'done' then return null; end if;
  end if;
  claimed:=public.claim_review_part_before_access_controls(p_part,p_attempt,p_lease);
  if claimed is null then return null; end if;
  if r.original_layout is distinct from 'audio_segments' then return claimed||jsonb_build_object('original_layout','single_file'); end if;
  idx:=p.part_index;
  return claimed||jsonb_build_object('original_layout','audio_segments',
    'previous_last_word_end_in_window',case when idx=0 or prior.last_word_end_seconds is null then null
      else greatest(0,prior.last_word_end_seconds-60) end,
    'manifest',jsonb_build_object('version',1,'segments',(select jsonb_agg(jsonb_build_object('index',s.segment_index,
      'sample_count',s.sample_count,'bytes',s.bytes,'sha256',s.sha256) order by s.segment_index)
      from public.review_original_segments s where s.review_id=r.id)),
    'segment_paths',jsonb_build_object(
      'current',(select s.object_path from public.review_original_segments s where s.review_id=r.id and s.segment_index=idx),
      'next',(select s.object_path from public.review_original_segments s where s.review_id=r.id and s.segment_index=idx+1)));
end $$;
revoke all on function public.claim_review_part(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_review_part(uuid,integer,uuid) to service_role;

create function public.finish_review_recording_part(
  p_part uuid,p_lease uuid,p_sections jsonb,p_error text,p_last_word_end double precision
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.review_parts%rowtype; r public.reviewed_materials%rowtype;
  next_part public.review_parts%rowtype; accepted boolean;
begin
  select * into r from public.reviewed_materials where id=(select review_id from public.review_parts where id=p_part) for update;
  select * into p from public.review_parts where id=p_part for update;
  if p.id is null or r.original_layout is distinct from 'audio_segments' then return false; end if;
  if p_last_word_end is not null and (p_last_word_end<0 or p_last_word_end>61) then
    raise exception using errcode='22023',message='transcription_boundary_invalid';
  end if;
  if jsonb_typeof(p_sections) is distinct from 'array' then
    raise exception using errcode='22023',message='transcription_sections_invalid';
  end if;
  if jsonb_array_length(p_sections)>1000
    or exists(select 1 from jsonb_array_elements(p_sections) s
      where s->>'text' is null or s->>'original_text' is null
        or public.mask_review_text(s->>'text')<>s->>'text'
        or public.mask_review_text(s->>'original_text')<>s->>'original_text') then
    raise exception using errcode='22023',message='transcription_sections_invalid';
  end if;
  accepted:=public.finish_review_part(p_part,p_lease,p_sections,p_error);
  if not accepted then return false; end if;
  update public.review_parts set last_word_end_seconds=case when p_error is null then p_last_word_end else null end
    where id=p_part;
  if p_error is not null then return true; end if;
  select * into next_part from public.review_parts where review_id=r.id and part_index=p.part_index+1 for update;
  if next_part.id is not null and next_part.status='queued' then
    update public.review_parts set updated_at=now() where id=next_part.id;
    insert into public.jobs(id,kind,payload) values(gen_random_uuid(),'process_review',
      jsonb_build_object('partId',next_part.id,'attempt',next_part.attempt));
  end if;
  return true;
end $$;
revoke all on function public.finish_review_recording_part(uuid,uuid,jsonb,text,double precision)
  from public,anon,authenticated,service_role;
grant execute on function public.finish_review_recording_part(uuid,uuid,jsonb,text,double precision) to service_role;

-- Later queued windows are waiting for a predecessor, not timed-out work.
create or replace function public.sweep_review_parts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  update public.review_parts p set status='failed',error_code='timeout',lease=null,lease_until=null,updated_at=now()
    from public.reviewed_materials r
    where r.id=p.review_id and (
      (p.status='processing' and p.lease_until<now())
      or (p.status='queued' and p.updated_at<now()-interval '2 minutes'
        and (r.original_layout is distinct from 'audio_segments' or p.part_index=0
          or exists(select 1 from public.review_parts prior where prior.review_id=p.review_id
            and prior.part_index=p.part_index-1 and prior.status='done'))));
  get diagnostics n=row_count;
  update public.reviewed_materials r set status='failed',status_reason='timeout',updated_at=now()
    where r.status='processing' and exists(select 1 from public.review_parts p where p.review_id=r.id and p.status='failed');
  return n;
end $$;
revoke all on function public.sweep_review_parts() from public,anon,authenticated;
grant execute on function public.sweep_review_parts() to service_role;

-- 0034 reextract resets sections and attempts; reset the boundary in the same
-- transaction so no following window can use an old time value.
alter function public.review_action(uuid,integer,text) rename to review_action_before_transcription_storage;
revoke all on function public.review_action_before_transcription_storage(uuid,integer,text)
  from public,anon,authenticated,service_role;
create function public.review_action(p_review uuid,p_revision integer,p_action text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare accepted boolean;
begin
  accepted:=public.review_action_before_transcription_storage(p_review,p_revision,p_action);
  if accepted and p_action in ('reextract','delete','delete_original') then
    update public.review_parts set last_word_end_seconds=null where review_id=p_review;
  end if;
  return accepted;
end $$;
revoke all on function public.review_action(uuid,integer,text) from public,anon,service_role;
grant execute on function public.review_action(uuid,integer,text) to authenticated;
