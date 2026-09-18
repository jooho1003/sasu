-- ADR-060: one Notion workspace per organization, with no global-token fallback.
create table public.notion_installations (
  org_id uuid primary key references public.orgs(id),
  workspace_id text not null unique,
  workspace_name text,
  bot_id text,
  auth_kind text not null check (auth_kind in ('internal_token', 'oauth')),
  encrypted_token text,
  active boolean not null default true,
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  revoked_at timestamptz,
  attested_at timestamptz not null,
  check (not active or encrypted_token is not null)
);

alter table public.notion_installations enable row level security;
revoke all on table public.notion_installations
  from public, anon, authenticated;
grant all on table public.notion_installations to service_role;

-- Only the server adapter reaches this function after /users/me verifies the
-- submitted credential. Authority and workspace ownership are still checked
-- again inside the same transaction.
create function public.complete_notion_installation(
  p_actor uuid,
  p_org uuid,
  p_workspace text,
  p_name text,
  p_bot text,
  p_kind text,
  p_encrypted text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.org_admins
    where org_id = p_org and user_id = p_actor
  ) or exists (
    select 1 from public.orgs where id = p_org and is_demo
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if coalesce(p_workspace, '') = ''
    or length(p_workspace) > 300
    or coalesce(p_bot, '') = ''
    or length(p_bot) > 300
    or p_kind not in ('internal_token', 'oauth')
    or coalesce(p_encrypted, '') !~ '^v1\.' then
    raise exception using errcode = '22023', message = 'invalid_installation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace, 38));
  perform 1 from public.orgs where id = p_org for update;
  perform 1 from public.notion_installations where org_id = p_org for update;

  if exists (
    select 1 from public.notion_installations
    where workspace_id = p_workspace and org_id <> p_org
  ) then
    raise exception using errcode = '23505', message = 'workspace_already_bound';
  end if;

  -- Re-connecting to a different workspace orphans every page source of the old
  -- one: the new token cannot read them, so retire them instead of letting each
  -- sync fail one by one.
  if exists (
    select 1 from public.notion_installations
    where org_id = p_org and workspace_id <> p_workspace
  ) then
    update public.sources
    set active = false,
        last_error = 'notion_disconnected'
    where kind = 'notion_page'
      and active
      and dept_id in (
        select id from public.departments where org_id = p_org
      );
  end if;

  insert into public.notion_installations (
    org_id,
    workspace_id,
    workspace_name,
    bot_id,
    auth_kind,
    encrypted_token,
    active,
    installed_by,
    installed_at,
    revoked_at,
    attested_at
  ) values (
    p_org,
    p_workspace,
    nullif(left(coalesce(p_name, ''), 200), ''),
    p_bot,
    p_kind,
    p_encrypted,
    true,
    p_actor,
    now(),
    null,
    now()
  )
  on conflict (org_id) do update set
    workspace_id = excluded.workspace_id,
    workspace_name = excluded.workspace_name,
    bot_id = excluded.bot_id,
    auth_kind = excluded.auth_kind,
    encrypted_token = excluded.encrypted_token,
    active = true,
    installed_by = p_actor,
    installed_at = now(),
    revoked_at = null,
    attested_at = now();

  return true;
end
$$;
revoke all on function public.complete_notion_installation(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_notion_installation(uuid, uuid, text, text, text, text, text)
  to service_role;

create function public.notion_installation_for_department(p_dept uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'org_id', installation.org_id,
    'workspace_id', installation.workspace_id,
    'encrypted_token', installation.encrypted_token
  )
  from public.notion_installations installation
  join public.departments department
    on department.org_id = installation.org_id
  join public.orgs organization
    on organization.id = installation.org_id
  where department.id = p_dept
    and installation.active
    and not organization.is_demo
    and (
      auth.role() = 'service_role'
      or public.can_see(auth.uid(), department.id, 'leads_only')
    )
$$;

create function public.notion_installation_for_job(p_job uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  dept uuid;
begin
  select source.dept_id
  into dept
  from public.jobs job
  join public.sources source
    on source.id = (job.payload ->> 'sourceId')::uuid
  where job.id = p_job
    and job.kind = 'notion_import';

  return public.notion_installation_for_department(dept);
end
$$;

revoke all on function public.notion_installation_for_department(uuid),
  public.notion_installation_for_job(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.notion_installation_for_department(uuid)
  to authenticated, service_role;
grant execute on function public.notion_installation_for_job(uuid)
  to service_role;

create function public.admin_notion_installation()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  org uuid;
begin
  org := public.admin_org_id();
  if org is null or exists (
    select 1 from public.orgs where id = org and is_demo
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select jsonb_build_object(
    'workspace_id', workspace_id,
    'workspace_name', workspace_name,
    'bot_id', bot_id,
    'auth_kind', auth_kind,
    'active', active,
    'installed_at', installed_at,
    'revoked_at', revoked_at,
    'attested_at', attested_at
  )
  into result
  from public.notion_installations
  where org_id = org;

  return result;
end
$$;
revoke all on function public.admin_notion_installation()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_notion_installation()
  to authenticated;

create function public.revoke_notion_installation()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org uuid;
  changed boolean;
begin
  org := public.admin_org_id();
  if org is null or exists (
    select 1 from public.orgs where id = org and is_demo
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  update public.notion_installations
  set active = false,
      encrypted_token = null,
      revoked_at = now()
  where org_id = org
  returning true into changed;

  if coalesce(changed, false) then
    update public.sources
    set active = false,
        last_error = 'notion_disconnected'
    where kind = 'notion_page'
      and dept_id in (
        select id from public.departments where org_id = org
      );
  end if;

  return coalesce(changed, false);
end
$$;
revoke all on function public.revoke_notion_installation()
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_notion_installation()
  to authenticated;
