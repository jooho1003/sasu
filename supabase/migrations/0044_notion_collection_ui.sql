-- ADR-060 Step 7: an organization administrator may only use this credential
-- to list the workspace's top-level entries.  The browser never receives it.
create function public.notion_installation_for_admin() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'org_id', installation.org_id,
    'workspace_id', installation.workspace_id,
    'encrypted_token', installation.encrypted_token
  )
  from public.notion_installations installation
  join public.orgs organization on organization.id=installation.org_id
  where installation.org_id=public.admin_org_id()
    and installation.active and not organization.is_demo
$$;
revoke all on function public.notion_installation_for_admin() from public,anon,authenticated,service_role;
grant execute on function public.notion_installation_for_admin() to authenticated;
