-- ADR-076: linked re-review of the same fixed synthetic case.
alter table public.sales_review_tasks
  add column revision_of uuid;
alter table public.sales_review_tasks
  add constraint sales_review_tasks_id_dept_unique unique (id, dept_id);
alter table public.sales_review_tasks
  add constraint sales_review_revision_same_dept
    foreign key (revision_of, dept_id)
    references public.sales_review_tasks (id, dept_id);
alter table public.sales_review_tasks
  add constraint sales_review_revision_not_self check (revision_of is distinct from id);
create index sales_review_tasks_revision_of_idx
  on public.sales_review_tasks (revision_of)
  where revision_of is not null;

alter table public.sales_review_actions
  add column reason_code text;
alter table public.sales_review_actions
  add constraint sales_review_action_reason_check check (
    (action = 'approve' and reason_code is null)
    or (action = 'reject' and (reason_code is null or reason_code in ('price', 'schedule')))
  );

drop function public.review_sales_task(uuid, text);
create function public.review_sales_task(p_task uuid, p_action text, p_reason text)
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
  if v_user is null or p_task is null or p_action is null
     or not coalesce((
       (p_action = 'approve' and p_reason is null)
       or (p_action = 'reject' and p_reason in ('price', 'schedule'))
     ), false) then
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
  insert into public.sales_review_actions (task_id, dept_id, reviewer_id, action, reason_code)
  values (v_task.id, v_task.dept_id, v_user, p_action, p_reason)
  on conflict (task_id) do nothing
  returning id into v_action_id;
  if v_action_id is null then
    raise exception using errcode = '23505', message = 'sales_review_already_reviewed';
  end if;
  return v_action_id;
end;
$$;
revoke all on function public.review_sales_task(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.review_sales_task(uuid, text, text) to authenticated;

create function public.request_sales_review_revision(
  p_dept uuid, p_parent uuid, p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_parent public.sales_review_tasks%rowtype;
  v_reason text;
  v_existing public.sales_review_tasks%rowtype;
  v_task_id uuid;
  v_count integer;
  v_kst_start timestamptz;
begin
  if v_user is null or p_dept is null or p_parent is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'sales_review_revision_invalid';
  end if;
  -- Use the same member lock as request_sales_review for the daily limit and key.
  perform 1 from public.members as member
  where member.user_id = v_user and member.dept_id = p_dept
    and member.consented_at is not null
  for update;
  if not found or not public.can_see(v_user, p_dept, 'dept')
     or public.is_demo_department(p_dept) then
    raise exception using errcode = '42501', message = 'sales_review_revision_forbidden';
  end if;
  select task.* into v_parent from public.sales_review_tasks as task
  where task.id = p_parent and task.dept_id = p_dept;
  if not found or v_parent.status <> 'ready' then
    raise exception using errcode = '42501', message = 'sales_review_revision_forbidden';
  end if;
  select action.reason_code into v_reason
  from public.sales_review_actions as action
  where action.task_id = p_parent and action.dept_id = p_dept
    and action.action = 'reject';
  if not found or v_reason is null or v_reason not in ('price', 'schedule') then
    raise exception using errcode = '42501', message = 'sales_review_revision_forbidden';
  end if;
  select task.* into v_existing from public.sales_review_tasks as task
  where task.dept_id = p_dept and task.requested_by = v_user
    and task.client_request_id = p_request_id;
  if found then
    if v_existing.revision_of is distinct from p_parent or v_existing.focus <> v_reason then
      raise exception using errcode = '22023', message = 'sales_review_revision_invalid';
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
  insert into public.sales_review_tasks
    (dept_id, requested_by, client_request_id, focus, revision_of)
  values (p_dept, v_user, p_request_id, v_reason, p_parent)
  returning id into v_task_id;
  insert into public.jobs (kind, payload, lane, status, run_after)
  values ('run_sales_review', jsonb_build_object('taskId', v_task_id),
    'realtime', 'queued', clock_timestamp());
  return v_task_id;
end;
$$;
revoke all on function public.request_sales_review_revision(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.request_sales_review_revision(uuid, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
