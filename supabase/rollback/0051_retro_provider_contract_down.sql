-- Restore the 0050 connection entry point. The migration only tightened the
-- provider allow-list; no stored credential or activity is removed here.
create or replace function public.begin_retro_connection(
  p_dept uuid,
  p_provider text,
  p_hash text,
  p_config jsonb,
  p_auth_kind text
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform private.retro_member(auth.uid(),p_dept);
  perform private.retro_connection_member(auth.uid(),p_dept,p_provider);
  if p_provider not in (
    'github','figma','google_calendar','notion','jira','confluence','linear',
    'salesmap','hubspot','pipedrive','channel_talk','intercom','zendesk',
    'wanted','stibee','mailchimp','greenhouse','lever','workable','meta',
    'youtube','ga4'
  )
    or p_auth_kind not in ('oauth','token')
    or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_config) is distinct from 'object'
    or octet_length(p_config::text)>8192
    or p_config ?| array['endpoint','url','baseUrl','token','secret','access_token','refresh_token']
  then
    raise exception 'invalid_connection' using errcode='22023';
  end if;
  delete from private.retro_connection_states where expires_at<now();
  if (select count(*) from private.retro_connection_states where user_id=auth.uid() and completed_at is null)>=10
  then
    raise exception 'rate_limited' using errcode='P0001';
  end if;
  insert into private.retro_connection_states(hash,user_id,dept_id,provider,config,auth_kind)
    values(p_hash,auth.uid(),p_dept,p_provider,p_config,p_auth_kind);
  return true;
end $$;
