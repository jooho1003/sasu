-- Apply before 0046 rollback, with retro writes and workers disabled.
drop function public.record_retro_export(uuid,int,text);
drop function public.renew_retro_draft(uuid,int,int,uuid);
