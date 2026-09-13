-- 읽기 권한이 카드·원장·회의 파생 데이터의 직접 쓰기 권한이 되지 않게 한다.
-- 사용자 명령은 아래 SECURITY DEFINER RPC가 auth.uid()와 can_see()를 다시 검증한다.

-- 결정 가시성은 카드 유무가 아니라 결정 행 자체의 고정 값으로 판정한다.
alter table public.decisions add column visibility text;

update public.decisions as decision
set visibility = case
  when decision.request_id is not null then coalesce(
    (
      select request.visibility
      from public.decision_requests as request
      where request.id = decision.request_id
        and request.dept_id = decision.dept_id
    ),
    'dept'
  )
  when exists (
    select 1
    from public.citations as citation
    join public.items as item on item.id = citation.item_id
    join public.sources as source
      on source.id = item.source_id
      and source.dept_id = item.dept_id
    where citation.owner_kind = 'decision'
      and citation.owner_id = decision.id
      and item.dept_id = decision.dept_id
      and source.visibility = 'leads_only'
  ) then 'leads_only'
  else 'dept'
end;

alter table public.decisions
  alter column visibility set default 'dept',
  alter column visibility set not null,
  add constraint decisions_visibility_check
    check (visibility in ('dept', 'leads_only'));

-- decision_requests: authenticated는 can_see()가 허용한 행을 읽기만 한다.
drop policy if exists decision_requests_visible_access on public.decision_requests;
create policy decision_requests_visible_access
on public.decision_requests
for select
to authenticated
using (public.can_see(auth.uid(), dept_id, visibility));

revoke insert, update, delete on public.decision_requests from anon, authenticated;

-- conflicts: 카드와 과거 결정 모두를 볼 수 있을 때만 읽고, 쓰기는 워커에만 맡긴다.
drop policy if exists conflicts_owner_access on public.conflicts;
create policy conflicts_owner_access
on public.conflicts
for select
to authenticated
using (
  exists (
    select 1
    from public.decision_requests as request
    join public.decisions as prior_decision
      on prior_decision.id = conflicts.prior_decision_id
    where request.id = conflicts.request_id
      and public.can_see(auth.uid(), request.dept_id, request.visibility)
      and public.can_see(
        auth.uid(),
        prior_decision.dept_id,
        prior_decision.visibility
      )
  )
);

revoke insert, update, delete on public.conflicts from anon, authenticated;

-- meetings: 읽기는 소스 가시성을 따르고, 전사 업로드용 생성만 lead에게 연다.
drop policy if exists meetings_source_access on public.meetings;
create policy meetings_source_access
on public.meetings
for select
to authenticated
using (
  exists (
    select 1
    from public.sources as source
    where source.id = meetings.source_id
      and source.dept_id = meetings.dept_id
      and public.can_see(auth.uid(), source.dept_id, source.visibility)
  )
);

create policy meetings_lead_insert
on public.meetings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.sources as source
    where source.id = meetings.source_id
      and source.dept_id = meetings.dept_id
      and public.can_see(auth.uid(), source.dept_id, source.visibility)
      and public.can_see(auth.uid(), source.dept_id, 'leads_only')
  )
);

revoke insert, update, delete on public.meetings from anon, authenticated;
grant insert on public.meetings to authenticated;

-- 결정은 visibility를 can_see()에 넘겨 읽고, 생성은 명령 RPC만 허용한다.
drop policy if exists decisions_department_access on public.decisions;
create policy decisions_department_access
on public.decisions
for select
to authenticated
using (public.can_see(auth.uid(), dept_id, visibility));

drop policy if exists decisions_source_boundary on public.decisions;
create policy decisions_source_boundary
on public.decisions as restrictive
for select
to authenticated
using (public.can_see(auth.uid(), dept_id, visibility));

revoke insert, update, delete on public.decisions from anon, authenticated;

