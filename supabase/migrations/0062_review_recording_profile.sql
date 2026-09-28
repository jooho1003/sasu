-- Descriptive quality telemetry is appended only after the original save RPC
-- has enforced editor/consent/manifest checks. It never controls visibility.
create function public.create_review_recording_with_profile(
  p_dept uuid,p_recording uuid,p_manifest jsonb,p_capture jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare baseline jsonb; profile jsonb; prior jsonb; result jsonb; mic text; system_levels text;
  mic_count integer; system_count integer; stored public.reviewed_materials%rowtype;
begin
  if p_capture is null or jsonb_typeof(p_capture) is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_capture) k) is distinct from
      array['captured_samples','clipping_ratio','health','interrupted','levels','paused'] or
    jsonb_typeof(p_capture->'levels') is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_capture->'levels') k) is distinct from
      array['microphone','system'] or
    jsonb_typeof(p_capture#>'{levels,microphone}') is distinct from 'string' or
    jsonb_typeof(p_capture#>'{levels,system}') not in ('string','null') or
    jsonb_typeof(p_capture->'clipping_ratio') is distinct from 'number' or
    (p_capture->>'clipping_ratio')::numeric not between 0 and 1 or
    jsonb_typeof(p_capture->'health') is distinct from 'object' or
    (select array_agg(k order by k) from jsonb_object_keys(p_capture->'health') k) is distinct from
      array['backlog_stops','checkpoint_delays','max_pending_samples','max_sample_wall_gap_ms','microphone_reselects'] or
    private.json_int(p_capture#>'{health,checkpoint_delays}',0,1800) is null or
    private.json_int(p_capture#>'{health,max_pending_samples}',0,1000000) is null or
    private.json_int(p_capture#>'{health,backlog_stops}',0,1) is null or
    private.json_int(p_capture#>'{health,max_sample_wall_gap_ms}',0,1800000) is null or
    private.json_int(p_capture#>'{health,microphone_reselects}',0,100) is null then
    raise exception using errcode='22023',message='invalid_recording_profile';
  end if;
  mic:=p_capture#>>'{levels,microphone}';
  system_levels:=p_capture#>>'{levels,system}';
  if mic !~ '^[A-Za-z0-9+/]*={0,2}$' or length(mic)>2400 or mod(length(mic),4)<>0 or
    (system_levels is not null and (system_levels !~ '^[A-Za-z0-9+/]*={0,2}$' or
      length(system_levels)>2400 or mod(length(system_levels),4)<>0)) then
    raise exception using errcode='22023',message='invalid_recording_profile';
  end if;
  begin
    mic_count:=length(decode(mic,'base64'));
    system_count:=case when system_levels is null then null else length(decode(system_levels,'base64')) end;
  exception when invalid_parameter_value or invalid_text_representation then
    raise exception using errcode='22023',message='invalid_recording_profile';
  end;
  if mic_count>1800 or (system_count is not null and system_count<>mic_count) or
    mic_count>floor(private.json_int(p_capture->'captured_samples',1,28800000)/16000.0) then
    raise exception using errcode='22023',message='invalid_recording_profile';
  end if;
  baseline:=p_capture-'levels'-'clipping_ratio'-'health';
  profile:=p_capture-'captured_samples'-'paused'-'interrupted';
  result:=public.create_review_recording(p_dept,p_recording,p_manifest,baseline);
  select * into stored from public.reviewed_materials where id=p_recording and dept_id=p_dept
    and created_by=auth.uid() for update;
  if not found or stored.original_layout<>'audio_segments' then
    raise exception using errcode='40001',message='recording_conflict';
  end if;
  prior:=stored.capture_metadata;
  if prior ? 'levels' then
    if prior->'levels' is distinct from profile->'levels' or
      prior->'clipping_ratio' is distinct from profile->'clipping_ratio' or
      prior->'health' is distinct from profile->'health' then
      raise exception using errcode='40001',message='recording_conflict';
    end if;
  else
    if octet_length((prior||profile)::text)>16384 then
      raise exception using errcode='22023',message='invalid_recording_profile';
    end if;
    update public.reviewed_materials set capture_metadata=prior||profile where id=p_recording;
  end if;
  return result;
end $$;
revoke all on function public.create_review_recording_with_profile(uuid,uuid,jsonb,jsonb) from public,anon,service_role;
grant execute on function public.create_review_recording_with_profile(uuid,uuid,jsonb,jsonb) to authenticated;
