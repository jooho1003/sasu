-- 카드 충돌 후보는 최근순이 아니라 현재 안건과 유사한 원장 결정을 우선한다.
alter table public.decisions
  add column embedding vector(1024),
  add column embed_model text;

create index decisions_embedding_hnsw_idx
  on public.decisions using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- 대체된 이전 결정은 원장 충돌 후보가 될 수 없다.
-- 이 함수는 워커(service_role)만 호출한다. 사용자 가시성 판정은 RLS/can_see() 경계를 우회하지 않는다.
create or replace function public.similar_decisions_for_card(
  p_dept uuid,
  p_query vector(1024),
  p_limit int default 3
)
returns table (
  id uuid,
  request_id uuid,
  outcome text,
  rationale text,
  decided_at timestamptz,
  visibility text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  return query
  select
    decision.id,
    decision.request_id,
    decision.outcome,
    decision.rationale,
    decision.decided_at,
    decision.visibility,
    1 - (decision.embedding <=> p_query) as similarity
  from public.decisions as decision
  where decision.dept_id = p_dept
    and decision.embedding is not null
    and decision.embed_model = 'voyage-4-lite'
    and not exists (
      select 1
      from public.decisions as replacement
      where replacement.supersedes_id = decision.id
    )
  order by decision.embedding <=> p_query, decision.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
end;
$$;

revoke all on function public.similar_decisions_for_card(uuid, vector, int)
  from public, anon, authenticated;
grant execute on function public.similar_decisions_for_card(uuid, vector, int)
  to service_role;

-- 모든 결정 생성 경로(웹·Slack RPC·직접 기록)는 이 append-only 삽입을 공유한다.
-- 배포 전 기존 결정은 scripts/backfill-decision-embeddings.ts에서 별도 큐잉한다.
create or replace function public.enqueue_decision_embedding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.jobs(kind, payload, run_after)
  values (
    'embed_decision',
    jsonb_build_object('decisionId', new.id),
    now()
  );
  return new;
end;
$$;

drop trigger if exists decisions_enqueue_embedding on public.decisions;
create trigger decisions_enqueue_embedding
after insert on public.decisions
for each row execute function public.enqueue_decision_embedding();
