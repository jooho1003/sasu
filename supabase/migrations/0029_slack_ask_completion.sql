-- Slack ASK uses the existing answers ledger and jobs worker. No raw inbox.
create function public.my_answer_evidence_valid(p_answer uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.answers a where a.id=p_answer and a.asked_by=auth.uid()
    and public.can_see(auth.uid(),a.dept_id,'dept') and a.verified is true
    and exists(select 1 from public.citations where owner_kind='answer' and owner_id=a.id)
    and not exists(
      select 1 from public.citations c
      left join public.items i on i.id=c.item_id
      left join public.sources s on s.id=i.source_id and s.dept_id=i.dept_id
      left join public.decisions d on d.id=c.decision_id
      where c.owner_kind='answer' and c.owner_id=a.id and not coalesce(
        (c.item_id is not null and c.decision_id is null and i.dept_id=a.dept_id and i.deleted_at is null and s.active
          and public.can_see(auth.uid(),i.dept_id,s.visibility) and length(c.quote)>0 and position(c.quote in i.content)>0)
        or (c.decision_id is not null and c.item_id is null and d.dept_id=a.dept_id
          and public.can_see(auth.uid(),d.dept_id,d.visibility) and length(c.quote)>0 and position(c.quote in d.outcome||E'\n'||d.rationale)>0),false)
    ));
$$;
revoke all on function public.my_answer_evidence_valid(uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_answer_evidence_valid(uuid) to authenticated;
create policy answers_current_evidence on public.answers as restrictive for select to authenticated
using (status<>'done' or public.my_answer_evidence_valid(id));

-- One Slack identity may belong to multiple departments of the same web user.
alter table public.members drop constraint members_slack_user_id_key;
create unique index members_dept_slack_user on public.members(dept_id,slack_user_id) where slack_user_id is not null;
create function public.enforce_slack_identity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.slack_user_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.slack_user_id,30));
  if exists(select 1 from public.members where slack_user_id=new.slack_user_id and user_id<>new.user_id) then
    raise exception using errcode='23505',message='slack_identity_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_slack_identity() from public,anon,authenticated,service_role;
create trigger members_slack_identity before insert or update of slack_user_id,user_id on public.members for each row execute function public.enforce_slack_identity();

create table public.slack_answer_deliveries (
  answer_id uuid primary key references public.answers(id) on delete cascade,
  source_id uuid references public.sources(id),
  slack_user_id text not null,
  channel text not null,
  thread_ts text not null,
  scope text not null check (scope in ('user','channel')),
  message_ts text,
  state text not null default 'pending' check (state in ('pending','sent','failed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  check ((scope='user' and channel ~ '^D[A-Z0-9]+$') or (scope='channel' and channel ~ '^[CG][A-Z0-9]+$' and source_id is not null))
);
alter table public.slack_answer_deliveries enable row level security;
revoke all on public.slack_answer_deliveries from public, anon, authenticated;
grant all on public.slack_answer_deliveries to service_role;

-- Only membership names and consent flags; never question/evidence contents.
create function public.slack_question_context(p_author text, p_channel text, p_dm boolean)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'consented',m.consented_at is not null) order by d.name,d.id),'[]'::jsonb)
  from public.members m join public.departments d on d.id=m.dept_id
  join public.orgs o on o.id=d.org_id
  where m.slack_user_id=p_author and not o.is_demo
    and ((p_dm and p_channel ~ '^D[A-Z0-9]+$') or
      (not p_dm and p_channel ~ '^[CG][A-Z0-9]+$' and exists
        (select 1 from public.sources s where s.dept_id=d.id and s.kind='slack_channel' and s.external_id=p_channel and s.active)));
