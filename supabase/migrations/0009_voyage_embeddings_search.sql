-- D2 갱신: Voyage voyage-4-lite(1024차원)으로 임베딩 공간을 전환한다.
-- 기존 1536차원 벡터는 다른 공간이므로 섞지 않고 비운 뒤 재임베딩 job을 만든다.

drop index if exists public.items_embedding_hnsw_idx;
drop function if exists public.search_as(uuid, uuid, vector(1536), int);

update public.items as item
set
  embedding = null,
  embed_model = null,
  embed_status = case when item.deleted_at is null then 'pending' else item.embed_status end
from public.departments as department
join public.orgs as organization on organization.id = department.org_id
where item.dept_id = department.id
  and organization.is_demo = false;

alter table public.items
  alter column embedding type vector(1024)
  using null::vector(1024);

create index if not exists items_embedding_hnsw_idx
  on public.items using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create or replace function public.search_as(
  p_user uuid,
  p_dept uuid,
  p_query vector(1024),
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
    and item.embed_model = 'voyage-4-lite'
    and can_see(p_user, item.dept_id, source.visibility)
    and (
      auth.uid() = p_user
      or auth.role() = 'service_role'
    )
  order by item.embedding <=> p_query
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

revoke all on function public.search_as(uuid, uuid, vector(1024), int) from public, anon;
grant execute on function public.search_as(uuid, uuid, vector(1024), int) to authenticated, service_role;

insert into public.jobs (kind, payload)
select
  'embed',
  jsonb_build_object('itemId', item.id::text)
from public.items as item
join public.departments as department on department.id = item.dept_id
join public.orgs as organization on organization.id = department.org_id
where organization.is_demo = false
  and item.deleted_at is null
  and not exists (
    select 1
    from public.jobs as job
    where job.kind = 'embed'
      and job.status in ('queued', 'running')
      and job.payload ->> 'itemId' = item.id::text
  );
