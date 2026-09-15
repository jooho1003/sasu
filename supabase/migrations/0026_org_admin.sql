-- Organization administration: metadata-only read surface.
-- Design Ref: 관리자 콘솔 설계 §B-3·§B-5·§B-6, ADR-044.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.org_admins (
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.departments
  add constraint departments_id_org_unique unique (id, org_id);
create unique index departments_org_lower_name_unique
  on public.departments (org_id, lower(name));

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  dept_id uuid not null,
  invited_by_role text not null check (invited_by_role in ('org_admin', 'lead')),
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  role text not null check (role in ('lead', 'member')),
  token_hash text not null unique,
  used_token_hash text unique,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  constraint member_invites_dept_org_fk
    foreign key (dept_id, org_id) references public.departments(id, org_id)
);

create unique index member_invites_one_pending
  on public.member_invites (dept_id, email_normalized)
  where accepted_at is null and revoked_at is null;

create table public.admin_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'department_create', 'first_lead_invite', 'member_invite',
    'invite_revoke', 'invite_accept', 'lead_promote', 'lead_demote',
    'member_remove', 'trailer_publishing_toggle', 'trailer_unpublish'
  )),
  target jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.org_admins enable row level security;
alter table public.member_invites enable row level security;
alter table public.admin_events enable row level security;

revoke all on table public.org_admins, public.member_invites, public.admin_events
  from public, anon, authenticated;
grant all on table public.org_admins, public.member_invites, public.admin_events
  to service_role;
revoke update, delete on table public.admin_events
  from public, anon, authenticated, service_role;

create or replace function private.is_org_admin(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.org_admins oa
    where oa.user_id = p_user and oa.org_id = p_org
  )
$$;
revoke all on function private.is_org_admin(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.admin_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select oa.org_id
  from public.org_admins oa
  where private.is_org_admin(auth.uid(), oa.org_id)
  order by oa.granted_at, oa.org_id
  limit 1
$$;
revoke all on function public.admin_org_id()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_org_id() to authenticated;

create or replace function private._admin_overview(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'org_name', o.name,
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dept_id', d.id,
        'name', d.name,
        'lead_names', coalesce((select jsonb_agg(m.display_name order by m.display_name)
          from public.members m where m.dept_id = d.id and m.role = 'lead'), '[]'::jsonb),
        'member_count', (select count(*) from public.members m where m.dept_id = d.id),
        'consented_count', (select count(*) from public.members m where m.dept_id = d.id and m.consented_at is not null),
        'active_source_count', (select count(*) from public.sources s where s.dept_id = d.id and s.active is true),
        'decisions_30d', (select count(*) from public.decisions x where x.dept_id = d.id and x.decided_at >= now() - interval '30 days'),
        'answers_30d', (select count(*) from public.answers a where a.dept_id = d.id and a.created_at >= now() - interval '30 days')
      ) order by d.name, d.id)
      from public.departments d where d.org_id = p_org
    ), '[]'::jsonb),
    'llm_calls_this_month', (
      select count(*) from public.llm_calls lc
      join public.departments d on d.id = lc.dept_id
      where d.org_id = p_org
        and lc.created_at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    )
  )
  from public.orgs o where o.id = p_org
$$;
revoke all on function private._admin_overview(uuid)
  from public, anon, authenticated, service_role;

create or replace function private._admin_members(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'display_name', m.display_name,
    'email', lower(u.email),
    'dept_id', d.id,
    'dept_name', d.name,
    'role', m.role,
    'consented_at', m.consented_at,
    'consent_version', m.consent_version,
    'slack_linked', m.slack_user_id is not null
  ) order by d.name, m.display_name, m.user_id), '[]'::jsonb)
  from public.departments d
  join public.members m on m.dept_id = d.id
  join auth.users u on u.id = m.user_id
  where d.org_id = p_org
$$;
revoke all on function private._admin_members(uuid)
  from public, anon, authenticated, service_role;

