-- Remove direct Supabase default grants as well as the inherited PUBLIC grant.
-- Keep the single visibility predicate available to RLS and worker queries.
revoke all on function public.can_see(uuid, uuid, text) from public, anon;
grant execute on function public.can_see(uuid, uuid, text) to authenticated, service_role;

-- These run only as triggers, never as API entry points. Trigger execution does
-- not require the caller to hold EXECUTE on the trigger function.
revoke all on function public.enqueue_decision_embedding(), public.guard_active_item_source()
  from public, anon, authenticated, service_role;
