-- PRD §3-2 / ADR-045. Public access is an explicit, revocable publication.
alter table public.orgs add column trailer_publish_enabled boolean not null default false;

create table public.trailers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  dept_id uuid not null,
  status text not null default 'generating' check (status in ('generating','checking','review','published','unpublished','failed')),
  status_reason text,
  source_decision_ids uuid[] not null check (cardinality(source_decision_ids) between 1 and 3),
  banned_terms text[] not null default '{}' check (cardinality(banned_terms) <= 50),
  scenarios jsonb,
  schema_version int not null default 1,
  rubric jsonb not null check (jsonb_typeof(rubric) = 'array' and jsonb_array_length(rubric) between 1 and 6),
  gate_report jsonb,
  scenarios_hash text,
  gate_passed_hash text,
  approved_item_ids text[] not null default '{}',
  approval_hash text,
  slug text unique check (slug ~ '^[a-z0-9]{22}$'),
  apply_url text check (apply_url is null or (apply_url ~ '^https://' and char_length(apply_url) <= 2000)),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  unpublished_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trailers_dept_org_fk foreign key (dept_id,org_id) references public.departments(id,org_id)
);
create index trailers_dept_created on public.trailers(dept_id,created_at desc);
create index trailers_unfinished on public.trailers(updated_at) where status in ('generating','checking');
create table public.trailer_generation_counters (
  dept_id uuid not null references public.departments(id),
  kst_date date not null,
  count int not null default 0 check (count >= 0),
  primary key (dept_id,kst_date)
);
alter table public.trailers enable row level security;
alter table public.trailer_generation_counters enable row level security;
revoke all on public.trailers,public.trailer_generation_counters from public,anon,authenticated;
grant all on public.trailers,public.trailer_generation_counters to service_role;
grant select on public.trailers to anon,authenticated;
create policy trailers_lead_read on public.trailers for select to authenticated using (public.can_see(auth.uid(),dept_id,'leads_only'));
create policy trailers_demo_read on public.trailers for select to anon using (public.is_demo_department(dept_id));

create or replace function private.guard_trailer() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if TG_OP = 'INSERT' then
    select org_id into new.org_id from public.departments where id = new.dept_id;
  elsif new.org_id is distinct from old.org_id or new.dept_id is distinct from old.dept_id
    or new.source_decision_ids is distinct from old.source_decision_ids or new.created_by is distinct from old.created_by then
    raise exception 'trailer_identity_immutable' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' or new.scenarios is distinct from old.scenarios then
    new.scenarios_hash := case when new.scenarios is null then null else encode(sha256(convert_to(new.scenarios::text,'UTF8')),'hex') end;
    new.gate_passed_hash := null; new.approval_hash := null;
    new.approved_by := null; new.approved_at := null; new.approved_item_ids := '{}';
    new.gate_report := null;
  else
    new.scenarios_hash := old.scenarios_hash;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger guard_trailer before insert or update on public.trailers for each row execute function private.guard_trailer();

create or replace function private.trailer_approval_item_ids(p_scenarios jsonb) returns text[]
language plpgsql immutable security definer set search_path = public, pg_temp as $$
declare s jsonb; entry jsonb; result text[] := '{}'; prefix text;
begin
  for s in select value from jsonb_array_elements(coalesce(p_scenarios,'[]')) loop
    prefix := s->>'id';
    result := result || array[prefix || ':title',prefix || ':summary'];
    for entry in select value from jsonb_array_elements(s->'facts') loop result := array_append(result,prefix || ':fact:' || (entry->>'id')); end loop;
    for entry in select value from jsonb_array_elements(s->'dialogues') loop result := array_append(result,prefix || ':dialogue:' || (entry->>'id')); end loop;
    for entry in select value from jsonb_array_elements(s->'choices') loop result := array_append(result,prefix || ':choice:' || (entry->>'id')); end loop;
    result := array_append(result,prefix || ':ending');
  end loop;
  return result;
