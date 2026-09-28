-- Supabase may grant EXECUTE directly to anon; revoking PUBLIC alone leaves it callable.
revoke execute on function public.can_see(uuid,uuid,text) from anon, public;
