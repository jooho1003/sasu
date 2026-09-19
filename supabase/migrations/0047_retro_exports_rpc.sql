create function public.record_retro_export(p_day uuid,p_revision int,p_kind text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days;
begin
  d:=private.retro_owner(p_day);
  if p_kind is distinct from 'markdown' or p_revision is null or d.confirmed_revision is null or d.confirmed_revision is distinct from p_revision or not private.retro_revision_live(p_day,p_revision,auth.uid()) then raise exception 'not_confirmed' using errcode='22023'; end if;
  insert into retro_exports(day_id,revision,kind,exported_by) values(p_day,p_revision,p_kind,auth.uid());
end $$;
revoke all on function public.record_retro_export(uuid,int,text) from public,anon,authenticated,service_role;
grant execute on function public.record_retro_export(uuid,int,text) to authenticated;

create function public.renew_retro_draft(p_day uuid,p_revision int,p_generation int,p_lease uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  update retro_days set lease_until=now()+interval '2 minutes',updated_at=clock_timestamp() where id=p_day and revision=p_revision and generation=p_generation and lease=p_lease and lease_until>now() and status='drafting' and not is_demo_department(dept_id) and exists(select 1 from members m where m.dept_id=retro_days.dept_id and m.user_id=retro_days.user_id and m.consented_at is not null);
  return found;
end $$;
revoke all on function public.renew_retro_draft(uuid,int,int,uuid) from public,anon,authenticated,service_role;
grant execute on function public.renew_retro_draft(uuid,int,int,uuid) to service_role;