end $$;

create or replace function private.trailer_for_update(p_id uuid) returns public.trailers
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers;
begin
  select * into t from public.trailers where id=p_id for update;
  if t.id is null or public.can_see(auth.uid(),t.dept_id,'leads_only') is not true or public.is_demo_department(t.dept_id) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return t;
end $$;

create or replace function private.count_trailer_generation(p_dept uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  insert into public.trailer_generation_counters(dept_id,kst_date,count) values(p_dept,(now() at time zone 'Asia/Seoul')::date,1)
  on conflict(dept_id,kst_date) do update set count=trailer_generation_counters.count+1 returning count into n;
  if n>20 then raise exception 'trailer_daily_limit' using errcode='P0001'; end if;
end $$;

create or replace function public.trailer_candidates(p_dept uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.can_see(auth.uid(),p_dept,'leads_only') is not true then raise exception 'forbidden' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(row_to_json(x)),'[]') from (
    select d.id decision_id,d.decided_at,d.outcome,c.title card_title from public.decisions d
    left join public.decision_requests c on c.id=d.request_id
    where d.dept_id=p_dept and d.visibility='dept' and not exists(select 1 from public.decisions newer where newer.supersedes_id=d.id)
    order by d.decided_at desc,d.id limit 50
  ) x);
end $$;

create or replace function public.create_trailer_draft(p_dept uuid,p_decision_ids uuid[],p_banned_terms text[],p_apply_url text,p_rubric jsonb)
returns table(trailer_id uuid,updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int; criterion jsonb;
begin
  if public.can_see(auth.uid(),p_dept,'leads_only') is not true or public.is_demo_department(p_dept) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_decision_ids is null or cardinality(p_decision_ids) not between 1 and 3 then raise exception 'trailer_decisions_invalid' using errcode='22023'; end if;
  select count(*) into n from public.decisions d where d.id=any(p_decision_ids) and d.dept_id=p_dept and d.visibility='dept'
    and not exists(select 1 from public.decisions newer where newer.supersedes_id=d.id);
  if n <> cardinality(p_decision_ids) then raise exception 'trailer_decisions_invalid' using errcode='22023'; end if;
  if p_banned_terms is null or cardinality(p_banned_terms)>50 or exists(select 1 from unnest(p_banned_terms) term where term is null or char_length(btrim(term)) not between 1 and 60) then
    raise exception 'invalid_banned_terms' using errcode='22023';
  end if;
  if p_apply_url is not null and (p_apply_url !~ '^https://[^[:space:]/?#]+([/?#].*)?$' or char_length(p_apply_url)>2000) then raise exception 'invalid_apply_url' using errcode='22023'; end if;
  if p_rubric is null or jsonb_typeof(p_rubric)<>'array' then raise exception 'invalid_rubric' using errcode='22023'; end if;
  if jsonb_array_length(p_rubric) not between 1 and 6 then raise exception 'invalid_rubric' using errcode='22023'; end if;
  for criterion in select value from jsonb_array_elements(p_rubric) loop
    if jsonb_typeof(criterion)<>'object' or not criterion ?& array['key','label','description','weight'] or criterion - array['key','label','description','weight'] <> '{}'::jsonb
      or jsonb_typeof(criterion->'key') is distinct from 'string' or (criterion->>'key') !~ '^[a-z][a-z0-9_-]{0,39}$'
      or jsonb_typeof(criterion->'label') is distinct from 'string' or char_length(btrim(criterion->>'label'))=0
      or jsonb_typeof(criterion->'description') is distinct from 'string' or char_length(btrim(criterion->>'description'))=0
      or jsonb_typeof(criterion->'weight') is distinct from 'number' or (criterion->>'weight') !~ '^[1-5]$' then
      raise exception 'invalid_rubric' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(p_rubric))<>jsonb_array_length(p_rubric) then raise exception 'invalid_rubric' using errcode='22023'; end if;
  perform private.count_trailer_generation(p_dept);
  return query insert into public.trailers(dept_id,org_id,source_decision_ids,banned_terms,apply_url,rubric,created_by)
    select p_dept,d.org_id,p_decision_ids,array(select btrim(term) from unnest(p_banned_terms) term),p_apply_url,p_rubric,auth.uid()
    from public.departments d where d.id=p_dept returning trailers.id,trailers.updated_at;
