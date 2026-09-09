create extension if not exists vector;

alter table public.items
  add column if not exists embedding vector(1536),
  add column if not exists embed_model text;

create index if not exists items_embedding_hnsw_idx
  on public.items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.search_as(
  p_user uuid,
  p_dept uuid,
  p_query vector(1536),
  p_limit int default 8
)
returns table (
  id uuid,
  source_id uuid,
  dept_id uuid,
  author text,
  spoken_at timestamptz,
  content text,
  source_kind text,
  source_external_id text,
  source_title text,
  source_visibility text,
  similarity real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    item.id,
    item.source_id,
    item.dept_id,
    item.author,
    item.spoken_at,
    item.content,
    source.kind,
    source.external_id,
    source.title,
    source.visibility,
    (1 - (item.embedding <=> p_query))::real as similarity
  from public.items as item
  join public.sources as source on source.id = item.source_id
  where item.dept_id = p_dept
    and item.deleted_at is null
    and item.embedding is not null
    and item.embed_model = 'text-embedding-3-small'
    and can_see(p_user, item.dept_id, source.visibility)
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by item.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

revoke all on function public.search_as(uuid, uuid, vector(1536), int) from public, anon;
grant execute on function public.search_as(uuid, uuid, vector(1536), int) to authenticated, service_role;

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
    and can_see(p_user, decision.dept_id, 'dept')
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by decision.decided_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 3), 20));
$$;

revoke all on function public.recent_decisions_as(uuid, uuid, int) from public, anon;
grant execute on function public.recent_decisions_as(uuid, uuid, int) to authenticated, service_role;