create or replace function private._admin_sources(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_id', s.id,
    'dept_id', d.id,
    'dept_name', d.name,
    'kind', s.kind,
    'title', s.title,
    'visibility', s.visibility,
    'is_principles', s.is_principles,
    'active', s.active,
    'item_count', (select count(*) from public.items i where i.source_id = s.id and i.deleted_at is null),
    'last_synced_at', s.last_synced_at,
    'has_error', s.last_error is not null
  ) order by d.name, s.created_at, s.id), '[]'::jsonb)
  from public.departments d
  join public.sources s on s.dept_id = d.id
  where d.org_id = p_org
$$;
revoke all on function private._admin_sources(uuid)
  from public, anon, authenticated, service_role;

create or replace function private._admin_answer_stats(p_org uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 30 then
    raise exception 'invalid_range' using errcode = '22023';
  end if;

  with answer_rows as (
    select a.id, a.dept_id, (a.created_at at time zone 'Asia/Seoul')::date as day, a.status
    from public.answers a
    join public.departments d on d.id = a.dept_id
    where d.org_id = p_org
      and (a.created_at at time zone 'Asia/Seoul')::date between p_from and p_to
  ), citation_counts as (
    select ar.id,
      count(*) filter (where s.visibility = 'dept') as cited_dept,
      count(*) filter (where s.visibility = 'leads_only') as cited_leads_only,
      count(*) filter (where c.decision_id is not null) as cited_decisions
    from answer_rows ar
    left join public.citations c on c.owner_kind = 'answer' and c.owner_id = ar.id
    left join public.items i on i.id = c.item_id
    left join public.sources s on s.id = i.source_id
    group by ar.id
  ), daily as (
    select ar.day, ar.dept_id,
      count(*) filter (where ar.status = 'done') as answered,
      count(*) filter (where ar.status = 'refused') as refused,
      count(*) filter (where ar.status = 'failed') as failed,
      sum(cc.cited_dept) as cited_dept,
      sum(cc.cited_leads_only) as cited_leads_only,
      sum(cc.cited_decisions) as cited_decisions
    from answer_rows ar join citation_counts cc on cc.id = ar.id
    group by ar.day, ar.dept_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', x.day,
    'dept_id', x.dept_id,
    'dept_name', d.name,
    'answered', x.answered,
    'refused', x.refused,
    'failed', x.failed,
    'cited_dept', x.cited_dept,
    'cited_leads_only', x.cited_leads_only,
    'cited_decisions', x.cited_decisions
  ) order by x.day desc, d.name, x.dept_id), '[]'::jsonb)
  into result
  from daily x join public.departments d on d.id = x.dept_id;
  return result;
end
$$;
revoke all on function private._admin_answer_stats(uuid, date, date)
  from public, anon, authenticated, service_role;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid := public.admin_org_id(); begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private._admin_overview(v_org);
end $$;
revoke all on function public.admin_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_members()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid := public.admin_org_id(); begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private._admin_members(v_org);
end $$;
revoke all on function public.admin_members() from public, anon, authenticated, service_role;
grant execute on function public.admin_members() to authenticated;

create or replace function public.admin_sources()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid := public.admin_org_id(); begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private._admin_sources(v_org);
end $$;
revoke all on function public.admin_sources() from public, anon, authenticated, service_role;
grant execute on function public.admin_sources() to authenticated;

create or replace function public.admin_answer_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid := public.admin_org_id(); begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private._admin_answer_stats(v_org, p_from, p_to);
end $$;
revoke all on function public.admin_answer_stats(date, date) from public, anon, authenticated, service_role;
grant execute on function public.admin_answer_stats(date, date) to authenticated;

create or replace function public.admin_invites()
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_org uuid := public.admin_org_id(); result jsonb;
begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'invite_id', mi.id, 'dept_id', mi.dept_id, 'dept_name', d.name,
    'email', mi.email_normalized, 'role', mi.role,
    'invited_by_role', mi.invited_by_role, 'expires_at', mi.expires_at,
    'created_at', mi.created_at
  ) order by mi.created_at desc, mi.id), '[]'::jsonb)
  into result
  from public.member_invites mi join public.departments d on d.id = mi.dept_id
  where mi.org_id = v_org and mi.accepted_at is null and mi.revoked_at is null;
  return result;
end $$;
revoke all on function public.admin_invites() from public, anon, authenticated, service_role;
grant execute on function public.admin_invites() to authenticated;

