-- PRD §6/§11: 채널은 member 범위, 답변은 질문자 소유, 인용과 완료 상태는 원자적으로 저장.
-- 기존 RPC 시그니처는 보존해 DB를 먼저 적용할 수 있다.
create or replace function public.search_channel_as(
  p_user uuid, p_dept uuid, p_query vector(1024), p_limit int default 8
)
returns table (
  id uuid, source_id uuid, dept_id uuid, author text, spoken_at timestamptz,
  content text, source_kind text, source_external_id text, source_title text,
  source_visibility text, similarity real
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select i.id, i.source_id, i.dept_id, i.author, i.spoken_at, i.content,
    s.kind, s.external_id, s.title, s.visibility, (1 - (i.embedding <=> p_query))::real
  from public.items i join public.sources s on s.id = i.source_id and s.dept_id = i.dept_id
  where i.dept_id = p_dept and i.deleted_at is null and i.embedding is not null
    and i.embed_model = 'voyage-4-lite' and s.visibility = 'dept'
    and public.can_see(p_user, i.dept_id, s.visibility)
    and (auth.uid() = p_user or auth.role() = 'service_role')
  order by i.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;
revoke all on function public.search_channel_as(uuid, uuid, vector, int) from public, anon;
grant execute on function public.search_channel_as(uuid, uuid, vector, int) to authenticated, service_role;

-- 원본 카드가 비공개이면 결정도 비공개. 직접 기록은 기존 사양의 dept.
create or replace function public.recent_decisions_as(p_user uuid, p_dept uuid, p_limit int default 3)
returns table (id uuid, outcome text, rationale text, decided_at timestamptz, decided_by_name text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.id, d.outcome, d.rationale, d.decided_at, d.decided_by_name
  from public.decisions d left join public.decision_requests r on r.id = d.request_id
  where d.dept_id = p_dept
    and (d.request_id is null or r.dept_id = d.dept_id)
    and public.can_see(p_user, d.dept_id, coalesce(r.visibility, 'dept'))
    and (auth.uid() = p_user or auth.role() = 'service_role')
  order by d.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

create or replace function public.recent_channel_decisions_as(p_user uuid, p_dept uuid, p_limit int default 3)
returns table (id uuid, outcome text, rationale text, decided_at timestamptz, decided_by_name text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.id, d.outcome, d.rationale, d.decided_at, d.decided_by_name
  from public.decisions d left join public.decision_requests r on r.id = d.request_id
  where d.dept_id = p_dept
    and (d.request_id is null or (r.dept_id = d.dept_id and r.visibility = 'dept'))
    and public.can_see(p_user, d.dept_id, 'dept')
    and (auth.uid() = p_user or auth.role() = 'service_role')
  order by d.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;
revoke all on function public.recent_channel_decisions_as(uuid, uuid, int) from public, anon;
grant execute on function public.recent_channel_decisions_as(uuid, uuid, int) to authenticated, service_role;

-- 0002의 permissive 부서 정책에 AND로 적용한다. 타인의 질문·답변은 직접 REST로도 읽지 못한다.
create policy answers_questioner_boundary on public.answers as restrictive
for all to authenticated
using (asked_by = auth.uid())
with check (asked_by = auth.uid());

create policy decisions_source_boundary on public.decisions as restrictive
for all to authenticated
using (
  request_id is null or exists (
    select 1 from public.decision_requests r
    where r.id = decisions.request_id and r.dept_id = decisions.dept_id
      and public.can_see(auth.uid(), r.dept_id, r.visibility)
  )
)
with check (
  decided_by = auth.uid() and (request_id is null or exists (
    select 1 from public.decision_requests r
    where r.id = decisions.request_id and r.dept_id = decisions.dept_id
      and public.can_see(auth.uid(), r.dept_id, r.visibility)
      and (r.assignee_id = auth.uid() or public.can_see(auth.uid(), r.dept_id, 'leads_only'))
  ))
);

create or replace function public.complete_answer(
  p_answer_id uuid, p_answer text, p_refused boolean, p_error_code text, p_citations jsonb
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_answer public.answers%rowtype;
  v_citation jsonb;
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
    insert into public.citations(owner_kind, owner_id, item_id, decision_id, quote)
    values ('answer', p_answer_id, (v_citation->>'item_id')::uuid,
      (v_citation->>'decision_id')::uuid, v_citation->>'quote');
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
