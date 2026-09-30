-- ADR-075: authenticated synthetic sales review. No real customer sources are read.
create table public.sales_review_tasks (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.departments(id),
  requested_by uuid not null references auth.users(id),
  client_request_id uuid not null,
  case_version integer not null default 1 check (case_version = 1),
  focus text not null check (focus in ('all', 'price', 'schedule')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'ready', 'failed')),
  status_reason text,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (dept_id, requested_by, client_request_id),
  check ((status = 'ready' and result is not null) or (status <> 'ready' and result is null))
);

create index sales_review_tasks_dept_created_idx
  on public.sales_review_tasks (dept_id, created_at desc);
create index sales_review_tasks_pending_idx
  on public.sales_review_tasks (updated_at)
  where status in ('queued', 'processing');

create table public.sales_review_actions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.sales_review_tasks(id),
  dept_id uuid not null references public.departments(id),
  reviewer_id uuid not null references auth.users(id),
  action text not null check (action in ('approve', 'reject')),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.sales_review_tasks enable row level security;
alter table public.sales_review_actions enable row level security;

create or replace function public.prevent_sales_review_action_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using errcode = '42501', message = 'sales_review_action_append_only';
end;
$$;
revoke all on function public.prevent_sales_review_action_mutation() from public, anon, authenticated, service_role;
create trigger sales_review_actions_append_only
before update or delete on public.sales_review_actions
for each row execute function public.prevent_sales_review_action_mutation();

create policy sales_review_tasks_read on public.sales_review_tasks
  for select to authenticated
  using (
    public.can_see(auth.uid(), dept_id, 'dept')
    and exists (
      select 1 from public.members as member
      where member.user_id = auth.uid() and member.dept_id = sales_review_tasks.dept_id
        and member.consented_at is not null
    )
  );

create policy sales_review_actions_read on public.sales_review_actions
  for select to authenticated
  using (
    public.can_see(auth.uid(), dept_id, 'dept')
    and exists (
      select 1 from public.members as member
      where member.user_id = auth.uid() and member.dept_id = sales_review_actions.dept_id
        and member.consented_at is not null
    )
  );

revoke all on public.sales_review_tasks, public.sales_review_actions from public, anon, authenticated;
grant select on public.sales_review_tasks, public.sales_review_actions to authenticated;
grant all on public.sales_review_tasks, public.sales_review_actions to service_role;

create or replace function public.request_sales_review(
  p_dept uuid, p_focus text, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.sales_review_tasks%rowtype;
  v_task_id uuid;
  v_count integer;
  v_kst_start timestamptz;
begin
  if v_user is null or p_dept is null or p_request_id is null
     or p_focus is null or p_focus not in ('all', 'price', 'schedule') then
    raise exception using errcode = '22023', message = 'sales_review_request_invalid';
  end if;

  -- Serializes the per-user daily limit without a second visibility implementation.
  perform 1 from public.members as member
  where member.user_id = v_user and member.dept_id = p_dept
    and member.consented_at is not null
  for update;
  if not found or not public.can_see(v_user, p_dept, 'dept')
     or public.is_demo_department(p_dept) then
    raise exception using errcode = '42501', message = 'sales_review_forbidden';
  end if;

  select task.* into v_existing
  from public.sales_review_tasks as task
  where task.dept_id = p_dept and task.requested_by = v_user
    and task.client_request_id = p_request_id;
  if found then
    if v_existing.focus <> p_focus then
      raise exception using errcode = '22023', message = 'sales_review_request_invalid';
    end if;
    return v_existing.id;
  end if;

  v_kst_start := date_trunc('day', clock_timestamp() at time zone 'Asia/Seoul')
    at time zone 'Asia/Seoul';
  select count(*) into v_count from public.sales_review_tasks as task
  where task.requested_by = v_user and task.dept_id = p_dept
    and task.created_at >= v_kst_start
    and task.created_at < v_kst_start + interval '1 day';
  if v_count >= 10 then
    raise exception using errcode = '22023', message = 'sales_review_daily_limit';
  end if;

  insert into public.sales_review_tasks (dept_id, requested_by, client_request_id, focus)
  values (p_dept, v_user, p_request_id, p_focus)
  returning id into v_task_id;

  insert into public.jobs (kind, payload, lane, status, run_after)
  values ('run_sales_review', jsonb_build_object('taskId', v_task_id), 'realtime', 'queued', clock_timestamp());
  return v_task_id;
end;
$$;

revoke all on function public.request_sales_review(uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.request_sales_review(uuid, text, uuid) to authenticated;

create or replace function public.review_sales_task(p_task uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_task public.sales_review_tasks%rowtype;
  v_action_id uuid;
begin
  if v_user is null or p_task is null or p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'sales_review_action_invalid';
  end if;
  select task.* into v_task from public.sales_review_tasks as task
  where task.id = p_task for update;
  if not found or v_task.status <> 'ready'
     or not public.can_see(v_user, v_task.dept_id, 'leads_only')
     or public.is_demo_department(v_task.dept_id)
     or not exists (
       select 1 from public.members as member
       where member.user_id = v_user and member.dept_id = v_task.dept_id
         and member.consented_at is not null and member.role = 'lead'
     ) then
    raise exception using errcode = '42501', message = 'sales_review_action_forbidden';
  end if;
  insert into public.sales_review_actions (task_id, dept_id, reviewer_id, action)
  values (v_task.id, v_task.dept_id, v_user, p_action)
  on conflict (task_id) do nothing
  returning id into v_action_id;
  if v_action_id is null then
    raise exception using errcode = '23505', message = 'sales_review_already_reviewed';
  end if;
  return v_action_id;
end;
$$;

revoke all on function public.review_sales_task(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.review_sales_task(uuid, text) to authenticated;
