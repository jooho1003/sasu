alter table public.answers
  add column if not exists generic_answer text,
  add column if not exists question_key text;

create or replace function public.demo_departments()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select department.id, department.name
  from public.departments as department
  join public.orgs as organization on organization.id = department.org_id
  where organization.is_demo = true
  order by department.created_at, department.id;
$$;

revoke all on function public.demo_departments() from public, authenticated;
grant execute on function public.demo_departments() to anon;