create or replace function public.admin_events_list(p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_org uuid := public.admin_org_id(); result jsonb;
begin
  if v_org is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_limit' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.event_id desc), '[]'::jsonb)
  into result from (
    select ae.id as event_id, ae.created_at,
      coalesce(actor.email, '(삭제된 사용자)') as actor_label,
      ae.action,
      coalesce(d.name, '(삭제된 부서)') as dept_name,
      coalesce(target_user.email, '(삭제된 사용자)') as target_user_label
    from public.admin_events ae
    left join auth.users actor on actor.id = ae.actor_id
    left join public.departments d on d.id = nullif(ae.target->>'dept_id', '')::uuid
    left join auth.users target_user on target_user.id = nullif(ae.target->>'user_id', '')::uuid
    where ae.org_id = v_org
    order by ae.created_at desc, ae.id desc
    limit p_limit
  ) x;
  return result;
end $$;
revoke all on function public.admin_events_list(int) from public, anon, authenticated, service_role;
grant execute on function public.admin_events_list(int) to authenticated;

create or replace function public.demo_admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid; begin
  select id into v_org from public.orgs where is_demo is true order by created_at, id limit 1;
  return case when v_org is null then null else private._admin_overview(v_org) end;
end $$;
revoke all on function public.demo_admin_overview() from public, anon, authenticated, service_role;
grant execute on function public.demo_admin_overview() to anon;

create or replace function public.demo_admin_members()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid; result jsonb; begin
  select id into v_org from public.orgs where is_demo is true order by created_at, id limit 1;
  if v_org is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(value - 'email' - 'user_id'), '[]'::jsonb)
    into result from jsonb_array_elements(private._admin_members(v_org));
  return result;
end $$;
revoke all on function public.demo_admin_members() from public, anon, authenticated, service_role;
grant execute on function public.demo_admin_members() to anon;

create or replace function public.demo_admin_sources()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid; begin
  select id into v_org from public.orgs where is_demo is true order by created_at, id limit 1;
  return case when v_org is null then '[]'::jsonb else private._admin_sources(v_org) end;
end $$;
revoke all on function public.demo_admin_sources() from public, anon, authenticated, service_role;
grant execute on function public.demo_admin_sources() to anon;