-- 인용도 소유 결정과 참조 결정의 고정 visibility를 사용한다.
drop policy if exists citations_owner_access on public.citations;
create policy citations_owner_access
on public.citations
for select
to authenticated
using (
  (
    (
      (owner_kind = 'decision_request' and exists (
        select 1
        from public.decision_requests as request
        where request.id = citations.owner_id
          and public.can_see(auth.uid(), request.dept_id, request.visibility)
      ))
      or (owner_kind = 'decision' and exists (
        select 1
        from public.decisions as decision
        where decision.id = citations.owner_id
          and public.can_see(
            auth.uid(),
            decision.dept_id,
            decision.visibility
          )
      ))
      or (owner_kind = 'answer' and exists (
        select 1
        from public.answers as answer
        where answer.id = citations.owner_id
          and public.can_see(auth.uid(), answer.dept_id, 'dept')
      ))
    )
    and (
      item_id is null
      or exists (
        select 1
        from public.items as item
        join public.sources as source on source.id = item.source_id
        where item.id = citations.item_id
          and source.dept_id = item.dept_id
          and public.can_see(auth.uid(), item.dept_id, source.visibility)
      )
    )
    and (
      decision_id is null
      or exists (
        select 1
        from public.decisions as cited_decision
        where cited_decision.id = citations.decision_id
          and public.can_see(
            auth.uid(),
            cited_decision.dept_id,
            cited_decision.visibility
          )
      )
    )
  )
);

revoke insert, update, delete on public.citations from anon, authenticated;

