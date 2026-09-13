-- PRD §6-3 ⑥: 최근 72시간 open 카드 중 코사인 유사도 0.85 이상만 병합한다.
-- 운영 적용 전 아래 읽기 쿼리가 0행인지 확인한다. 중복이 있으면 정리 방침 승인 전 중단한다.
-- select owner_kind, owner_id, item_id, count(*)
-- from public.citations
-- where item_id is not null
-- group by owner_kind, owner_id, item_id
-- having count(*) > 1;

create unique index citations_owner_item_unique
  on public.citations (owner_kind, owner_id, item_id)
  where item_id is not null;

create or replace function public.find_merge_target(
  p_dept uuid,
  p_query vector(1024),
  p_origin_visibility text,
  p_exclude_item uuid
)
returns table (
  request_id uuid,
  similarity real
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select candidate.request_id, candidate.similarity
  from (
    select
      request.id as request_id,
      max((1 - (item.embedding <=> p_query))::real) as similarity
    from public.decision_requests as request
    join public.citations as citation
      on citation.owner_kind = 'decision_request'
      and citation.owner_id = request.id
      and citation.item_id is not null
    join public.items as item on item.id = citation.item_id
    where request.dept_id = p_dept
      and request.status = 'open'
      and request.opened_at >= now() - interval '72 hours'
      and item.dept_id = p_dept
      and item.deleted_at is null
      and item.embedding is not null
      and item.id <> p_exclude_item
      and (
        p_origin_visibility = 'dept'
        or request.visibility = 'leads_only'
      )
    group by request.id
  ) as candidate
  where candidate.similarity >= 0.85
  order by candidate.similarity desc, candidate.request_id
  limit 1;
$$;

revoke all on function public.find_merge_target(uuid, vector(1024), text, uuid)
  from public, anon, authenticated;
grant execute on function public.find_merge_target(uuid, vector(1024), text, uuid)
  to service_role;
