drop function public.create_trailer_attempt(uuid,uuid,text,text,jsonb);
drop table public.trailer_attempts;
drop function private.guard_trailer_attempt();
alter table public.orgs drop column trailer_assessment_enabled;