end $$;

create or replace function public.regenerate_trailer(p_trailer uuid) returns table(trailer_id uuid,updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer);
begin
  if t.status<>'failed' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  perform private.count_trailer_generation(t.dept_id);
  return query update public.trailers set status='generating',status_reason=null,scenarios=null where id=p_trailer returning id,trailers.updated_at;
end $$;

create or replace function public.update_trailer_scenarios(p_trailer uuid,p_scenarios jsonb,p_seen_updated_at timestamptz)
returns table(trailer_id uuid,updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer);
begin
  if t.status not in ('review','unpublished') then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  if t.updated_at is distinct from p_seen_updated_at then raise exception 'trailer_stale' using errcode='P0001'; end if;
  if p_scenarios is null or jsonb_typeof(p_scenarios)<>'array' then raise exception 'invalid_scenarios' using errcode='22023'; end if;
  if jsonb_array_length(p_scenarios) not between 1 and 3 then raise exception 'invalid_scenarios' using errcode='22023'; end if;
  return query update public.trailers set scenarios=p_scenarios,status='checking',status_reason=null where id=p_trailer returning id,trailers.updated_at;
end $$;

create or replace function public.request_trailer_recheck(p_trailer uuid) returns table(trailer_id uuid,updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer);
begin
  if t.status<>'review' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  return query update public.trailers set status='checking',gate_passed_hash=null,gate_report=null where id=p_trailer returning id,trailers.updated_at;
end $$;

create or replace function public.record_trailer_gate(p_trailer uuid,p_report jsonb,p_passed boolean,p_seen_updated_at timestamptz) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers; violation jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if p_report is null or jsonb_typeof(p_report)<>'object' or not p_report ?& array['passed','violations'] or p_report-array['passed','violations']<>'{}'::jsonb
    or p_passed is null or p_report->'passed' is distinct from to_jsonb(p_passed) or jsonb_typeof(p_report->'violations') is distinct from 'array' then
    raise exception 'invalid_gate_report' using errcode='22023';
  end if;
  for violation in select value from jsonb_array_elements(p_report->'violations') loop
    if jsonb_typeof(violation)<>'object' or not violation ?& array['path','rule'] or violation-array['path','rule']<>'{}'::jsonb
      or jsonb_typeof(violation->'path') is distinct from 'string' or char_length(violation->>'path') not between 1 and 300
      or (violation->>'rule') is null or (violation->>'rule') not in ('overlap','proper_noun','mask','schema') then
      raise exception 'invalid_gate_report' using errcode='22023';
    end if;
  end loop;
  if p_passed and jsonb_array_length(p_report->'violations')<>0 then raise exception 'invalid_gate_report' using errcode='22023'; end if;
  select * into t from public.trailers where id=p_trailer for update;
  if t.id is null or t.status<>'checking' or t.updated_at is distinct from p_seen_updated_at then return 'stale'; end if;
  if p_passed and t.scenarios_hash is null then raise exception 'invalid_gate_report' using errcode='22023'; end if;
  update public.trailers set gate_report=p_report,gate_passed_hash=case when p_passed then scenarios_hash else null end,status='review',status_reason=null where id=p_trailer;
  return 'recorded';
end $$;

