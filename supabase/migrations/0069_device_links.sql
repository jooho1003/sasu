-- Design Ref: desktop-companion §3 / ADR-082 — JWT sessions share existing RLS.
create table public.device_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  dept_id uuid not null references public.departments on delete cascade,
  auth_session_id uuid not null,
  device_name text not null check (char_length(device_name) between 1 and 60),
  app_version text not null check (char_length(app_version) between 1 and 20),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason in ('user','membership','relink','signout')),
  check ((revoked_at is null) = (revoked_reason is null))
);
create unique index device_links_one_active_session on public.device_links(auth_session_id) where revoked_at is null;
create index device_links_user_active on public.device_links(user_id) where revoked_at is null;
alter table public.device_links enable row level security;
create policy device_links_own_read on public.device_links for select to authenticated using (user_id = auth.uid());
revoke all on public.device_links from public, anon, authenticated;
grant select on public.device_links to authenticated;
grant all on public.device_links to service_role;

create function private.current_session_id() returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select nullif(auth.jwt()->>'session_id', '')::uuid $$;
revoke all on function private.current_session_id() from public, anon, authenticated, service_role;

create function public.link_device(p_dept uuid, p_device_name text, p_app_version text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := private.current_session_id();
  v_link uuid;
begin
  if v_session is null then
    raise exception using errcode = '22023', message = 'device_session_required';
  end if;
  if v_user is null or v_user = '99999999-9999-4999-8999-999999999991'::uuid then
    raise exception using errcode = '42501', message = 'device_link_forbidden';
  end if;
  -- Serialize the per-user limit, including concurrent links from different sessions.
  -- A transaction-scoped advisory lock avoids locking auth.users (Supabase-owned, used by Auth).
  perform pg_advisory_xact_lock(hashtextextended('device_link:' || v_user::text, 0));
  if not exists (
    select 1 from auth.sessions where id = v_session and user_id = v_user
  ) then
    raise exception using errcode = '42501', message = 'device_link_forbidden';
  end if;
  perform 1 from public.members m
    join public.departments d on d.id = m.dept_id
    join public.orgs o on o.id = d.org_id
    where m.user_id = v_user and m.dept_id = p_dept
      and m.consented_at is not null and not o.is_demo
    for share of m;
  if not found then
    raise exception using errcode = '42501', message = 'device_link_forbidden';
  end if;
  if p_device_name is null or char_length(btrim(p_device_name)) not between 1 and 60
    or p_app_version is null or char_length(btrim(p_app_version)) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'device_link_invalid';
  end if;
  if (select count(*) from public.device_links
      where user_id = v_user and revoked_at is null and auth_session_id <> v_session) >= 5 then
    raise exception using errcode = 'P0001', message = 'device_link_limit';
  end if;
  update public.device_links set revoked_at = now(), revoked_reason = 'relink'
    where user_id = v_user and auth_session_id = v_session and revoked_at is null;
  insert into public.device_links(user_id, dept_id, auth_session_id, device_name, app_version)
    values(v_user, p_dept, v_session, btrim(p_device_name), btrim(p_app_version)) returning id into v_link;
  return v_link;
end;
$$;
revoke all on function public.link_device(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.link_device(uuid,text,text) to authenticated;

create function public.companion_context()
returns table(link_id uuid, dept_id uuid, dept_name text, role text, display_name text, consented_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := private.current_session_id();
  v_link public.device_links%rowtype;
begin
  if v_user is null or v_session is null then return; end if;
  select l.* into v_link from public.device_links l
    where l.user_id = v_user and l.auth_session_id = v_session and l.revoked_at is null
    for update;
  if not found then return; end if;
  if not exists(select 1 from public.members m where m.user_id = v_user and m.dept_id = v_link.dept_id) then
    update public.device_links set revoked_at = now(), revoked_reason = 'membership' where id = v_link.id;
    return;
  end if;
  if v_link.last_seen_at < now() - interval '5 minutes' then
    update public.device_links set last_seen_at = now() where id = v_link.id;
  end if;
  return query select v_link.id, d.id, d.name, m.role::text, m.display_name, m.consented_at
    from public.members m join public.departments d on d.id = m.dept_id
    where m.user_id = v_user and m.dept_id = v_link.dept_id;
end;
$$;
revoke all on function public.companion_context() from public, anon, authenticated, service_role;
grant execute on function public.companion_context() to authenticated;

create function public.revoke_device_link(p_link uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := private.current_session_id();
  v_target uuid;
begin
  update public.device_links l
    set revoked_at = now(), revoked_reason = case when l.auth_session_id = v_session then 'signout' else 'user' end
    where l.id = p_link and l.user_id = v_user and l.revoked_at is null
    returning l.auth_session_id into v_target;
  if not found then return false; end if;
  delete from auth.sessions where id = v_target and user_id = v_user;
  return true;
end;
$$;
revoke all on function public.revoke_device_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_device_link(uuid) to authenticated;