-- 사용자/채널 검색 모두 decisions.visibility를 can_see()의 유일한 입력으로 쓴다.
create or replace function public.recent_decisions_as(
  p_user uuid,
  p_dept uuid,
  p_limit int default 3
)
returns table (
  id uuid,
  outcome text,
  rationale text,
  decided_at timestamptz,
  decided_by_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    decision.id,
    decision.outcome,
    decision.rationale,
    decision.decided_at,
    decision.decided_by_name
  from public.decisions as decision
  where decision.dept_id = p_dept
    and public.can_see(
      p_user,
      decision.dept_id,
      decision.visibility
    )
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by decision.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

revoke all on function public.recent_decisions_as(uuid, uuid, int) from public, anon;
grant execute on function public.recent_decisions_as(uuid, uuid, int) to authenticated, service_role;

create or replace function public.recent_channel_decisions_as(
  p_user uuid,
  p_dept uuid,
  p_limit int default 3
)
returns table (
  id uuid,
  outcome text,
  rationale text,
  decided_at timestamptz,
  decided_by_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    decision.id,
    decision.outcome,
    decision.rationale,
    decision.decided_at,
    decision.decided_by_name
  from public.decisions as decision
  where decision.dept_id = p_dept
    and decision.visibility = 'dept'
    and public.can_see(
      p_user,
      decision.dept_id,
      decision.visibility
    )
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by decision.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

revoke all on function public.recent_channel_decisions_as(uuid, uuid, int) from public, anon;
grant execute on function public.recent_channel_decisions_as(uuid, uuid, int) to authenticated, service_role;

-- 승격 대상의 부서와 권한은 item/source에서 정하고, jobs는 사용자에게 직접 열지 않는다.
create or replace function public.promote_item(p_item uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_job uuid;
begin
  if auth.role() <> 'authenticated' or v_user is null then
    raise exception using errcode = '42501', message = 'authenticated_required';
  end if;

  perform 1
  from public.items as item
  join public.sources as source
    on source.id = item.source_id
    and source.dept_id = item.dept_id
  where item.id = p_item
    and item.deleted_at is null
    and public.can_see(v_user, item.dept_id, source.visibility)
  for share of item, source;

  if not found then
    raise exception using errcode = '42501', message = 'item_not_visible';
  end if;

  select request.id
  into v_existing
  from public.decision_requests as request
  where request.origin_item_id = p_item
    and request.status = 'open'
  order by request.opened_at, request.id
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_job := gen_random_uuid();
  insert into public.jobs(id, kind, payload, run_after)
  values (v_job, 'make_card', jsonb_build_object('itemId', p_item), now());

  return v_job;
end;
$$;

revoke all on function public.promote_item(uuid) from public, anon, service_role;
grant execute on function public.promote_item(uuid) to authenticated;

-- 웹과 Slack이 같은 잠금·권한·상태 전이 규칙을 공유한다.
create or replace function public.decide_request_for_actor(
  p_user uuid,
  p_request uuid,
  p_action text,
  p_outcome text,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.decision_requests%rowtype;
  v_member public.members%rowtype;
  v_existing public.decisions%rowtype;
  v_decision public.decisions%rowtype;
  v_target text;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_lead_time_min int;
begin
  if p_user is null then
    raise exception using errcode = '42501', message = 'member_required';
  end if;

  if p_action is null or p_action not in ('decide', 'defer', 'reject', 'reopen') then
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;

  select *
  into v_request
  from public.decision_requests as request
  where request.id = p_request
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'request_not_found';
  end if;

  select *
  into v_member
  from public.members as member
  where member.user_id = p_user
    and member.dept_id = v_request.dept_id;

  if not found then
    raise exception using errcode = '42501', message = 'member_required';
  end if;

  if p_action = 'reopen' then
    if v_member.role <> 'lead' then
      raise exception using errcode = '42501', message = 'lead_required';
    end if;
    v_target := 'open';
  else
    if v_member.role <> 'lead' and v_request.assignee_id is distinct from p_user then
      raise exception using errcode = '42501', message = 'assignee_or_lead_required';
    end if;
    v_target := case p_action
      when 'decide' then 'decided'
      when 'defer' then 'deferred'
      when 'reject' then 'rejected'
    end;
  end if;

  if v_request.status = 'needs_review' and v_member.role <> 'lead' then
    raise exception using errcode = '42501', message = 'lead_required';
  end if;

  if p_action = 'decide' then
    select *
    into v_existing
    from public.decisions as decision
    where decision.request_id = v_request.id;

    if found then
      return jsonb_build_object(
        'ok', true,
        'duplicate', true,
        'status', 'decided',
        'decision_id', v_existing.id,
        'decided_by_name', v_existing.decided_by_name,
        'decided_at', v_existing.decided_at
      );
    end if;
  end if;

  v_allowed := case v_request.status
    when 'open' then v_target in ('decided', 'deferred', 'rejected')
    when 'deferred' then v_target = 'open'
    when 'rejected' then v_target = 'open'
    when 'needs_review' then v_target in ('open', 'rejected')
    else false
  end;

  if not v_allowed then
    raise exception using errcode = '23514', message = 'invalid_transition';
  end if;

  if p_action <> 'decide' then
    update public.decision_requests
    set status = v_target,
        closed_at = case when v_target = 'rejected' then v_now else null end
    where id = v_request.id;

    return jsonb_build_object(
      'ok', true,
      'duplicate', false,
      'status', v_target,
      'decision_id', null,
      'decided_by_name', null,
      'decided_at', null
    );
  end if;

  if nullif(btrim(p_outcome), '') is null
     or nullif(btrim(p_rationale), '') is null then
    raise exception using errcode = '22023', message = 'decision_fields_required';
  end if;

  v_lead_time_min := greatest(
    0,
    floor(extract(epoch from (v_now - coalesce(v_request.opened_at, v_now))) / 60)::int
  );

  insert into public.decisions(
    dept_id,
    request_id,
    decided_by,
    decided_by_name,
    decided_at,
    outcome,
    rationale,
    supersedes_id,
    lead_time_min,
    visibility
  )
  values (
    v_request.dept_id,
    v_request.id,
    v_member.user_id,
    v_member.display_name,
    v_now,
    btrim(p_outcome),
    btrim(p_rationale),
    null,
    v_lead_time_min,
    v_request.visibility
  )
  returning * into v_decision;

  -- 기존 경로와 같이 카드 인용은 카드 소유로 유지하고 결정 인용으로 복제하지 않는다.
  update public.decision_requests
  set status = 'decided',
      closed_at = v_now
  where id = v_request.id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'status', 'decided',
    'decision_id', v_decision.id,
    'decided_by_name', v_decision.decided_by_name,
    'decided_at', v_decision.decided_at
  );
end;
$$;

revoke all on function public.decide_request_for_actor(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.decide_request(
  p_request uuid,
  p_action text,
  p_outcome text,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'authenticated_required';
  end if;

  return public.decide_request_for_actor(
    auth.uid(),
    p_request,
    p_action,
    p_outcome,
    p_rationale
  );
end;
$$;

revoke all on function public.decide_request(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.decide_request(uuid, text, text, text)
  to authenticated;

create or replace function public.decide_request_as(
  p_user uuid,
  p_request uuid,
  p_action text,
  p_outcome text,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  return public.decide_request_for_actor(
    p_user,
    p_request,
    p_action,
    p_outcome,
    p_rationale
  );
end;
$$;

revoke all on function public.decide_request_as(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.decide_request_as(uuid, uuid, text, text, text)
  to service_role;

-- 직접 결정과 인용은 한 트랜잭션에서 검증·가시성 계산·저장한다.
create or replace function public.record_direct_decision(
  p_dept uuid,
  p_outcome text,
  p_rationale text,
  p_citations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_member public.members%rowtype;
  v_citation jsonb;
  v_item_id uuid;
  v_quote text;
  v_content text;
  v_item_visibility text;
  v_visibility text := 'dept';
  v_decision_id uuid;
begin
  if auth.role() <> 'authenticated' or v_user is null then
    raise exception using errcode = '42501', message = 'authenticated_required';
  end if;

  if nullif(btrim(p_outcome), '') is null
     or nullif(btrim(p_rationale), '') is null
     or p_citations is null
     or jsonb_typeof(p_citations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_direct_decision';
  end if;

  select *
  into v_member
  from public.members as member
  where member.user_id = v_user
    and member.dept_id = p_dept;

  if not found or not public.can_see(v_user, p_dept, 'dept') then
    raise exception using errcode = '42501', message = 'member_required';
  end if;

  for v_citation in
    select value from jsonb_array_elements(p_citations)
  loop
    if jsonb_typeof(v_citation) <> 'object'
       or nullif(btrim(v_citation->>'item_id'), '') is null
       or nullif(v_citation->>'quote', '') is null then
      raise exception using errcode = '22023', message = 'invalid_citation';
    end if;

    v_item_id := (v_citation->>'item_id')::uuid;
    v_quote := v_citation->>'quote';

    select item.content, source.visibility
    into v_content, v_item_visibility
    from public.items as item
    join public.sources as source
      on source.id = item.source_id
      and source.dept_id = item.dept_id
    where item.id = v_item_id
      and item.dept_id = p_dept
      and item.deleted_at is null
      and public.can_see(v_user, item.dept_id, source.visibility)
    for share of item, source;

    if not found then
      raise exception using errcode = '42501', message = 'citation_item_not_visible';
    end if;

    if position(v_quote in v_content) = 0 then
      raise exception using errcode = '22023', message = 'citation_quote_mismatch';
    end if;

    if v_item_visibility = 'leads_only' then
      v_visibility := 'leads_only';
    end if;
  end loop;

  insert into public.decisions(
    dept_id,
    request_id,
    decided_by,
    decided_by_name,
    outcome,
    rationale,
    supersedes_id,
    lead_time_min,
    visibility
  )
  values (
    p_dept,
    null,
    v_member.user_id,
    v_member.display_name,
    btrim(p_outcome),
    btrim(p_rationale),
    null,
    null,
    v_visibility
  )
  returning id into v_decision_id;

  for v_citation in
    select value from jsonb_array_elements(p_citations)
  loop
    insert into public.citations(
      owner_kind,
      owner_id,
      item_id,
      decision_id,
      quote
    )
    values (
      'decision',
      v_decision_id,
      (v_citation->>'item_id')::uuid,
      null,
      v_citation->>'quote'
    );
  end loop;

  return v_decision_id;
end;
$$;

revoke all on function public.record_direct_decision(uuid, text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.record_direct_decision(uuid, text, text, jsonb)
  to authenticated;