create or replace function public.demo_admin_answer_stats(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_org uuid; begin
  select id into v_org from public.orgs where is_demo is true order by created_at, id limit 1;
  return case when v_org is null then '[]'::jsonb else private._admin_answer_stats(v_org, p_from, p_to) end;
end $$;
revoke all on function public.demo_admin_answer_stats(date, date) from public, anon, authenticated, service_role;
grant execute on function public.demo_admin_answer_stats(date, date) to anon;

-- Write commands. Every command derives the organization from the caller or
-- verifies the target department with can_see(); no request can choose an org.
create or replace function public.admin_create_department(p_name text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org uuid := public.admin_org_id(); v_name text := btrim(p_name); v_id uuid;
begin
  if v_org is null then raise exception 'forbidden' using errcode='42501'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_department_name' using errcode='22023';
  end if;
  if exists(select 1 from public.departments where org_id=v_org and lower(name)=lower(v_name)) then
    raise exception 'department_name_taken' using errcode='P0001';
  end if;
  insert into public.departments(org_id,name) values(v_org,v_name) returning id into v_id;
  insert into public.admin_events(org_id,actor_id,action,target)
    values(v_org,auth.uid(),'department_create',jsonb_build_object('dept_id',v_id));
  return v_id;
exception when unique_violation then
  raise exception 'department_name_taken' using errcode='P0001';
end $$;
revoke all on function public.admin_create_department(text) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_department(text) to authenticated;

create or replace function public.admin_invite_first_lead(p_dept uuid, p_email text)
returns table(invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.admin_org_id(); v_email text := lower(btrim(p_email));
  v_token text; v_id uuid; v_expires timestamptz := now()+interval '7 days'; v_demo boolean;
begin
  if v_org is null then raise exception 'forbidden' using errcode='42501'; end if;
  select o.is_demo into v_demo from public.departments d join public.orgs o on o.id=d.org_id
    where d.id=p_dept and d.org_id=v_org for update of d;
  if not found or v_demo then raise exception 'forbidden' using errcode='42501'; end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode='22023';
  end if;
  if v_email=lower(coalesce(auth.jwt()->>'email','')) then
    raise exception 'self_invite_forbidden' using errcode='42501';
  end if;
  if exists(select 1 from public.members where dept_id=p_dept) then
    raise exception 'department_not_empty' using errcode='P0001';
  end if;
  if (select count(*) from public.member_invites where org_id=v_org and accepted_at is null and revoked_at is null) >= 100 then
    raise exception 'invite_limit' using errcode='P0001';
  end if;
  -- R10(9/15): an admin may hold only one live first-lead invite per department.
  -- Otherwise a spare invite (e.g. to the admin's secondary address) could be accepted
  -- after the department has members and content (ADR-044 2, invariant 18).
  if exists(select 1 from public.member_invites mi where mi.dept_id=p_dept and mi.invited_by_role='org_admin' and mi.accepted_at is null and mi.revoked_at is null and mi.expires_at>now()) then
    raise exception 'invite_pending' using errcode='P0001';
  end if;
  if exists(select 1 from public.member_invites where dept_id=p_dept and email_normalized=v_email and accepted_at is null and revoked_at is null) then
    raise exception 'invite_pending' using errcode='P0001';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.member_invites(org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at,created_by)
    values(v_org,p_dept,'org_admin',v_email,'lead',encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_expires,auth.uid())
    returning id into v_id;
  insert into public.admin_events(org_id,actor_id,action,target)
    values(v_org,auth.uid(),'first_lead_invite',jsonb_build_object('dept_id',p_dept,'invite_id',v_id));
  return query select v_id,v_token,v_expires;
exception when unique_violation then raise exception 'invite_pending' using errcode='P0001';
end $$;
revoke all on function public.admin_invite_first_lead(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_invite_first_lead(uuid,text) to authenticated;

create or replace function public.lead_invite_member(p_dept uuid, p_email text)
returns table(invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_org uuid; v_email text:=lower(btrim(p_email)); v_token text; v_id uuid;
  v_expires timestamptz:=now()+interval '7 days'; v_demo boolean;
begin
  if not public.can_see(auth.uid(),p_dept,'leads_only') then raise exception 'forbidden' using errcode='42501'; end if;
  select d.org_id,o.is_demo into v_org,v_demo from public.departments d join public.orgs o on o.id=d.org_id where d.id=p_dept for update of d;
  if not found or v_demo then raise exception 'forbidden' using errcode='42501'; end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_email' using errcode='22023'; end if;
  if exists(select 1 from public.members m join auth.users u on u.id=m.user_id where m.dept_id=p_dept and lower(u.email)=v_email) then
    raise exception 'already_member' using errcode='P0001';
  end if;
  if (select count(*) from public.member_invites where org_id=v_org and accepted_at is null and revoked_at is null)>=100 then raise exception 'invite_limit' using errcode='P0001'; end if;
  if exists(select 1 from public.member_invites where dept_id=p_dept and email_normalized=v_email and accepted_at is null and revoked_at is null) then raise exception 'invite_pending' using errcode='P0001'; end if;
  v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.member_invites(org_id,dept_id,invited_by_role,email_normalized,role,token_hash,expires_at,created_by)
    values(v_org,p_dept,'lead',v_email,'member',encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_expires,auth.uid()) returning id into v_id;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'member_invite',jsonb_build_object('dept_id',p_dept,'invite_id',v_id));
  return query select v_id,v_token,v_expires;
exception when unique_violation then raise exception 'invite_pending' using errcode='P0001';
end $$;
revoke all on function public.lead_invite_member(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.lead_invite_member(uuid,text) to authenticated;

create or replace function public.lead_invites(p_dept uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare result jsonb; begin
  if not public.can_see(auth.uid(),p_dept,'leads_only') then raise exception 'forbidden' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('invite_id',mi.id,'email',mi.email_normalized,'role',mi.role,'expires_at',mi.expires_at,'created_at',mi.created_at,'created_by_label',coalesce(u.email,'(삭제된 사용자)')) order by mi.created_at desc),'[]'::jsonb)
    into result from public.member_invites mi left join auth.users u on u.id=mi.created_by
    where mi.dept_id=p_dept and mi.accepted_at is null and mi.revoked_at is null;
  return result;
end $$;
revoke all on function public.lead_invites(uuid) from public, anon, authenticated, service_role;
grant execute on function public.lead_invites(uuid) to authenticated;

create or replace function public.lead_promote_member(p_user uuid,p_dept uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_org uuid; v_role text; v_demo boolean; begin
  if not public.can_see(auth.uid(),p_dept,'leads_only') then raise exception 'forbidden' using errcode='42501'; end if;
  select d.org_id,o.is_demo into v_org,v_demo from public.departments d join public.orgs o on o.id=d.org_id where d.id=p_dept;
  if not found or v_demo then raise exception 'forbidden' using errcode='42501'; end if;
  select role into v_role from public.members where user_id=p_user and dept_id=p_dept for update;
  if not found then raise exception 'not_member' using errcode='P0001'; end if;
  if v_role='lead' then raise exception 'already_lead' using errcode='P0001'; end if;
  update public.members set role='lead' where user_id=p_user and dept_id=p_dept;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'lead_promote',jsonb_build_object('dept_id',p_dept,'user_id',p_user));
end $$;
revoke all on function public.lead_promote_member(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.lead_promote_member(uuid,uuid) to authenticated;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_inv public.member_invites%rowtype; v_admin boolean; begin
  select * into v_inv from public.member_invites where id=p_invite for update;
  if not found then raise exception 'invite_not_pending' using errcode='P0001'; end if;
  v_admin:=private.is_org_admin(auth.uid(),v_inv.org_id);
  if not v_admin and not (v_inv.invited_by_role='lead' and public.can_see(auth.uid(),v_inv.dept_id,'leads_only')) then raise exception 'forbidden' using errcode='42501'; end if;
  if v_inv.accepted_at is not null or v_inv.revoked_at is not null then raise exception 'invite_not_pending' using errcode='P0001'; end if;
  update public.member_invites set revoked_at=now(),used_token_hash=token_hash,token_hash='void:'||id::text where id=p_invite;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_inv.org_id,auth.uid(),'invite_revoke',jsonb_build_object('dept_id',v_inv.dept_id,'invite_id',v_inv.id));
end $$;
revoke all on function public.revoke_invite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_invite(uuid) to authenticated;

create or replace function public.demote_lead(p_user uuid,p_dept uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_org uuid; v_role text; begin
  select org_id into v_org from public.departments where id=p_dept;
  if not found or not (private.is_org_admin(auth.uid(),v_org) or public.can_see(auth.uid(),p_dept,'leads_only')) then raise exception 'forbidden' using errcode='42501'; end if;
  perform user_id from public.members where dept_id=p_dept for update;
  select role into v_role from public.members where user_id=p_user and dept_id=p_dept;
  if not found or v_role<>'lead' then raise exception 'not_lead' using errcode='P0001'; end if;
  if (select count(*) from public.members where dept_id=p_dept and role='lead')<=1 then raise exception 'last_lead' using errcode='P0001'; end if;
  update public.members set role='member' where user_id=p_user and dept_id=p_dept;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'lead_demote',jsonb_build_object('dept_id',p_dept,'user_id',p_user));
end $$;
revoke all on function public.demote_lead(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.demote_lead(uuid,uuid) to authenticated;

create or replace function public.remove_member(p_user uuid,p_dept uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_org uuid; v_role text; begin
  select org_id into v_org from public.departments where id=p_dept;
  if not found or not (private.is_org_admin(auth.uid(),v_org) or public.can_see(auth.uid(),p_dept,'leads_only')) then raise exception 'forbidden' using errcode='42501'; end if;
  perform user_id from public.members where dept_id=p_dept for update;
  select role into v_role from public.members where user_id=p_user and dept_id=p_dept;
  if not found then raise exception 'not_member' using errcode='P0001'; end if;
  if v_role='lead' and (select count(*) from public.members where dept_id=p_dept and role='lead')<=1 then raise exception 'last_lead' using errcode='P0001'; end if;
  delete from public.members where user_id=p_user and dept_id=p_dept;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'member_remove',jsonb_build_object('dept_id',p_dept,'user_id',p_user));
end $$;
revoke all on function public.remove_member(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_member(uuid,uuid) to authenticated;

create or replace function public.invite_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$ declare v_hash text; v_inv public.member_invites%rowtype; v_status text; v_email text; result jsonb; begin
  if p_token is null or char_length(p_token)<>64 then return null; end if;
  v_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select * into v_inv from public.member_invites where token_hash=v_hash or used_token_hash=v_hash order by created_at desc limit 1;
  if not found then return null; end if;
  v_status:=case when v_inv.accepted_at is not null then 'accepted' when v_inv.revoked_at is not null then 'revoked' when v_inv.expires_at<=now() then 'expired' else 'valid' end;
  v_email:=left(split_part(v_inv.email_normalized,'@',1),2)||'***@'||split_part(v_inv.email_normalized,'@',2);
  select jsonb_build_object('org_name',o.name,'dept_name',d.name,'role',v_inv.role,'email_masked',v_email,'status',v_status) into result
    from public.orgs o join public.departments d on d.org_id=o.id where o.id=v_inv.org_id and d.id=v_inv.dept_id;
  return result;
end $$;
revoke all on function public.invite_preview(text) from public, anon, authenticated, service_role;
grant execute on function public.invite_preview(text) to anon, authenticated;

create or replace function public.accept_invite(p_token text,p_display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$ declare v_uid uuid:=auth.uid(); v_hash text; v_inv public.member_invites%rowtype; v_name text:=btrim(p_display_name); begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if p_token is null or char_length(p_token)<>64 then raise exception 'invite_not_found' using errcode='22023'; end if;
  v_hash:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select * into v_inv from public.member_invites where token_hash=v_hash for update;
  if not found then
    select * into v_inv from public.member_invites where used_token_hash=v_hash for update;
    if not found then raise exception 'invite_not_found' using errcode='22023'; end if;
    if v_inv.revoked_at is not null then raise exception 'invite_revoked' using errcode='P0001'; end if;
    if v_inv.accepted_at is not null and v_inv.accepted_by=v_uid and exists(select 1 from public.members where user_id=v_uid and dept_id=v_inv.dept_id) then return v_inv.dept_id; end if;
    raise exception 'invite_used' using errcode='P0001';
  end if;
  if v_inv.revoked_at is not null then raise exception 'invite_revoked' using errcode='P0001'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used' using errcode='P0001'; end if;
  if v_inv.expires_at<=now() then raise exception 'invite_expired' using errcode='P0001'; end if;
  if lower(coalesce(auth.jwt()->>'email',''))<>v_inv.email_normalized then raise exception 'invite_email_mismatch' using errcode='42501'; end if;
  if v_name is null or char_length(v_name)<1 or char_length(v_name)>40 then raise exception 'invalid_display_name' using errcode='22023'; end if;
  -- R10(9/15): an admin-issued first-lead invite is only valid while the department is still empty.
  if v_inv.invited_by_role='org_admin' then
    perform 1 from public.departments where id=v_inv.dept_id for update;
    if exists(select 1 from public.members where dept_id=v_inv.dept_id and user_id<>v_uid) then
      raise exception 'department_not_empty' using errcode='P0001';
    end if;
  end if;
  if not exists(select 1 from public.members where user_id=v_uid and dept_id=v_inv.dept_id) then
    insert into public.members(user_id,dept_id,role,display_name,consented_at,consent_version) values(v_uid,v_inv.dept_id,v_inv.role,v_name,null,null);
  end if;
  update public.member_invites set accepted_at=now(),accepted_by=v_uid,used_token_hash=token_hash,token_hash='void:'||id::text where id=v_inv.id;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_inv.org_id,v_uid,'invite_accept',jsonb_build_object('dept_id',v_inv.dept_id,'invite_id',v_inv.id,'user_id',v_uid));
  return v_inv.dept_id;
end $$;
revoke all on function public.accept_invite(text,text) from public, anon, authenticated, service_role;
grant execute on function public.accept_invite(text,text) to authenticated;
