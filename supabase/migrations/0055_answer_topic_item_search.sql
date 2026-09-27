-- Status questions also need same-topic records that semantic top-eight retrieval misses.
create or replace function public.search_topic_items_as(
  p_user uuid, p_dept uuid, p_terms text[], p_limit int default 8, p_scope text default 'user'
)
returns table (
  id uuid, source_id uuid, dept_id uuid, author text, spoken_at timestamptz,
  content text, source_kind text, source_external_id text, source_title text,
  source_visibility text, similarity real
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope is null or p_scope not in ('user','channel') or p_terms is null
    or cardinality(p_terms)>12 then
    raise exception using errcode='22023',message='invalid_search_scope';
  end if;
  return query
  with terms as (
    select lower(btrim(left(word.term,100))) as term
    from unnest(p_terms) with ordinality as word(term,pos)
    where length(btrim(left(word.term,100))) >= 2
    order by word.pos limit 12
  )
  select item.id,item.source_id,item.dept_id,item.author,item.spoken_at,item.content,
    source.kind,source.external_id,source.title,source.visibility,0::real
  from public.items item
  join public.sources source on source.id=item.source_id
  where item.dept_id=p_dept and item.deleted_at is null
    and public.can_see(p_user,item.dept_id,source.visibility)
    and (auth.uid()=p_user or auth.role()='service_role')
    and (p_scope='user' or source.visibility='dept')
    and exists(select 1 from terms)
    and not exists(select 1 from terms t where strpos(lower(item.content),t.term)=0)
  order by item.spoken_at desc nulls last,item.id
  limit greatest(1,least(coalesce(p_limit,8),8));
end $$;

revoke all on function public.search_topic_items_as(uuid,uuid,text[],int,text) from public,anon;
grant execute on function public.search_topic_items_as(uuid,uuid,text[],int,text) to authenticated,service_role;
