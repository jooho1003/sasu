-- PRD §6-6/§6-12: 소스를 해제하면 원문·검색 벡터만 지우고 원장 인용문은 보존한다.
-- source 행과 item 행은 FK 및 감사 근거를 위해 삭제하지 않는다.

create or replace function public.guard_active_item_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active boolean;
begin
  select active into v_active
  from public.sources
  where id = new.source_id
  for key share;

  if coalesce(v_active, false) = false then
    raise exception using errcode = '23514', message = 'inactive_source';
  end if;
  return new;
end;
$$;

drop trigger if exists items_active_source_guard on public.items;
create trigger items_active_source_guard
before insert on public.items
for each row execute function public.guard_active_item_source();

create or replace function public.remove_source(p_source uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.sources%rowtype;
  v_removed_items integer := 0;
begin
  select source.* into v_source
  from public.sources as source
  join public.departments as department on department.id = source.dept_id
  join public.orgs as organization on organization.id = department.org_id
  where source.id = p_source
    and organization.is_demo = false
  for update of source;

  if not found then
    raise exception using errcode = '42501', message = 'source_not_removable';
  end if;

  if auth.uid() is null
    or not exists (
      select 1 from public.members as member
      where member.user_id = auth.uid()
        and member.dept_id = v_source.dept_id
        and member.role = 'lead'
    ) then
    raise exception using errcode = '42501', message = 'lead_required';
  end if;

  -- The source row lock makes a concurrent item ingest wait until active=false is visible.
  update public.items
  set embedding = null,
      embed_model = null,
      embed_status = 'deleted',
      deleted_at = now(),
      content = ''
  where source_id = v_source.id
    and deleted_at is null;
  get diagnostics v_removed_items = row_count;

  delete from public.classifications
  where item_id in (
    select id from public.items where source_id = v_source.id
  );

  update public.sources
  set active = false,
      last_error = null
  where id = v_source.id;

  return jsonb_build_object('removed_items', v_removed_items);
end;
$$;

revoke all on function public.remove_source(uuid) from public, anon, service_role;
grant execute on function public.remove_source(uuid) to authenticated;
