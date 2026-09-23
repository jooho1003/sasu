-- ADR-066: rank visible, current decisions by relevance, regardless of age.
create function public.search_decisions_as(
  p_user uuid, p_dept uuid, p_query vector(1024), p_text text,
  p_limit int default 8, p_scope text default 'user'
)
returns table(id uuid, outcome text, rationale text, decided_at timestamptz, decided_by_name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope is null or p_scope not in ('user','channel') or p_query is null then
    raise exception using errcode='22023',message='invalid_search_scope';
  end if;
  return query
  with terms as (
    select distinct term from regexp_split_to_table(lower(left(coalesce(p_text,''),7000)), '[^[:alnum:]가-힣]+') term
    where length(term)>=2 order by term limit 32
  ), candidates as (
    select d.*,
      case when d.embedding is not null and d.embed_model='voyage-4-lite'
        then 1-(d.embedding <=> p_query) else 0 end semantic_score,
      (select count(*)::double precision from terms t where strpos(lower(d.outcome || E'\n' || d.rationale),t.term)>0)
        / greatest(1,(select count(*) from terms)) lexical_score
    from public.decisions d
    where d.dept_id=p_dept and public.can_see(p_user,d.dept_id,d.visibility)
      and (auth.uid()=p_user or auth.role()='service_role')
      and (p_scope='user' or d.visibility='dept')
      and not exists(select 1 from public.decisions replacement where replacement.supersedes_id=d.id)
  )
  select c.id,c.outcome,c.rationale,c.decided_at,c.decided_by_name
  from candidates c where c.semantic_score>0.25 or c.lexical_score>0
  order by (0.65*c.semantic_score+0.35*c.lexical_score) desc,c.decided_at desc nulls last,c.id
  limit greatest(1,least(coalesce(p_limit,8),20));
end $$;
revoke all on function public.search_decisions_as(uuid,uuid,vector,text,int,text) from public,anon;
grant execute on function public.search_decisions_as(uuid,uuid,vector,text,int,text) to authenticated,service_role;

-- Preserve citation numbering through storage and Slack delivery.
alter table public.citations add column ordinal integer check (ordinal > 0);

create or replace function public.complete_answer(
  p_answer_id uuid, p_answer text, p_refused boolean, p_error_code text, p_citations jsonb
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_answer public.answers%rowtype;
  v_citation jsonb;
  v_ordinal integer := 0;
begin
  select * into v_answer from public.answers where id = p_answer_id for update;
  if not found or v_answer.status <> 'pending' then return false; end if;
  if p_refused is null or p_citations is null or jsonb_typeof(p_citations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_answer_payload';
  end if;
  if not p_refused and jsonb_array_length(p_citations) = 0 then
    raise exception using errcode = '22023', message = 'citation_required';
  end if;
  for v_citation in select value from jsonb_array_elements(p_citations) loop
    if coalesce(v_citation->>'quote', '') = ''
      or ((v_citation->>'item_id' is null) = (v_citation->>'decision_id' is null)) then
      raise exception using errcode = '22023', message = 'invalid_citation';
    end if;
    v_ordinal := v_ordinal + 1;
    insert into public.citations(owner_kind, owner_id, item_id, decision_id, quote, ordinal)
    values ('answer', p_answer_id, (v_citation->>'item_id')::uuid,
      (v_citation->>'decision_id')::uuid, v_citation->>'quote', v_ordinal);
  end loop;
  update public.answers set
    status = case when p_refused then 'refused' else 'done' end,
    answer = p_answer, refused = p_refused, verified = true, error_code = p_error_code
  where id = p_answer_id;
  return true;
end;
$$;
revoke all on function public.complete_answer(uuid, text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_answer(uuid, text, boolean, text, jsonb) to service_role;

create or replace function public.claim_slack_answer_delivery(p_answer uuid,p_lease uuid)
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
    for c in select * from public.citations where owner_kind='answer' and owner_id=a.id order by ordinal nulls last,id loop
      if c.item_id is not null then
        select it.content,it.author,it.spoken_at,it.external_ref,s.external_id,s.kind,s.title into i
          from public.items it join public.sources s on s.id=it.source_id and s.dept_id=it.dept_id
          where it.id=c.item_id and it.dept_id=a.dept_id and it.deleted_at is null and s.active
            and public.can_see(a.asked_by,it.dept_id,s.visibility) and (v.scope='user' or s.visibility='dept');
        if not found or coalesce(c.quote,'')='' or position(c.quote in coalesce(i.content,''))=0 then v_valid:=false; exit; end if;
        v_citations:=v_citations||jsonb_build_array(jsonb_build_object('quote',c.quote,'author',i.author,'occurredAt',i.spoken_at,'source',coalesce(i.title,i.kind),'href',null,
          'itemId',c.item_id,'slackChannel',case when i.kind='slack_channel' then i.external_id end,'slackTs',case when i.kind='slack_channel' then i.external_ref end));
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

