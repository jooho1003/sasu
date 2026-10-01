-- Local/manual rollback only; device session deletion cannot be reversed.
drop function if exists public.revoke_device_link(uuid);
drop function if exists public.companion_context();
drop function if exists public.link_device(uuid,text,text);
drop function if exists private.current_session_id();
drop table if exists public.device_links;
