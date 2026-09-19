-- Phase 30 rollback, with workers/writes disabled and a reviewed backup.
-- Execute this and 0049_retro_connections_down.sql in ONE transaction.
-- Phase 30 activity rows are removed; existing revisions with missing citations stay hidden.
delete from public.jobs where kind='retro_pull';
update public.retro_days set lease=null,lease_until=null,input_hash=null,status=case when status='drafting' then 'needs_review' else status end;
delete from public.retro_activities where kind not in ('git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search','sasu_decision','sasu_answer','sasu_card','sasu_review');
update public.retro_days d set activity_count=(select count(*) from public.retro_activities a where a.day_id=d.id);
create or replace function private.retro_activity_live(p_activity uuid,p_viewer uuid,p_visibility text default 'self') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_activities a join retro_days day on day.id=a.day_id where a.id=p_activity
    and (p_visibility<>'dept' or a.source_visibility is distinct from 'leads_only') and case a.kind
    when 'sasu_decision' then exists(select 1 from decisions d where d.id::text=a.ref and d.dept_id=day.dept_id and d.decided_by=day.user_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept'))
    when 'sasu_card' then exists(select 1 from decision_requests c where c.id::text=a.ref and c.dept_id=day.dept_id and c.assignee_id=day.user_id and c.closed_at is not null and can_see(day.user_id,c.dept_id,c.visibility) and can_see(p_viewer,c.dept_id,c.visibility) and (p_visibility<>'dept' or c.visibility='dept'))
    when 'sasu_review' then exists(select 1 from reviewed_materials r where r.id::text=a.ref and r.dept_id=day.dept_id and r.confirmed_by=day.user_id and r.confirmed_at is not null and r.deleted_at is null and review_editor(r.dept_id,day.user_id) and review_editor(r.dept_id,p_viewer) and p_visibility<>'dept')
    when 'sasu_answer' then exists(select 1 from answers ans where ans.id::text=a.ref and ans.dept_id=day.dept_id and ans.asked_by=day.user_id and ans.status='done' and ans.verified
      and can_see(day.user_id,ans.dept_id,'dept') and can_see(p_viewer,ans.dept_id,'dept')
      and exists(select 1 from citations where owner_kind='answer' and owner_id=ans.id)
      and not exists(select 1 from citations c left join items i on i.id=c.item_id left join sources s on s.id=i.source_id and s.dept_id=i.dept_id left join decisions d on d.id=c.decision_id
        where c.owner_kind='answer' and c.owner_id=ans.id and not coalesce(
          (c.item_id is not null and c.decision_id is null and i.dept_id=ans.dept_id and i.deleted_at is null and s.active and can_see(day.user_id,i.dept_id,s.visibility) and can_see(p_viewer,i.dept_id,s.visibility) and (p_visibility<>'dept' or s.visibility='dept') and length(c.quote)>0 and position(c.quote in i.content)>0)
          or (c.decision_id is not null and c.item_id is null and d.dept_id=ans.dept_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept') and length(c.quote)>0 and position(c.quote in d.outcome||E'\n'||d.rationale)>0),false)))
    else true end)
$$;

create or replace function private.retro_validate(p_day uuid,p_title text,p_body jsonb,p_topics text[],p_visibility text default 'self',p_allow_excluded boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s text; i jsonb; c jsonb; a retro_activities; n int:=0; result jsonb:='{}'; entries jsonb; refs jsonb;
begin
  if p_title is null or length(btrim(mask_retro_text(p_title))) not between 1 and 60 or p_topics is null or cardinality(p_topics)>5 or exists(select 1 from unnest(p_topics) t where t is null or length(btrim(mask_retro_text(t))) not between 1 and 50) or jsonb_typeof(p_body) is distinct from 'object' or not p_body ?& array['did','learned','decided','next'] or (select count(*) from jsonb_object_keys(p_body))<>4 then raise exception 'invalid_retro' using errcode='22023'; end if;
  foreach s in array array['did','learned','decided','next'] loop
    if jsonb_typeof(p_body->s) is distinct from 'array' then raise exception 'invalid_retro' using errcode='22023'; end if;
    entries:='[]';
    for i in select value from jsonb_array_elements(p_body->s) loop
      n:=n+1;
      if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'text') is distinct from 'string' or n>200 or length(btrim(mask_retro_text(i->>'text'))) not between 1 and 2000 or jsonb_typeof(i->'citations') is distinct from 'array' or jsonb_array_length(i->'citations') not between 1 and 20 or (select count(*) from jsonb_object_keys(i))<>2 then raise exception 'invalid_retro' using errcode='22023'; end if;
      refs:='[]';
      for c in select value from jsonb_array_elements(i->'citations') loop
        if jsonb_typeof(c->'activity_id') is distinct from 'string' or jsonb_typeof(c->'quote') is distinct from 'string' or length(c->>'quote')>500 then raise exception 'citation_invalid' using errcode='22023'; end if;
        select * into a from retro_activities where id::text=c->>'activity_id' and day_id=p_day and (p_allow_excluded or not excluded);
        if a.id is null or coalesce(length(btrim(c->>'quote')),0)=0 or not (position(c->>'quote' in a.text)>0 or position(c->>'quote' in a.title)>0) then raise exception 'citation_invalid' using errcode='22023'; end if;
        if p_visibility='dept' and a.source_visibility='leads_only' then raise exception 'visibility_narrower_source' using errcode='42501'; end if;
        if not private.retro_activity_live(a.id,(select user_id from retro_days where id=p_day),p_visibility) then raise exception 'citation_invalid' using errcode='22023'; end if;
        refs:=refs||jsonb_build_array(jsonb_build_object('activity_id',a.id,'quote',c->>'quote'));
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('text',mask_retro_text(i->>'text'),'citations',refs));
    end loop;
    result:=result||jsonb_build_object(s,entries);
  end loop;
  return result;
end $$;

create or replace function public.create_retro_day(p_dept uuid,p_day uuid,p_date date,p_tz text,p_collector text,p_bundle jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; a jsonb; old retro_activities; rid uuid; j uuid; h text; n int; clean_title text; clean_text text;
begin
  if is_demo_department(p_dept) then raise exception 'demo_org' using errcode='42501'; end if;
  if auth.uid() is null or not exists(select 1 from members where dept_id=p_dept and user_id=auth.uid() and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_tz) or p_date is null or abs(p_date-(now() at time zone p_tz)::date)>7 or octet_length(p_bundle::text)>1048576 or jsonb_typeof(p_bundle->'activities') is distinct from 'array' or jsonb_array_length(p_bundle->'activities')>500 then raise exception 'invalid_bundle' using errcode='22023'; end if;
  insert into retro_days(id,dept_id,user_id,retro_date,tz,collector_version) values(p_day,p_dept,auth.uid(),p_date,p_tz,p_collector) on conflict(dept_id,user_id,retro_date) do nothing;
  select * into d from retro_days where dept_id=p_dept and user_id=auth.uid() and retro_date=p_date for update; rid:=d.id;
  if d.tz<>p_tz then raise exception 'invalid_timezone' using errcode='22023'; end if;
  for a in select value from jsonb_array_elements(p_bundle->'activities') loop
    if a->>'kind' like 'sasu_%' then raise exception 'server_only_kind' using errcode='22023'; end if;
    if jsonb_typeof(a->'kind') is distinct from 'string' or jsonb_typeof(a->'title') is distinct from 'string' or jsonb_typeof(a->'text') is distinct from 'string' or jsonb_typeof(a->'ref') is distinct from 'string' or jsonb_typeof(a->'at') is distinct from 'string' or a->>'kind' not in ('git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search') or coalesce(length(a->>'title'),0) not between 1 and 200 or length(a->>'text')>500 or coalesce(length(a->>'ref'),0) not between 1 and 200 or jsonb_typeof(a->'meta') is distinct from 'object' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if a->>'kind'='web_visit' and (a->>'ref' !~ '^https?://[^/?#]+(/[^?#]*)?$' or a->>'ref' ~ '[?#]') then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if (a->>'at')::timestamptz at time zone p_tz not between p_date::timestamp and (p_date+1)::timestamp-interval '1 microsecond' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    clean_title:=left(mask_retro_text(a->>'title'),200); clean_text:=left(mask_retro_text(a->>'text'),500);
    select * into old from retro_activities where day_id=rid and kind=a->>'kind' and ref=a->>'ref';
    if old.id is not null and (old.title<>clean_title or old.text<>clean_text) and exists(select 1 from retro_revisions r,jsonb_each(r.body) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') c where r.day_id=rid and c->>'activity_id'=old.id::text) then raise exception 'cited_activity_changed' using errcode='40001'; end if;
    insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(rid,a->>'kind',a->>'ref',clean_title,clean_text,(a->>'at')::timestamptz,
      coalesce((select jsonb_object_agg(key,case when jsonb_typeof(value)='string' then to_jsonb(mask_retro_text(value#>>'{}')) when jsonb_typeof(value) in ('number','boolean') then value else 'null'::jsonb end) from jsonb_each(a->'meta')),'{}'))
    on conflict(day_id,kind,ref) do update set title=excluded.title,text=excluded.text,at=excluded.at,meta=excluded.meta;
  end loop;
  -- Current source permission is checked before taking a personal snapshot.
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_decision',id::text,left(mask_retro_text(outcome),200),left(mask_retro_text(rationale),500),decided_at,visibility from decisions
    where dept_id=p_dept and decided_by=auth.uid() and (decided_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_answer',a.id::text,left(mask_retro_text(a.question),200),left(mask_retro_text(a.question),500),a.created_at,
      case when exists(select 1 from citations c left join items i on i.id=c.item_id left join sources src on src.id=i.source_id left join decisions cited_decision on cited_decision.id=c.decision_id where c.owner_kind='answer' and c.owner_id=a.id and (src.visibility='leads_only' or cited_decision.visibility='leads_only')) then 'leads_only' else 'dept' end
    from answers a where a.dept_id=p_dept and a.asked_by=auth.uid() and a.status='done' and (a.created_at at time zone p_tz)::date=p_date and my_answer_evidence_valid(a.id)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_card',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),closed_at,visibility from decision_requests
    where dept_id=p_dept and assignee_id=auth.uid() and (closed_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_review',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),confirmed_at,'leads_only' from reviewed_materials
    where dept_id=p_dept and confirmed_by=auth.uid() and (confirmed_at at time zone p_tz)::date=p_date and deleted_at is null and review_editor(dept_id,auth.uid())
    on conflict(day_id,kind,ref) do nothing;
  select count(*),md5(coalesce(jsonb_agg(jsonb_build_array(kind,ref,title,text,at,meta,excluded) order by kind,ref)::text,'')) into n,h from retro_activities where day_id=rid;
  if n>500 then raise exception 'activity_limit' using errcode='22023'; end if;
  update retro_days set activity_count=n,input_hash=h where id=rid;
  if d.input_hash is distinct from h or d.generation=0 then j:=private.queue_retro(rid); else j:=md5('retro-draft:'||rid||':'||d.generation)::uuid; end if;
  return jsonb_build_object('id',rid,'activity_count',n,'job_id',j);
end $$;

create or replace function public.claim_retro_draft(p_day uuid,p_revision int,p_generation int) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; token uuid:=gen_random_uuid(); activities jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into d from retro_days where id=p_day for update;
  if d.id is null or d.status<>'drafting' or p_revision is null or p_generation is null or d.revision is distinct from p_revision or d.generation is distinct from p_generation or d.lease_until>now() then return null; end if;
  if is_demo_department(d.dept_id) or not exists(select 1 from members where dept_id=d.dept_id and user_id=d.user_id and consented_at is not null) then return null; end if;
  update retro_days set lease=token,lease_until=now()+interval '2 minutes',updated_at=clock_timestamp() where id=p_day;
  select coalesce(jsonb_agg(to_jsonb(a) order by kind,at),'[]') into activities from retro_activities a where day_id=p_day and not excluded and private.retro_activity_live(a.id,d.user_id);
  return jsonb_build_object('day',to_jsonb(d)-'input_hash'-'lease'-'lease_until','lease',token,'activities',activities);
end $$;

create or replace function public.set_retro_visibility(p_day uuid,p_visibility text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; r retro_revisions;
begin
  d:=private.retro_owner(p_day);
  if p_visibility is null or p_visibility not in ('self','dept','leads_only') then raise exception 'invalid_visibility' using errcode='22023'; end if;
  if p_visibility<>'self' then
    select * into r from retro_revisions where day_id=p_day and revision=d.confirmed_revision;
    if r.day_id is null then raise exception 'not_confirmed' using errcode='22023'; end if;
    perform private.retro_validate(p_day,r.title,r.body,r.topics,p_visibility,true);
  end if;
  update retro_days set visibility=p_visibility where id=p_day;
end $$;
drop function public.begin_retro_connection(uuid,text,text,jsonb,text);
drop function public.consume_retro_connection_state(text,text);
drop function public.complete_retro_connection(text,uuid,text,text,text[]);
drop function public.withdraw_retro_share(uuid);
drop function public.schedule_retro_pulls();
drop function public.queue_retro_pulls(uuid);
drop function public.claim_retro_pull(uuid);
drop function public.save_retro_pull(uuid,uuid,date,jsonb,text);
drop function public.fail_retro_pull(uuid,uuid,text);
drop function public.refresh_retro_pull(uuid,uuid,text);
drop function private.retro_member(uuid,uuid);
drop table private.retro_connection_states;
alter table public.retro_activities drop column connection_id;
alter table public.retro_connections drop column auth_kind,drop column scopes,drop column consented_at,drop column lease,drop column lease_until,drop column last_requested_at;

drop function if exists private.retro_connection_member(uuid,uuid,text);
