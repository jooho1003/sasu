-- ADR-052: one workspace per organization, no cross-organization token fallback.
create table public.slack_installations (
  org_id uuid primary key references public.orgs(id),
  team_id text not null unique check(team_id ~ '^T[A-Z0-9]+$'),
  team_name text not null,
  bot_user_id text not null,
  encrypted_token text,
  scopes text[] not null,
  active boolean not null default true,
  installed_by uuid references auth.users(id) on delete set null,
  installed_at timestamptz not null default now(),
  revoked_at timestamptz,
  check(not active or encrypted_token is not null)
);
create table public.slack_oauth_states (
  state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
  org_id uuid not null references public.orgs(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now()+interval '10 minutes',
  consumed_at timestamptz,
  completed_at timestamptz
);
alter table public.slack_installations enable row level security;
alter table public.slack_oauth_states enable row level security;
revoke all on public.slack_installations,public.slack_oauth_states from public,anon,authenticated;
grant all on public.slack_installations,public.slack_oauth_states to service_role;

create function public.begin_slack_installation(p_hash text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  org:=public.admin_org_id();
  if org is null or exists(select 1 from orgs where id=org and is_demo) then raise exception using errcode='42501',message='forbidden'; end if;
  delete from slack_oauth_states where expires_at<now();
  delete from slack_oauth_states where user_id=auth.uid() and org_id=org and consumed_at is null;
  insert into slack_oauth_states(state_hash,org_id,user_id) values(p_hash,org,auth.uid());
  return org;
end $$;
create function public.consume_slack_installation_state(p_hash text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  update slack_oauth_states set consumed_at=now() where state_hash=p_hash and user_id=auth.uid() and org_id=public.admin_org_id()
    and consumed_at is null and expires_at>now() returning org_id into org;
  return org;
end $$;
revoke all on function public.begin_slack_installation(text),public.consume_slack_installation_state(text) from public,anon,authenticated,service_role;
grant execute on function public.begin_slack_installation(text),public.consume_slack_installation_state(text) to authenticated;

-- The OAuth collection adapter alone persists credentials after exchanging the
-- authorization code. A browser cannot claim an arbitrary workspace with a fake token.
create function public.complete_slack_installation(p_hash text,p_actor uuid,p_org uuid,p_team text,p_name text,p_bot text,p_encrypted text,p_scopes text[]) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from slack_oauth_states where state_hash=p_hash and user_id=p_actor and org_id=p_org
    and consumed_at is not null and completed_at is null and expires_at>now() for update;
  if not found or not exists(select 1 from org_admins where org_id=p_org and user_id=p_actor)
    or exists(select 1 from orgs where id=p_org and is_demo) then raise exception using errcode='42501',message='forbidden'; end if;
  if coalesce(p_encrypted,'') !~ '^v1\.' or p_team !~ '^T[A-Z0-9]+$' or p_bot !~ '^U[A-Z0-9]+$' then raise exception using errcode='22023',message='invalid_installation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team,33));
  perform 1 from orgs where id=p_org for update;
  perform 1 from slack_installations where org_id=p_org for update;
  if exists(select 1 from slack_installations where (org_id=p_org and team_id<>p_team) or (team_id=p_team and org_id<>p_org)) then
    raise exception using errcode='23505',message='workspace_already_bound'; end if;
  insert into slack_installations(org_id,team_id,team_name,bot_user_id,encrypted_token,scopes,installed_by)
    values(p_org,p_team,left(p_name,200),p_bot,p_encrypted,p_scopes,p_actor)
    on conflict(org_id) do update set team_name=excluded.team_name,bot_user_id=excluded.bot_user_id,encrypted_token=excluded.encrypted_token,
      scopes=excluded.scopes,active=true,installed_by=p_actor,installed_at=now(),revoked_at=null;
  update members set slack_team_id=p_team where dept_id in (select id from departments where org_id=p_org);
  update sources set slack_team_id=p_team where kind='slack_channel' and dept_id in (select id from departments where org_id=p_org);
  update slack_oauth_states set completed_at=now() where state_hash=p_hash;
  return true;
end $$;
revoke all on function public.complete_slack_installation(text,uuid,uuid,text,text,text,text,text[]) from public,anon,authenticated,service_role;
grant execute on function public.complete_slack_installation(text,uuid,uuid,text,text,text,text,text[]) to service_role;

alter table public.sources add column slack_team_id text;
alter table public.members add column slack_team_id text;
create unique index slack_active_channel on public.sources(slack_team_id,external_id) where kind='slack_channel' and active and slack_team_id is not null;
create function public.bind_slack_workspace() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  select i.team_id into new.slack_team_id from departments d join slack_installations i on i.org_id=d.org_id where d.id=new.dept_id;
  if tg_table_name='sources' then
    if new.kind<>'slack_channel' then new.slack_team_id:=null; end if;
  end if;
  return new;
end $$;
revoke all on function public.bind_slack_workspace() from public,anon,authenticated,service_role;
create trigger a_source_workspace before insert or update on public.sources for each row execute function public.bind_slack_workspace();
create trigger a_member_workspace before insert or update on public.members for each row execute function public.bind_slack_workspace();
create or replace function public.enforce_slack_identity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.slack_user_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.slack_team_id,'legacy')||':'||new.slack_user_id,30));
  if exists(select 1 from members where slack_user_id=new.slack_user_id and slack_team_id is not distinct from new.slack_team_id and user_id<>new.user_id) then
    raise exception using errcode='23505',message='slack_identity_conflict'; end if;
  return new;
