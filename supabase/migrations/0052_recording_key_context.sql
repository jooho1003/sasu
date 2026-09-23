-- ADR-056/057: recording identity metadata and SQL authorization for the
-- short-lived browser checkpoint key. The server derives the key; SQL returns
-- only validated identifiers and never receives RECORDING_KEY_SECRET.
alter table public.reviewed_materials
  add column input_method text not null default 'upload'
    check (input_method in ('upload','microphone','system_and_microphone')),
  add column original_layout text not null default 'single_file'
    check (original_layout in ('single_file','audio_segments')),
  add column capture_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capture_metadata)='object'),
  add column consent_confirmed_by uuid references auth.users;

create function public.recording_key_context(p_dept uuid,p_review uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.reviewed_materials%rowtype; recording_on boolean;
begin
  if not public.review_editor(p_dept,auth.uid()) then
    raise exception using errcode='42501',message='review_editor_required';
  end if;

  select coalesce(s.browser_recording_enabled,false) into recording_on
  from public.departments d left join public.org_settings s on s.org_id=d.org_id
  where d.id=p_dept;
  if not coalesce(recording_on,false) then
    raise exception using errcode='42501',message='browser_recording_disabled';
  end if;

  select * into r from public.reviewed_materials
  where id=p_review and dept_id=p_dept and created_by=auth.uid()
    and deleted_at is null and original_deleted_at is null
    and status='uploading' and kind='audio'
    and input_method in ('microphone','system_and_microphone')
    and original_layout='audio_segments';
  if not found then
    raise exception using errcode='P0002',message='recording_unavailable';
  end if;

  if r.consent_confirmed_by is distinct from auth.uid()
    or exists(
      select 1 from unnest(r.participants) participant(user_id)
      where not exists(
        select 1 from public.members m
        where m.dept_id=p_dept and m.user_id=participant.user_id
          and m.consented_at is not null
      )
    ) then
    raise exception using errcode='42501',message='participant_not_consented';
  end if;

  return jsonb_build_object(
    'recording_id',r.id,
    'user_id',auth.uid(),
    'dept_id',r.dept_id
  );
end $$;

revoke all on function public.recording_key_context(uuid,uuid) from public,anon,service_role;
grant execute on function public.recording_key_context(uuid,uuid) to authenticated;
