revoke all on function public.recording_key_context(uuid,uuid) from public,anon,authenticated,service_role;
drop function if exists public.recording_key_context(uuid,uuid);
alter table public.reviewed_materials
  drop column if exists consent_confirmed_by,
  drop column if exists capture_metadata,
  drop column if exists original_layout,
  drop column if exists input_method;
