-- ADR-038: 부서 역할은 lead가 정의하고, 문서별 기준표 결과는 워커만 완성한다.
create table public.agent_roles (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid references public.departments not null,
  name text not null
    check (char_length(name) between 1 and 60),
  instruction text not null
    check (char_length(instruction) between 1 and 2000),
  criteria jsonb not null
    check (
      jsonb_typeof(criteria) = 'array'
      and jsonb_array_length(criteria) between 1 and 10
    ),
  visibility text not null default 'leads_only'
    check (visibility in ('dept', 'leads_only')),
  created_by uuid references auth.users not null,
  archived_at timestamptz,
  created_at timestamptz default now()
);

create index agent_roles_active_dept_idx
  on public.agent_roles (dept_id)
  where archived_at is null;

create table public.agent_role_results (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references public.agent_roles not null,
  source_id uuid references public.sources on delete cascade not null,
  dept_id uuid references public.departments not null,
  visibility text not null
    check (visibility in ('dept', 'leads_only')),
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  status_reason text,
  result jsonb,
  weighted_score numeric
    check (weighted_score is null or weighted_score between 0 and 5),
  requested_by uuid references auth.users not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint agent_role_results_role_source_key unique (role_id, source_id)
);

create index agent_role_results_score_idx
  on public.agent_role_results (role_id, weighted_score desc nulls last);

alter table public.agent_roles enable row level security;
alter table public.agent_role_results enable row level security;

create policy agent_roles_visible_select
on public.agent_roles
for select
to authenticated
using (public.can_see(auth.uid(), dept_id, visibility));

create policy agent_roles_lead_insert
on public.agent_roles
for insert
to authenticated
with check (
  public.can_see(auth.uid(), dept_id, 'leads_only')
  and created_by = auth.uid()
  and archived_at is null
  and not public.is_demo_department(dept_id)
);

create policy agent_roles_lead_update
on public.agent_roles
for update
to authenticated
using (
  public.can_see(auth.uid(), dept_id, 'leads_only')
  and not public.is_demo_department(dept_id)
)
with check (
  public.can_see(auth.uid(), dept_id, 'leads_only')
  and not public.is_demo_department(dept_id)
);

create or replace function public.guard_agent_role_archive_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (to_jsonb(new) - 'archived_at') is distinct from
     (to_jsonb(old) - 'archived_at') then
    raise exception using errcode = '42501', message = 'agent_role_update_forbidden';
  end if;

  if old.archived_at is not null
     and new.archived_at is distinct from old.archived_at then
    raise exception using errcode = '42501', message = 'agent_role_update_forbidden';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_agent_role_archive_only()
  from public, anon, authenticated;

create trigger agent_roles_archive_only
before update on public.agent_roles
for each row execute function public.guard_agent_role_archive_only();

create policy agent_role_results_visible_select
on public.agent_role_results
for select
to authenticated
using (
  public.can_see(auth.uid(), dept_id, visibility)
  and exists (
    select 1
    from public.sources as source
    where source.id = agent_role_results.source_id
      and source.dept_id = agent_role_results.dept_id
      and public.can_see(auth.uid(), source.dept_id, source.visibility)
  )
);

-- authenticated는 역할만 생성·보관할 수 있고 AI 결과를 직접 위조할 수 없다.
revoke all on table public.agent_roles, public.agent_role_results from anon;
revoke insert, update, delete on table public.agent_role_results from authenticated;
grant select, insert, update on table public.agent_roles to authenticated;
grant select on table public.agent_role_results to authenticated;
grant all on table public.agent_roles, public.agent_role_results to service_role;

create or replace function public.request_agent_role_run(
  p_role uuid,
  p_sources uuid[]
)
returns table (
  result_id uuid,
  source_id uuid,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role public.agent_roles%rowtype;
  v_source public.sources%rowtype;
  v_source_count integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_today_count integer;
  v_kst_day_start timestamptz;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select role.*
  into v_role
  from public.agent_roles as role
  where role.id = p_role
  for share;

  if not found
     or v_role.archived_at is not null
     or not public.can_see(v_user, v_role.dept_id, 'leads_only')
     or public.is_demo_department(v_role.dept_id) then
    raise exception using errcode = '42501', message = 'agent_role_forbidden';
  end if;

  v_source_count := cardinality(p_sources);
  if p_sources is null
     or v_source_count < 1
     or v_source_count > 20 then
    raise exception using errcode = '22023', message = 'agent_role_sources_invalid';
  end if;

  select count(distinct requested.source_id)::integer
  into v_distinct_count
  from unnest(p_sources) as requested(source_id);

  if v_distinct_count <> v_source_count then
    raise exception using errcode = '22023', message = 'agent_role_sources_invalid';
  end if;

  select count(*)::integer
  into v_valid_count
  from unnest(p_sources) as requested(source_id)
  join public.sources as source on source.id = requested.source_id
  join public.document_summaries as summary
    on summary.source_id = source.id
    and summary.dept_id = source.dept_id
  where source.dept_id = v_role.dept_id
    and source.kind = 'document'
    and source.active is true
    and public.can_see(v_user, source.dept_id, source.visibility);

  if v_valid_count <> v_source_count then
    raise exception using errcode = '22023', message = 'agent_role_sources_invalid';
  end if;

  v_kst_day_start :=
    date_trunc('day', clock_timestamp() at time zone 'Asia/Seoul')
      at time zone 'Asia/Seoul';

  select count(*)::integer
  into v_today_count
  from public.agent_role_results as role_result
  where role_result.dept_id = v_role.dept_id
    and role_result.updated_at >= v_kst_day_start
    and role_result.updated_at < v_kst_day_start + interval '1 day';

  if v_today_count + v_source_count > 100 then
    raise exception using errcode = 'P0001', message = 'agent_role_daily_limit';
  end if;

  for v_source in
    select source.*
    from unnest(p_sources) with ordinality as requested(source_id, position)
    join public.sources as source on source.id = requested.source_id
    order by requested.position
  loop
    return query
    insert into public.agent_role_results (
      role_id,
      source_id,
      dept_id,
      visibility,
      status,
      status_reason,
      result,
      weighted_score,
      requested_by,
      updated_at
    )
    values (
      v_role.id,
      v_source.id,
      v_role.dept_id,
      case
        when v_role.visibility = 'leads_only'
          or v_source.visibility = 'leads_only'
          then 'leads_only'
        else 'dept'
      end,
      'processing',
      null,
      null,
      null,
      v_user,
      clock_timestamp()
    )
    on conflict on constraint agent_role_results_role_source_key
    do update set
      dept_id = excluded.dept_id,
      visibility = excluded.visibility,
      status = 'processing',
      status_reason = null,
      result = null,
      weighted_score = null,
      requested_by = excluded.requested_by,
      updated_at = clock_timestamp()
    returning
      agent_role_results.id,
      agent_role_results.source_id,
      agent_role_results.updated_at;
  end loop;
end;
$$;

revoke all on function public.request_agent_role_run(uuid, uuid[])
  from public, anon, service_role;
grant execute on function public.request_agent_role_run(uuid, uuid[])
  to authenticated;
