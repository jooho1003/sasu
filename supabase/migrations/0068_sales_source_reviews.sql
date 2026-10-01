-- ADR-080: quotes stay in items; tasks retain only IDs, versions, and paragraph indices.
create table public.sales_source_reviews (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.departments(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  item_ids uuid[] not null check (cardinality(item_ids)=4 and array_position(item_ids,null) is null),
  versions text[] not null check (cardinality(versions)=4 and array_position(versions,null) is null),
  status text not null default 'queued' check (status in ('queued','processing','ready','refused','failed')),
  status_reason text,
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(dept_id,requested_by,client_request_id),
  check ((status='ready')=(result is not null))
);
create index sales_source_reviews_owner on public.sales_source_reviews(requested_by,dept_id,created_at desc);

create function public.sales_source_utf16_length(p_text text)
returns integer language sql immutable set search_path=public,pg_temp as $$
  select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)::integer
  from regexp_split_to_table(p_text,'') ch
$$;
create function public.sales_source_text_fits(p_text text)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare v_part text; v_count integer:=0;
begin
  if p_text is null or public.sales_source_utf16_length(p_text)>20000 then return false; end if;
  foreach v_part in array regexp_split_to_array(p_text,E'\\r?\\n[\\t ]*\\r?\\n') loop
    if btrim(v_part,E' \\t\\r\\n')<>'' then
      v_count:=v_count+1;
      if v_count>80 or public.sales_source_utf16_length(btrim(v_part,E' \\t\\r\\n'))>4000 then return false; end if;
    end if;
  end loop;
  return v_count>0;
end $$;

