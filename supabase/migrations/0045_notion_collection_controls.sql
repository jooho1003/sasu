-- ADR-060 Step 7: lead-only root control for decision-card candidates.
create function public.set_notion_root_card_candidates(
  p_root uuid,
  p_enabled boolean
) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  root public.notion_roots%rowtype;
begin
  if p_enabled is null then
    raise exception using errcode='22023',message='invalid_card_candidates';
  end if;
  select * into root from public.notion_roots where id=p_root for update;
  if not found or not public.can_see(auth.uid(),root.dept_id,'leads_only') then
    raise exception using errcode='42501',message='forbidden';
  end if;

  update public.notion_roots
  set card_candidates=p_enabled
  where id=root.id;
  update public.sources
  set ingest_mode=case when p_enabled then 'classify' else 'reference' end
  where root_id=root.id and kind='notion_page' and active and import_version=2;
  return true;
end $$;

revoke all on function public.set_notion_root_card_candidates(uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.set_notion_root_card_candidates(uuid,boolean)
  to authenticated;
