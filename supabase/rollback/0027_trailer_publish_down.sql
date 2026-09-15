-- Restore 0026 overview before removing its trailer dependencies.
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

drop function if exists public.publish_trailer(uuid);
drop function if exists public.unpublish_trailer(uuid);
drop function if exists public.public_trailer(text);
drop function if exists public.admin_set_trailer_publishing(boolean);
drop function if exists public.admin_unpublish_trailer(uuid);
-- Manual rollback only, before 0026 rollback.
drop function if exists public.delete_trailer(uuid);
drop function if exists public.approve_trailer_items(uuid,text[]);
drop function if exists public.record_trailer_gate(uuid,jsonb,boolean,timestamptz);
drop function if exists public.request_trailer_recheck(uuid);
drop function if exists public.update_trailer_scenarios(uuid,jsonb,timestamptz);
drop function if exists public.regenerate_trailer(uuid);
drop function if exists public.create_trailer_draft(uuid,uuid[],text[],text,jsonb);
drop function if exists public.trailer_candidates(uuid);
drop function if exists private.trailer_for_update(uuid);
drop function if exists private.trailer_approval_item_ids(jsonb);
drop function if exists private.count_trailer_generation(uuid);
drop trigger if exists guard_trailer on public.trailers;
drop function if exists private.guard_trailer();
drop table if exists public.trailer_generation_counters;
drop table if exists public.trailers;
alter table public.orgs drop column if exists trailer_publish_enabled;