-- One current authority predicate used by RLS, request, claim, and finish.
create function public.sales_source_review_inputs(p_user uuid,p_dept uuid,p_ids uuid[],p_versions text[] default null)
returns table("position" integer,item_id uuid,title text,kind text,content text,version text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if (auth.uid() is distinct from p_user and coalesce(auth.role(),'')<>'service_role')
    or p_user is null or p_dept is null or cardinality(p_ids) is distinct from 4
    or (select count(distinct v) from unnest(p_ids) v)<>4
    or (p_versions is not null and cardinality(p_versions)<>4)
    or not exists(select 1 from public.members m where m.dept_id=p_dept and m.user_id=p_user and m.role='lead' and m.consented_at is not null)
    or public.is_demo_department(p_dept) then return; end if;
  return query
  with eligible as (
    select ord::integer as pos,i.id,s.title,s.kind,i.content,
      encode(sha256(convert_to(i.content,'UTF8')),'hex') as ver
    from unnest(p_ids) with ordinality chosen(id,ord)
    join public.items i on i.id=chosen.id and i.dept_id=p_dept and i.deleted_at is null
    join public.sources s on s.id=i.source_id and s.dept_id=p_dept and s.active
    where public.can_see(p_user,p_dept,s.visibility)
      and (ord<>4 or s.is_principles)
      and btrim(i.content)<>''
      and (p_versions is null or p_versions[ord]=encode(sha256(convert_to(i.content,'UTF8')),'hex'))
  )
  select e.pos,e.id,e.title,e.kind,e.content,e.ver from eligible e
  where (select count(*) from eligible)=4 order by e.pos;
end $$;

alter table public.sales_source_reviews enable row level security;
create policy sales_source_reviews_current on public.sales_source_reviews for select to authenticated
using (requested_by=auth.uid() and
  (select count(*) from public.sales_source_review_inputs(auth.uid(),dept_id,item_ids,versions))=4);
revoke all on public.sales_source_reviews from public,anon,authenticated;
grant select on public.sales_source_reviews to authenticated;
grant all on public.sales_source_reviews to service_role;

create function public.request_sales_source_review(p_dept uuid,p_ids uuid[],p_request_id uuid,p_versions text[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_existing public.sales_source_reviews%rowtype;
  v_task uuid; v_start timestamptz; v_versions text[]; v_valid boolean;
begin
  if v_user is null or p_request_id is null or cardinality(p_ids) is distinct from 4
    or (select count(distinct v) from unnest(p_ids) v)<>4 then
    raise exception using errcode='22023',message='sales_source_invalid'; end if;
  perform 1 from public.members m where m.dept_id=p_dept and m.user_id=v_user
    and m.role='lead' and m.consented_at is not null for update;
  if not found or public.is_demo_department(p_dept) then
    raise exception using errcode='42501',message='sales_source_forbidden'; end if;
  select array_agg(i.version order by i."position"),bool_and(public.sales_source_text_fits(i.content))
    into v_versions,v_valid from public.sales_source_review_inputs(v_user,p_dept,p_ids,p_versions) i;
  if cardinality(v_versions) is distinct from 4 then
    raise exception using errcode='P0002',message='sales_source_unavailable'; end if;
  if not v_valid then raise exception using errcode='22023',message='sales_source_too_large'; end if;
  select * into v_existing from public.sales_source_reviews t
    where t.dept_id=p_dept and t.requested_by=v_user and t.client_request_id=p_request_id;
  if found then
    if v_existing.item_ids<>p_ids or v_existing.versions<>v_versions then
      raise exception using errcode='22023',message='sales_source_invalid'; end if;
    return v_existing.id;
  end if;
  v_start:=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if (select count(*) from public.sales_source_reviews t where t.dept_id=p_dept
    and t.requested_by=v_user and t.created_at>=v_start and t.created_at<v_start+interval '1 day')>=10
    then raise exception using errcode='22023',message='sales_source_daily_limit'; end if;
  insert into public.sales_source_reviews(dept_id,requested_by,client_request_id,item_ids,versions)
    values(p_dept,v_user,p_request_id,p_ids,v_versions) returning id into v_task;
  insert into public.jobs(kind,payload,lane,status,run_after)
    values('run_sales_source_review',jsonb_build_object('taskId',v_task),'realtime','queued',clock_timestamp());
  return v_task;
end $$;

create function public.claim_sales_source_review(p_task uuid)
returns setof public.sales_source_reviews
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.sales_source_reviews%rowtype;
begin
  select * into v_task from public.sales_source_reviews t where t.id=p_task for update;
  if not found or v_task.status not in ('queued','processing') then return; end if;
  if v_task.updated_at<clock_timestamp()-interval '2 minutes' then
    update public.sales_source_reviews set status='failed',status_reason='llm_timeout',result=null where id=p_task; return; end if;
  if (select count(*) from public.sales_source_review_inputs(v_task.requested_by,v_task.dept_id,v_task.item_ids,v_task.versions))<>4 then
    update public.sales_source_reviews set status='failed',status_reason='source_unavailable',result=null where id=p_task; return; end if;
  update public.sales_source_reviews set status='processing' where id=p_task;
  -- Do not extend the original two-minute deadline on retry.
  return query select * from public.sales_source_reviews where id=p_task;
end $$;

create function public.finish_sales_source_review(p_task uuid,p_status text,p_result jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_task public.sales_source_reviews%rowtype;
begin
  select * into v_task from public.sales_source_reviews t where t.id=p_task for update;
  if not found or v_task.status<>'processing' then return false; end if;
  if v_task.updated_at<clock_timestamp()-interval '2 minutes' then
    update public.sales_source_reviews set status='failed',status_reason='llm_timeout',result=null where id=p_task; return false; end if;
  if (select count(*) from public.sales_source_review_inputs(v_task.requested_by,v_task.dept_id,v_task.item_ids,v_task.versions))<>4 then
    update public.sales_source_reviews set status='failed',status_reason='source_unavailable',result=null where id=p_task; return false; end if;
  if p_status not in ('ready','refused') or p_status is null or (p_status='ready')<>(p_result is not null) then
    raise exception using errcode='22023',message='sales_source_invalid'; end if;
  update public.sales_source_reviews set status=p_status,status_reason=null,result=p_result,updated_at=clock_timestamp() where id=p_task;
  return true;
end $$;

revoke all on function public.sales_source_utf16_length(text),public.sales_source_text_fits(text),
  public.sales_source_review_inputs(uuid,uuid,uuid[],text[]),
  public.request_sales_source_review(uuid,uuid[],uuid,text[]),
  public.claim_sales_source_review(uuid),public.finish_sales_source_review(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.sales_source_review_inputs(uuid,uuid,uuid[],text[]),
  public.request_sales_source_review(uuid,uuid[],uuid,text[]) to authenticated;
grant execute on function public.sales_source_utf16_length(text),public.sales_source_text_fits(text),
  public.sales_source_review_inputs(uuid,uuid,uuid[],text[]),
  public.claim_sales_source_review(uuid),public.finish_sales_source_review(uuid,text,jsonb) to service_role;
