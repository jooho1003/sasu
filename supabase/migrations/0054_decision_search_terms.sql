-- ADR-067: strip a Korean particle once and prioritize the latest query terms.
create or replace function public.search_decisions_as(
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
    select normalized.term
    from (
      select case when length(stripped)>=2 then stripped else original end term, pos
      from (
        select term original, pos,
          regexp_replace(term, '(으로|에서|에게|한테|부터|까지|께서|처럼|보다|은|는|이|가|을|를|에|의|도|로|와|과|만)$', '') stripped
        from regexp_split_to_table(lower(left(coalesce(p_text,''),7000)), '[^[:alnum:]가-힣]+')
          with ordinality as words(term,pos)
      ) stripped_terms
    ) normalized
    where length(normalized.term)>=2
    group by normalized.term order by max(pos) desc limit 32
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