end $$;
drop trigger members_slack_identity on public.members;
create trigger members_slack_identity before insert or update of slack_user_id,user_id,slack_team_id on public.members for each row execute function public.enforce_slack_identity();

create function public.slack_installation_for_department(p_dept uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('org_id',i.org_id,'team_id',i.team_id,'encrypted_token',i.encrypted_token)
  from slack_installations i join departments d on d.org_id=i.org_id join orgs o on o.id=i.org_id
  where d.id=p_dept and i.active and not o.is_demo and (auth.role()='service_role' or can_see(auth.uid(),d.id,'leads_only'));
$$;
create function public.slack_installation_for_team(p_team text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('org_id',i.org_id,'team_id',i.team_id,'encrypted_token',i.encrypted_token)
  from slack_installations i join orgs o on o.id=i.org_id where i.team_id=p_team and i.active and not o.is_demo;
$$;
create function public.slack_installation_for_job(p_job uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare j jobs%rowtype; dept uuid;
begin
  select * into j from jobs where id=p_job;
  if j.kind='send_slack' then select dept_id into dept from decision_requests where id=(j.payload->>'requestId')::uuid;
  elsif j.kind='slack_backfill' then select dept_id into dept from sources where id=(j.payload->>'sourceId')::uuid;
  elsif j.kind in ('answer','deliver_slack_answer') then select dept_id into dept from answers where id=(j.payload->>'answerId')::uuid;
  elsif j.kind='send_reminder' then select r.dept_id into dept from card_reminders m join decision_requests r on r.id=m.request_id where m.id=(j.payload->>'reminderId')::uuid;
  end if;
  return slack_installation_for_department(dept);
end $$;
revoke all on function public.slack_installation_for_department(uuid),public.slack_installation_for_team(text),public.slack_installation_for_job(uuid) from public,anon,authenticated,service_role;
grant execute on function public.slack_installation_for_department(uuid) to authenticated,service_role;
grant execute on function public.slack_installation_for_team(text),public.slack_installation_for_job(uuid) to service_role;

create function public.admin_slack_installation() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; org uuid;
begin
  org:=public.admin_org_id();
  if org is null then raise exception using errcode='42501',message='forbidden'; end if;
  select jsonb_build_object('team_id',team_id,'team_name',team_name,'active',active,'installed_at',installed_at) into result from slack_installations where org_id=org;
  return result;
end $$;
revoke all on function public.admin_slack_installation() from public,anon,authenticated,service_role;
grant execute on function public.admin_slack_installation() to authenticated;

create function public.revoke_slack_installation(p_team text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  update slack_installations set active=false,encrypted_token=null,revoked_at=now() where team_id=p_team and active returning org_id into org;
  if org is null then return false; end if;
  update sources set active=false,last_error='slack_uninstalled' where kind='slack_channel' and dept_id in (select id from departments where org_id=org);
  update slack_answer_deliveries set state='cancelled',lease_token=null,lease_until=null,last_error='access_changed' where answer_id in (select a.id from answers a join departments d on d.id=a.dept_id where d.org_id=org);
  return true;
end $$;
revoke all on function public.revoke_slack_installation(text) from public,anon,authenticated,service_role;
grant execute on function public.revoke_slack_installation(text) to service_role;

create function public.slack_question_context_for_team(p_team text,p_author text,p_channel text,p_dm boolean) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'consented',m.consented_at is not null) order by d.name,d.id),'[]'::jsonb)
  from members m join departments d on d.id=m.dept_id join orgs o on o.id=d.org_id join slack_installations i on i.org_id=o.id
  where m.slack_user_id=p_author and m.slack_team_id=p_team and i.team_id=p_team and i.active and not o.is_demo
    and ((p_dm and p_channel ~ '^D[A-Z0-9]+$') or (not p_dm and p_channel ~ '^[CG][A-Z0-9]+$' and exists(
      select 1 from sources s where s.dept_id=d.id and s.kind='slack_channel' and s.slack_team_id=p_team and s.external_id=p_channel and s.active)));
$$;
create function public.ingest_slack_question_for_team(p_team text,p_event text,p_author text,p_channel text,p_thread text,p_dept uuid,p_content text,p_dm boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from slack_installations i join departments d on d.org_id=i.org_id where i.team_id=p_team and i.active and d.id=p_dept for share of i;
  if not found then return jsonb_build_object('status','not_connected'); end if;
  return ingest_slack_question(p_team||':'||p_event,p_author,p_channel,p_thread,p_dept,p_content,p_dm);
end $$;
revoke all on function public.slack_question_context_for_team(text,text,text,boolean),public.ingest_slack_question_for_team(text,text,text,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.slack_question_context_for_team(text,text,text,boolean),public.ingest_slack_question_for_team(text,text,text,text,text,uuid,text,boolean) to service_role;

create function public.consent_via_slack_for_team(p_team text,p_slack_user text,p_dept uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from slack_installations i join departments d on d.org_id=i.org_id where i.team_id=p_team and i.active and d.id=p_dept for share of i;
  if not found then return false; end if;
  return consent_via_slack(p_slack_user,p_dept);
end $$;
revoke all on function public.consent_via_slack_for_team(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.consent_via_slack_for_team(text,text,uuid) to service_role;
