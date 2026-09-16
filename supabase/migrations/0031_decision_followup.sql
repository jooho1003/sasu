-- ADR-052: append-only corrections and durable, consent-aware reminders.
create unique index decisions_one_correction on public.decisions(supersedes_id) where supersedes_id is not null;

create function public.correct_decision(p_dept uuid,p_previous uuid,p_id uuid,p_outcome text,p_rationale text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare prior decisions%rowtype; existing decisions%rowtype; actor members%rowtype; visibility text;
begin
  if p_id is null or length(btrim(p_outcome)) not between 1 and 300 or length(btrim(p_rationale)) not between 1 and 1000 or p_outcome is null or p_rationale is null then
    raise exception using errcode='22023',message='invalid_correction'; end if;
  select * into actor from members where user_id=auth.uid() and dept_id=p_dept and consented_at is not null for share;
  if not found or exists(select 1 from departments d join orgs o on o.id=d.org_id where d.id=p_dept and o.is_demo) then
    raise exception using errcode='42501',message='correction_forbidden'; end if;
  select * into prior from decisions where id=p_previous and dept_id=p_dept for update;
  if not found or not can_see(auth.uid(),p_dept,prior.visibility)
    or (actor.role<>'lead' and prior.decided_by is distinct from auth.uid()) then
    raise exception using errcode='42501',message='correction_forbidden'; end if;
  if exists(select 1 from citations c join items i on i.id=c.item_id join sources s on s.id=i.source_id
    where ((c.owner_kind='decision' and c.owner_id=prior.id) or (c.owner_kind='decision_request' and c.owner_id=prior.request_id)) and not can_see(auth.uid(),s.dept_id,s.visibility)) then
    raise exception using errcode='42501',message='correction_forbidden'; end if;
  if exists(select 1 from citations c join decisions d on d.id=c.decision_id
    where ((c.owner_kind='decision' and c.owner_id=prior.id) or (c.owner_kind='decision_request' and c.owner_id=prior.request_id))
      and not can_see(auth.uid(),d.dept_id,d.visibility)) then raise exception using errcode='42501',message='correction_forbidden'; end if;
  select * into existing from decisions where id=p_id;
  if found then
    if existing.supersedes_id=prior.id and existing.decided_by=auth.uid() and existing.outcome=btrim(p_outcome) and existing.rationale=btrim(p_rationale) then return existing.id; end if;
    raise exception using errcode='23505',message='correction_conflict';
  end if;
  if exists(select 1 from decisions where supersedes_id=prior.id) then raise exception using errcode='23505',message='decision_already_corrected'; end if;
  visibility:=case when prior.visibility='leads_only' or exists(select 1 from citations c join items i on i.id=c.item_id join sources s on s.id=i.source_id
    where ((c.owner_kind='decision' and c.owner_id=prior.id) or (c.owner_kind='decision_request' and c.owner_id=prior.request_id)) and s.visibility='leads_only') or exists(select 1 from citations c join decisions d on d.id=c.decision_id
    where ((c.owner_kind='decision' and c.owner_id=prior.id) or (c.owner_kind='decision_request' and c.owner_id=prior.request_id)) and d.visibility='leads_only')
    then 'leads_only' else 'dept' end;
  insert into decisions(id,dept_id,decided_by,decided_by_name,outcome,rationale,supersedes_id,visibility)
    values(p_id,p_dept,auth.uid(),actor.display_name,btrim(p_outcome),btrim(p_rationale),prior.id,visibility);
  insert into citations(owner_kind,owner_id,item_id,decision_id,quote)
    select 'decision',p_id,item_id,decision_id,quote from citations where (owner_kind='decision' and owner_id=prior.id)
      or (owner_kind='decision_request' and owner_id=prior.request_id) on conflict do nothing;
  return p_id;
end $$;
revoke all on function public.correct_decision(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.correct_decision(uuid,uuid,uuid,text,text) to authenticated;

create table public.card_reminders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.decision_requests,
  kind text not null check(kind in ('manual','deadline')),
  scheduled_for timestamptz not null,
  generation integer not null default 1,
  state text not null default 'pending' check(state in ('pending','queued','sending','sent','failed','cancelled')),
  created_by uuid references auth.users on delete set null,
  lease uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  last_error text,
  unique(request_id,kind)
);
alter table public.card_reminders enable row level security;
revoke all on public.card_reminders from public,anon,authenticated;
grant select on public.card_reminders to authenticated;
grant all on public.card_reminders to service_role;
create policy reminders_own_card on public.card_reminders for select to authenticated using(exists(
  select 1 from decision_requests r where r.id=request_id and can_see(auth.uid(),r.dept_id,r.visibility)
    and (r.assignee_id=auth.uid() or can_see(auth.uid(),r.dept_id,'leads_only'))));

create function public.set_card_reminder(p_request uuid,p_at timestamptz) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r decision_requests%rowtype; result uuid;
begin
  select * into r from decision_requests where id=p_request for update;
  if not found or not can_see(auth.uid(),r.dept_id,r.visibility) or (r.assignee_id is distinct from auth.uid() and not can_see(auth.uid(),r.dept_id,'leads_only'))
    or not exists(select 1 from members where user_id=auth.uid() and dept_id=r.dept_id and consented_at is not null)
    or exists(select 1 from departments d join orgs o on o.id=d.org_id where d.id=r.dept_id and o.is_demo) then
    raise exception using errcode='42501',message='reminder_forbidden'; end if;
  if p_at is null then
    update card_reminders set state='cancelled',generation=generation+1,lease=null,lease_until=null where request_id=r.id and kind='manual' returning id into result;
    return result;
  end if;
  if r.status not in ('open','deferred') or r.source_invalidated or p_at<=now() or p_at>now()+interval '90 days' then
    raise exception using errcode='22023',message='invalid_reminder_time'; end if;
  insert into card_reminders(request_id,kind,scheduled_for,created_by) values(r.id,'manual',p_at,auth.uid())
    on conflict(request_id,kind) do update set scheduled_for=excluded.scheduled_for,generation=card_reminders.generation+1,state='pending',created_by=excluded.created_by,lease=null,lease_until=null,sent_at=null,last_error=null
    returning id into result;
  return result;
end $$;
revoke all on function public.set_card_reminder(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.set_card_reminder(uuid,timestamptz) to authenticated;

create function public.schedule_card_reminders() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare reminder card_reminders%rowtype; n int:=0;
begin
  insert into card_reminders(request_id,kind,scheduled_for)
    select r.id,'deadline',r.deadline from decision_requests r join departments d on d.id=r.dept_id join orgs o on o.id=d.org_id
    where r.status in ('open','deferred') and not r.source_invalidated and r.deadline<=now() and not o.is_demo
    on conflict(request_id,kind) do update set scheduled_for=excluded.scheduled_for,generation=card_reminders.generation+1,state='pending',lease=null,lease_until=null,sent_at=null,last_error=null
    where card_reminders.scheduled_for is distinct from excluded.scheduled_for;
  update card_reminders m set state='cancelled',lease=null,lease_until=null where m.state in ('pending','queued','sending') and exists(
    select 1 from decision_requests r where r.id=m.request_id and (r.status not in ('open','deferred') or r.source_invalidated or (m.kind='deadline' and r.deadline is distinct from m.scheduled_for)));
  for reminder in select * from card_reminders where state='pending' and scheduled_for<=now() order by scheduled_for limit 50 for update skip locked loop
    insert into jobs(id,kind,payload) values(md5('reminder:'||reminder.id||':'||reminder.generation)::uuid,'send_reminder',jsonb_build_object('reminderId',reminder.id,'generation',reminder.generation)) on conflict(id) do nothing;
    update card_reminders set state='queued' where id=reminder.id; n:=n+1;
  end loop;
  return n;
end $$;
create function public.claim_card_reminder(p_id uuid,p_generation int,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare m card_reminders%rowtype; r decision_requests%rowtype; target members%rowtype;
begin
  select * into m from card_reminders where id=p_id and generation=p_generation and state in ('queued','sending') and scheduled_for<=now() for update;
  if not found then return null; end if;
  if m.lease_until>now() then return jsonb_build_object('busy',true); end if;
  select * into r from decision_requests where id=m.request_id for share;
  select * into target from members where user_id=r.assignee_id and dept_id=r.dept_id and consented_at is not null and slack_user_id is not null for share;
  if not found or r.status not in ('open','deferred') or r.source_invalidated or not can_see(target.user_id,r.dept_id,r.visibility)
    or (m.kind='deadline' and r.deadline is distinct from m.scheduled_for)
    or exists(select 1 from departments d join orgs o on o.id=d.org_id where d.id=r.dept_id and o.is_demo) then
    update card_reminders set state='cancelled',lease=null,lease_until=null where id=m.id; return null; end if;
  update card_reminders set state='sending',lease=p_lease,lease_until=now()+interval '5 minutes',last_error=null where id=m.id;
  return jsonb_build_object('requestId',r.id,'deptId',r.dept_id,'slackUserId',target.slack_user_id,'kind',m.kind);
end $$;
create function public.finish_card_reminder(p_id uuid,p_generation int,p_lease uuid,p_sent boolean,p_error text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update card_reminders set state=case when p_sent then 'sent' else 'queued' end,sent_at=case when p_sent then now() else null end,lease=null,lease_until=null,
    last_error=case when p_sent then null else 'slack_delivery_failed' end where id=p_id and generation=p_generation and lease=p_lease and lease_until>now();
  return found;
end $$;
create function public.reminder_job_failed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.kind='send_reminder' and new.status='failed' and old.status is distinct from 'failed' then
    update card_reminders set state='failed',last_error='slack_delivery_failed',lease=null,lease_until=null
      where id=(new.payload->>'reminderId')::uuid and generation=(new.payload->>'generation')::integer and state in ('queued','sending');
  end if;
  return new;
end $$;
revoke all on function public.schedule_card_reminders(),public.claim_card_reminder(uuid,int,uuid),public.finish_card_reminder(uuid,int,uuid,boolean,text),public.reminder_job_failed() from public,anon,authenticated,service_role;
grant execute on function public.schedule_card_reminders(),public.claim_card_reminder(uuid,int,uuid),public.finish_card_reminder(uuid,int,uuid,boolean,text) to service_role;
create trigger jobs_reminder_failure after update of status on public.jobs for each row execute function public.reminder_job_failed();

-- Keep corrected precedents out of fresh Q&A retrieval; ledger history remains available.
create function public.recent_decisions_for_card(p_dept uuid,p_limit int default 3)
returns table(id uuid,request_id uuid,visibility text,outcome text,rationale text,decided_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
  select d.id,d.request_id,d.visibility,d.outcome,d.rationale,d.decided_at from decisions d
  where d.dept_id=p_dept and not exists(select 1 from decisions next where next.supersedes_id=d.id)
  order by d.decided_at desc nulls last limit greatest(1,least(coalesce(p_limit,3),20));
$$;
revoke all on function public.recent_decisions_for_card(uuid,int) from public,anon,authenticated,service_role;
grant execute on function public.recent_decisions_for_card(uuid,int) to service_role;

create or replace function public.recent_decisions_as(p_user uuid,p_dept uuid,p_limit int default 3)
returns table(id uuid,outcome text,rationale text,decided_at timestamptz,decided_by_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,d.outcome,d.rationale,d.decided_at,d.decided_by_name from decisions d
  where d.dept_id=p_dept and can_see(p_user,d.dept_id,d.visibility)
    and (auth.uid()=p_user or auth.role()='service_role')
    and not exists(select 1 from decisions next where next.supersedes_id=d.id)
  order by d.decided_at desc nulls last limit greatest(1,least(coalesce(p_limit,3),20));
$$;
create or replace function public.recent_channel_decisions_as(p_user uuid,p_dept uuid,p_limit int default 3)
returns table(id uuid,outcome text,rationale text,decided_at timestamptz,decided_by_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,d.outcome,d.rationale,d.decided_at,d.decided_by_name from decisions d
  where d.dept_id=p_dept and d.visibility='dept' and can_see(p_user,d.dept_id,d.visibility)
    and (auth.uid()=p_user or auth.role()='service_role')
    and not exists(select 1 from decisions next where next.supersedes_id=d.id)
  order by d.decided_at desc nulls last limit greatest(1,least(coalesce(p_limit,3),20));
$$;