create or replace function public.approve_trailer_items(p_trailer uuid,p_item_ids text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer); expected text[]; approved text[]; complete boolean;
begin
  if t.status<>'review' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  expected := private.trailer_approval_item_ids(t.scenarios);
  select coalesce(array_agg(distinct id),'{}') into approved from unnest(coalesce(p_item_ids,'{}')) id where id=any(expected);
  complete := cardinality(expected)>0 and approved @> expected;
  update public.trailers set approved_item_ids=approved,approval_hash=case when complete then scenarios_hash else null end,
    approved_by=case when complete then auth.uid() else null end,approved_at=case when complete then now() else null end where id=p_trailer;
  return jsonb_build_object('approved_count',cardinality(approved),'total_count',cardinality(expected),'complete',complete);
end $$;

create or replace function public.delete_trailer(p_trailer uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer);
begin
  if t.status not in ('review','failed','unpublished') then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  delete from public.trailers where id=p_trailer;
end $$;

revoke all on function private.guard_trailer(),private.trailer_approval_item_ids(jsonb),private.trailer_for_update(uuid),private.count_trailer_generation(uuid) from public,anon,authenticated,service_role;
revoke all on function public.trailer_candidates(uuid),public.create_trailer_draft(uuid,uuid[],text[],text,jsonb),public.regenerate_trailer(uuid),public.update_trailer_scenarios(uuid,jsonb,timestamptz),public.request_trailer_recheck(uuid),public.record_trailer_gate(uuid,jsonb,boolean,timestamptz),public.approve_trailer_items(uuid,text[]),public.delete_trailer(uuid) from public,anon,authenticated,service_role;
grant execute on function public.trailer_candidates(uuid),public.create_trailer_draft(uuid,uuid[],text[],text,jsonb),public.regenerate_trailer(uuid),public.update_trailer_scenarios(uuid,jsonb,timestamptz),public.request_trailer_recheck(uuid),public.approve_trailer_items(uuid,text[]),public.delete_trailer(uuid) to authenticated;
grant execute on function public.record_trailer_gate(uuid,jsonb,boolean,timestamptz) to service_role;

create or replace function public.publish_trailer(p_trailer uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers; allowed boolean; next_slug text; target_org uuid;
begin
  select org_id into target_org from public.trailers where id=p_trailer and public.can_see(auth.uid(),dept_id,'leads_only') and not public.is_demo_department(dept_id);
  if target_org is null then raise exception 'forbidden' using errcode='42501'; end if;
  -- Same lock order as organization-wide unpublishing: organization, then trailer.
  select trailer_publish_enabled into allowed from public.orgs where id=target_org for update;
  t := private.trailer_for_update(p_trailer);
  if t.status='published' then return t.slug; end if;
  if t.status<>'review' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  if allowed is not true then raise exception 'trailer_publishing_disabled' using errcode='P0001'; end if;
  if t.scenarios_hash is null or t.gate_passed_hash is distinct from t.scenarios_hash then raise exception 'trailer_gate_not_passed' using errcode='P0001'; end if;
  if t.approval_hash is distinct from t.scenarios_hash then raise exception 'trailer_not_approved' using errcode='P0001'; end if;
  loop
    next_slug := substr(replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),1,22);
    begin
      update public.trailers set status='published',slug=next_slug,published_at=now(),unpublished_at=null,unpublished_by=null where id=p_trailer;
      return next_slug;
    exception when unique_violation then null;
    end;
  end loop;
end $$;

