-- ADR-052: actor-bound conversation history. Previous questions are context,
-- never evidence; every new answer searches and validates original sources.
alter table public.answers add column parent_id uuid references public.answers(id);
create index answers_question_history on public.answers(asked_by,dept_id,created_at desc,id desc);

create function public.guard_answer_parent() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent answers%rowtype;
begin
  -- answers UPDATE is already revoked from authenticated users (0013).
  if new.parent_id is null then return new; end if;
  select * into parent from answers where id=new.parent_id;
  if not found or parent.id=new.id or parent.dept_id<>new.dept_id or parent.asked_by is distinct from new.asked_by
    or parent.created_at>new.created_at or parent.status='pending' then
    raise exception using errcode='42501',message='invalid_parent'; end if;
  return new;
end $$;
revoke all on function public.guard_answer_parent() from public,anon,authenticated,service_role;
create trigger answers_parent before insert or update of parent_id on public.answers for each row execute function public.guard_answer_parent();

create function public.ask_question(p_dept uuid,p_question text,p_parent uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare answer_id uuid; job_id uuid;
begin
  if length(btrim(coalesce(p_question,''))) not between 5 and 1000 then raise exception using errcode='22023',message='invalid_question'; end if;
  if not exists(select 1 from members m join departments d on d.id=m.dept_id join orgs o on o.id=d.org_id
    where m.user_id=auth.uid() and m.dept_id=p_dept and m.consented_at is not null and not o.is_demo and can_see(auth.uid(),p_dept,'dept')) then
    raise exception using errcode='42501',message='question_forbidden'; end if;
  if p_parent is not null and not exists(select 1 from answers a where a.id=p_parent and a.asked_by=auth.uid() and a.dept_id=p_dept
    and a.status<>'pending' and (a.status<>'done' or my_answer_evidence_valid(a.id))) then
    raise exception using errcode='42501',message='invalid_parent'; end if;
  insert into answers(dept_id,asked_by,question,status,parent_id) values(p_dept,auth.uid(),btrim(p_question),'pending',p_parent) returning id into answer_id;
  insert into jobs(kind,payload) values('answer',jsonb_build_object('answerId',answer_id)) returning id into job_id;
  return jsonb_build_object('answer_id',answer_id,'job_id',job_id);
end $$;
revoke all on function public.ask_question(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ask_question(uuid,text,uuid) to authenticated;

-- Runs after the existing atomic Slack ingest creates its delivery row.
create function public.link_slack_question_parent() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare current_answer answers%rowtype; previous uuid;
begin
  select * into current_answer from answers where id=new.answer_id;
  select a.id into previous from answers a join slack_answer_deliveries s on s.answer_id=a.id
    where a.asked_by=current_answer.asked_by and a.dept_id=current_answer.dept_id and a.id<>current_answer.id
      and a.created_at<=current_answer.created_at and a.status<>'pending'
      and s.channel=new.channel and s.thread_ts=new.thread_ts and s.scope=new.scope
    order by a.created_at desc,a.id desc limit 1;
  if previous is not null then update answers set parent_id=previous where id=new.answer_id; end if;
  return new;
end $$;
revoke all on function public.link_slack_question_parent() from public,anon,authenticated,service_role;
create trigger slack_question_parent after insert on public.slack_answer_deliveries for each row execute function public.link_slack_question_parent();

create function public.answer_conversation_context(p_answer uuid,p_scope text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare current_answer answers%rowtype; parent answers%rowtype; next_id uuid; result jsonb:='[]'; visited uuid[];
begin
  if p_scope not in ('user','channel') then return '[]'; end if;
  select * into current_answer from answers where id=p_answer;
  if not found or not exists(select 1 from members m join departments d on d.id=m.dept_id join orgs o on o.id=d.org_id
    where m.user_id=current_answer.asked_by and m.dept_id=current_answer.dept_id and m.consented_at is not null and not o.is_demo
      and can_see(m.user_id,m.dept_id,'dept')) then return '[]'; end if;
  next_id:=current_answer.parent_id; visited:=array[current_answer.id];
  for depth in 1..6 loop
    exit when next_id is null or next_id=any(visited);
    select * into parent from answers where id=next_id and asked_by=current_answer.asked_by and dept_id=current_answer.dept_id and status<>'pending';
    exit when not found;
    -- Channel context must stay in this exact channel/thread, never inherit DM/web.
    if p_scope='channel' and not exists(select 1 from slack_answer_deliveries p join slack_answer_deliveries c
      on c.channel=p.channel and c.thread_ts=p.thread_ts and c.scope=p.scope
      where p.answer_id=parent.id and c.answer_id=current_answer.id and p.scope='channel') then exit; end if;
    result:=jsonb_build_array(jsonb_build_object('question',left(parent.question,1000)))||result;
    visited:=array_append(visited,parent.id); next_id:=parent.parent_id;
  end loop;
  return result;
end $$;
revoke all on function public.answer_conversation_context(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.answer_conversation_context(uuid,text) to service_role;

-- Session/RLS evaluation is preserved (security INVOKER).
create function public.my_question_history(p_dept uuid,p_before timestamptz default null,p_before_id uuid default null)
returns table(id uuid,question text,status text,created_at timestamptz,parent_id uuid)
language sql stable security invoker set search_path=public,pg_temp as $$
  select a.id,a.question,a.status,a.created_at,a.parent_id from answers a
  where a.asked_by=auth.uid() and a.dept_id=p_dept and can_see(auth.uid(),p_dept,'dept')
    and exists(select 1 from members m where m.user_id=auth.uid() and m.dept_id=p_dept and m.consented_at is not null)
    and (p_before is null or (a.created_at,a.id)<(p_before,p_before_id))
  order by a.created_at desc,a.id desc limit 21;
$$;
revoke all on function public.my_question_history(uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_question_history(uuid,timestamptz,uuid) to authenticated;