$$;
revoke all on function public.slack_question_context(text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.slack_question_context(text,text,boolean) to service_role;

create function public.ingest_slack_question(p_event text,p_author text,p_channel text,p_thread text,p_dept uuid,p_content text,p_dm boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_member public.members%rowtype; v_source uuid; v_answer uuid; v_event text;
begin
  if coalesce(p_event,'')='' or coalesce(p_thread,'') !~ '^[0-9]+\.[0-9]+$' or length(coalesce(p_content,'')) not between 5 and 1000
    or p_dm is null or (p_dm and p_channel !~ '^D[A-Z0-9]+$') or (not p_dm and p_channel !~ '^[CG][A-Z0-9]+$') then
    raise exception using errcode='22023',message='invalid_question';
  end if;
  select m.* into v_member from public.members m join public.departments d on d.id=m.dept_id join public.orgs o on o.id=d.org_id
    where m.slack_user_id=p_author and m.dept_id=p_dept and not o.is_demo for share of m,d,o;
  if not found then return jsonb_build_object('status','not_connected'); end if;
  if v_member.consented_at is null then return jsonb_build_object('status','consent_required'); end if;
  if not p_dm then
    select id into v_source from public.sources where dept_id=p_dept and kind='slack_channel' and external_id=p_channel and active for share;
    if not found then return jsonb_build_object('status','not_connected'); end if;
  end if;
  -- Serialize per questioner across web, DM and channel daily-limit checks.
  perform pg_advisory_xact_lock(hashtextextended(v_member.user_id::text,29));
  insert into public.ingest_events(event_id) values(p_event) on conflict do nothing returning event_id into v_event;
  if v_event is null then return jsonb_build_object('status','duplicate'); end if;
  begin
    insert into public.answers(dept_id,asked_by,question,status) values(p_dept,v_member.user_id,p_content,'pending') returning id into v_answer;
  exception when sqlstate 'P0001' then
    if sqlerrm='ask_daily_limit' then return jsonb_build_object('status','rate_limited'); end if;
    raise;
  end;
  insert into public.slack_answer_deliveries(answer_id,source_id,slack_user_id,channel,thread_ts,scope)
    values(v_answer,v_source,p_author,p_channel,p_thread,case when p_dm then 'user' else 'channel' end);
  -- Progress precedes generation in the normal sequential worker batch.
  insert into public.jobs(id,kind,payload) values(md5('slack-progress:'||v_answer)::uuid,'deliver_slack_answer',jsonb_build_object('answerId',v_answer));
  insert into public.jobs(kind,payload) values('answer',jsonb_build_object('answerId',v_answer,'slackReply',jsonb_build_object(
    'channel',p_channel,'threadTs',p_thread,'scope',case when p_dm then 'user' else 'channel' end,'durable',true)));
  return jsonb_build_object('status','saved','answer_id',v_answer);
end;
$$;
revoke all on function public.ingest_slack_question(text,text,text,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ingest_slack_question(text,text,text,text,uuid,text,boolean) to service_role;

create function public.enqueue_slack_answer_delivery() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status in ('done','refused','failed') and old.status is distinct from new.status
    and exists(select 1 from public.slack_answer_deliveries where answer_id=new.id) then
    insert into public.jobs(id,kind,payload) values(md5('slack-result:'||new.id)::uuid,'deliver_slack_answer',jsonb_build_object('answerId',new.id)) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_slack_answer_delivery() from public,anon,authenticated,service_role;
create trigger answers_slack_delivery after update of status on public.answers for each row execute function public.enqueue_slack_answer_delivery();

-- Revalidate all evidence at delivery time, including role/source changes since generation.
create function public.claim_slack_answer_delivery(p_answer uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.slack_answer_deliveries%rowtype; a public.answers%rowtype; c record; i record; d record;
  v_citations jsonb:='[]'; v_valid boolean:=true; v_status text;
begin
  if p_lease is null then raise exception using errcode='22023',message='lease_required'; end if;
  select * into v from public.slack_answer_deliveries where answer_id=p_answer for update;
  if not found or v.state in ('sent','cancelled') then return null; end if;
  if v.lease_until>now() then return jsonb_build_object('busy',true,'retry_after_seconds',ceil(extract(epoch from v.lease_until-now()))+1); end if;
  select * into a from public.answers where id=p_answer;
  if not found or not exists(select 1 from public.members m join public.departments dep on dep.id=m.dept_id join public.orgs o on o.id=dep.org_id
    where m.user_id=a.asked_by and m.dept_id=a.dept_id and m.slack_user_id=v.slack_user_id and m.consented_at is not null and not o.is_demo)
    or (v.scope='channel' and not exists(select 1 from public.sources where id=v.source_id and dept_id=a.dept_id and external_id=v.channel and kind='slack_channel' and active)) then
    update public.slack_answer_deliveries set state='cancelled',lease_token=null,lease_until=null,last_error='access_changed',updated_at=now() where answer_id=p_answer;
    return null;
  end if;
  v_status:=a.status;
  if a.status='done' then
    for c in select * from public.citations where owner_kind='answer' and owner_id=a.id loop
      if c.item_id is not null then
        select it.content,it.author,it.spoken_at,it.external_ref,s.external_id,s.kind,s.title into i
          from public.items it join public.sources s on s.id=it.source_id and s.dept_id=it.dept_id
          where it.id=c.item_id and it.dept_id=a.dept_id and it.deleted_at is null and s.active
            and public.can_see(a.asked_by,it.dept_id,s.visibility) and (v.scope='user' or s.visibility='dept');
        if not found or coalesce(c.quote,'')='' or position(c.quote in coalesce(i.content,''))=0 then v_valid:=false; exit; end if;
        v_citations:=v_citations||jsonb_build_array(jsonb_build_object('quote',c.quote,'author',i.author,'occurredAt',i.spoken_at,'source',coalesce(i.title,i.kind),'href',null,
          'slackChannel',case when i.kind='slack_channel' then i.external_id end,'slackTs',case when i.kind='slack_channel' then i.external_ref end));
      elsif c.decision_id is not null then
        select dec.* into d from public.decisions dec where dec.id=c.decision_id and dec.dept_id=a.dept_id
          and public.can_see(a.asked_by,dec.dept_id,dec.visibility) and (v.scope='user' or dec.visibility='dept');
        if not found or coalesce(c.quote,'')='' or position(c.quote in coalesce(d.outcome,'')||E'\n'||coalesce(d.rationale,''))=0 then v_valid:=false; exit; end if;
        v_citations:=v_citations||jsonb_build_array(jsonb_build_object('quote',c.quote,'author',d.decided_by_name,'occurredAt',d.decided_at,'source','결정 원장','href',null,'decisionId',d.id));
      else v_valid:=false; exit;
      end if;
    end loop;
    if not v_valid or jsonb_array_length(v_citations)=0 or a.verified is not true then v_status:='refused'; v_citations:='[]'; end if;
  end if;
  update public.slack_answer_deliveries set lease_token=p_lease,lease_until=now()+interval '2 minutes',updated_at=now() where answer_id=p_answer;
  return jsonb_build_object('answer_id',a.id,'dept_id',a.dept_id,'channel',v.channel,'thread_ts',v.thread_ts,'message_ts',v.message_ts,
    'scope',v.scope,'status',v_status,'answer',case when v_status='done' then a.answer end,'citations',v_citations);
end;
$$;
revoke all on function public.claim_slack_answer_delivery(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_slack_answer_delivery(uuid,uuid) to service_role;

create function public.record_slack_answer_message(p_answer uuid,p_lease uuid,p_message_ts text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(p_message_ts,'') !~ '^[0-9]+\.[0-9]+$' then return false; end if;
  update public.slack_answer_deliveries set message_ts=p_message_ts,updated_at=now()
    where answer_id=p_answer and lease_token=p_lease and lease_until>now() and message_ts is null;
  return found;
end;
$$;
create function public.finish_slack_answer_delivery(p_answer uuid,p_lease uuid,p_message_ts text,p_sent boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.slack_answer_deliveries set state=case when p_sent then 'sent' else 'pending' end,
    lease_token=null,lease_until=null,last_error=null,updated_at=now()
    where answer_id=p_answer and lease_token=p_lease and lease_until>now() and message_ts=p_message_ts;
  return found;
end;
$$;
create function public.release_slack_answer_delivery(p_answer uuid,p_lease uuid,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.slack_answer_deliveries set state='failed',lease_token=null,lease_until=null,
    last_error=case when p_error in ('slack_not_configured','slack_rate_limited','slack_api_failed','slack_dm_unavailable','slack_message_missing') then p_error else 'slack_api_failed' end,updated_at=now()
    where answer_id=p_answer and lease_token=p_lease;
  return found;
end;
$$;
revoke all on function public.record_slack_answer_message(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.finish_slack_answer_delivery(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.release_slack_answer_delivery(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_slack_answer_message(uuid,uuid,text) to service_role;
grant execute on function public.finish_slack_answer_delivery(uuid,uuid,text,boolean) to service_role;
grant execute on function public.release_slack_answer_delivery(uuid,uuid,text) to service_role;

create function public.my_slack_questions(p_dept uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from (
    select a.id,a.question,a.status,a.created_at,
      case when s.state='failed' and exists(select 1 from public.jobs j where j.kind='deliver_slack_answer' and j.payload->>'answerId'=a.id::text and j.status in ('queued','running')) then 'pending' else s.state end as delivery_state
    from public.answers a join public.slack_answer_deliveries s on s.answer_id=a.id
    join public.departments d on d.id=a.dept_id join public.orgs o on o.id=d.org_id
    where a.dept_id=p_dept and a.asked_by=auth.uid() and not o.is_demo and public.can_see(auth.uid(),a.dept_id,'dept')
    order by a.created_at desc limit 10
  ) r;
$$;
create function public.retry_my_slack_answer(p_dept uuid,p_answer uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.slack_answer_deliveries%rowtype; v_job uuid;
begin
  if not exists(select 1 from public.answers a join public.departments d on d.id=a.dept_id join public.orgs o on o.id=d.org_id
    join public.members m on m.dept_id=a.dept_id and m.user_id=a.asked_by
    where a.id=p_answer and a.dept_id=p_dept and a.asked_by=auth.uid() and a.status in ('done','refused','failed')
      and not o.is_demo and m.consented_at is not null and public.can_see(auth.uid(),a.dept_id,'dept')) then
    raise exception using errcode='42501',message='forbidden';
  end if;
  select * into v from public.slack_answer_deliveries where answer_id=p_answer for update;
  if not found or v.state<>'failed' or v.lease_until>now() then return false; end if;
  v_job:=md5('slack-result:'||p_answer)::uuid;
  update public.jobs set status='queued',attempts=0,run_after=now(),lease_until=null,last_error=null,updated_at=now()
    where id=v_job and status='failed';
  if not found then return false; end if;
  update public.slack_answer_deliveries set state='pending',message_ts=case when v.last_error='slack_message_missing' then null else message_ts end,
    last_error=null,lease_token=null,lease_until=null,updated_at=now() where answer_id=p_answer;
  return true;
end;
$$;
revoke all on function public.my_slack_questions(uuid) from public,anon,authenticated,service_role;
revoke all on function public.retry_my_slack_answer(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.my_slack_questions(uuid) to authenticated;
grant execute on function public.retry_my_slack_answer(uuid,uuid) to authenticated;

-- A process dying during its final job lease must expose a retryable status too.
create function public.slack_delivery_job_failed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.kind='deliver_slack_answer' and new.status='failed' and old.status is distinct from new.status then
    update public.slack_answer_deliveries s set state='failed',last_error=coalesce(s.last_error,'slack_api_failed'),updated_at=now()
      where s.answer_id::text=new.payload->>'answerId' and s.state not in ('sent','cancelled')
        and exists(select 1 from public.answers a where a.id=s.answer_id and a.status<>'pending');
  end if;
  return new;
end;
$$;
revoke all on function public.slack_delivery_job_failed() from public,anon,authenticated,service_role;
create trigger jobs_slack_delivery_failed after update of status on public.jobs for each row execute function public.slack_delivery_job_failed();

-- The shared INSERT trigger serializes daily counts for web and Slack equally.
create or replace function public.enforce_ask_daily_limit() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_kst_day_start timestamptz;
begin
  if new.asked_by is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.asked_by::text,29));
  v_kst_day_start:=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if (select count(*) from public.answers where asked_by=new.asked_by and created_at>=v_kst_day_start and created_at<v_kst_day_start+interval '1 day')>=50 then
    raise exception 'ask_daily_limit' using errcode='P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_ask_daily_limit() from public,anon,authenticated,service_role;