create or replace function public.unpublish_trailer(p_trailer uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers := private.trailer_for_update(p_trailer);
begin
  if t.status<>'published' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  update public.trailers set status='unpublished',slug=null,unpublished_at=now(),unpublished_by=auth.uid() where id=p_trailer;
end $$;

create or replace function public.public_trailer(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t public.trailers;
begin
  select tr.* into t from public.trailers tr join public.orgs o on o.id=tr.org_id
  where tr.slug=p_slug and tr.status='published' and o.trailer_publish_enabled
    and tr.scenarios_hash=tr.gate_passed_hash and tr.scenarios_hash=tr.approval_hash;
  if t.id is null then return null; end if;
  if t.schema_version<>1 then raise exception 'trailer_schema_unsupported' using errcode='P0001'; end if;
  return jsonb_build_object('scenarios',t.scenarios,'apply_url',t.apply_url);
end $$;

create or replace function public.admin_set_trailer_publishing(p_enabled boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid := public.admin_org_id();
begin
  if v_org is null then raise exception 'forbidden' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'invalid_publish_flag' using errcode='22023'; end if;
  update public.orgs set trailer_publish_enabled=p_enabled where id=v_org;
  if not p_enabled then update public.trailers set status='unpublished',slug=null,unpublished_at=now(),unpublished_by=auth.uid() where org_id=v_org and status='published'; end if;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'trailer_publishing_toggle',jsonb_build_object('org_id',v_org));
end $$;

create or replace function public.admin_unpublish_trailer(p_trailer uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid := public.admin_org_id(); t public.trailers;
begin
  if v_org is null then raise exception 'forbidden' using errcode='42501'; end if;
  select * into t from public.trailers where id=p_trailer and org_id=v_org for update;
  if t.id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if t.status<>'published' then raise exception 'trailer_state_invalid' using errcode='P0001'; end if;
  update public.trailers set status='unpublished',slug=null,unpublished_at=now(),unpublished_by=auth.uid() where id=p_trailer;
  insert into public.admin_events(org_id,actor_id,action,target) values(v_org,auth.uid(),'trailer_unpublish',jsonb_build_object('dept_id',t.dept_id,'trailer_id',t.id));
end $$;

create or replace function private._admin_overview(p_org uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'org_name', o.name,
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dept_id', d.id, 'name', d.name,
        'lead_names', coalesce((select jsonb_agg(m.display_name order by m.display_name) from public.members m where m.dept_id=d.id and m.role='lead'),'[]'::jsonb),
        'member_count', (select count(*) from public.members m where m.dept_id=d.id),
        'consented_count', (select count(*) from public.members m where m.dept_id=d.id and m.consented_at is not null),
        'active_source_count', (select count(*) from public.sources s where s.dept_id=d.id and s.active is true),
        'decisions_30d', (select count(*) from public.decisions x where x.dept_id=d.id and x.decided_at>=now()-interval '30 days'),
        'answers_30d', (select count(*) from public.answers a where a.dept_id=d.id and a.created_at>=now()-interval '30 days')
      ) order by d.name,d.id) from public.departments d where d.org_id=p_org
    ),'[]'::jsonb),
    'llm_calls_this_month',(select count(*) from public.llm_calls lc join public.departments d on d.id=lc.dept_id where d.org_id=p_org and lc.created_at>=(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')),
    'trailer_publish_enabled',o.trailer_publish_enabled,
    'published_trailers',coalesce((select jsonb_agg(jsonb_build_object('trailer_id',t.id,'dept_name',d.name,'title',t.scenarios->0->>'title','published_at',t.published_at,'public_path','/t/'||t.slug) order by t.published_at desc,t.id)
      from public.trailers t join public.departments d on d.id=t.dept_id where t.org_id=p_org and t.status='published' and o.trailer_publish_enabled and t.scenarios_hash=t.gate_passed_hash and t.scenarios_hash=t.approval_hash),'[]'::jsonb)
  ) from public.orgs o where o.id=p_org
$$;
revoke all on function private._admin_overview(uuid) from public,anon,authenticated,service_role;
revoke all on function public.publish_trailer(uuid),public.unpublish_trailer(uuid),public.public_trailer(text),public.admin_set_trailer_publishing(boolean),public.admin_unpublish_trailer(uuid) from public,anon,authenticated,service_role;
grant execute on function public.publish_trailer(uuid),public.unpublish_trailer(uuid),public.admin_set_trailer_publishing(boolean),public.admin_unpublish_trailer(uuid) to authenticated;
grant execute on function public.public_trailer(text) to anon,authenticated;
