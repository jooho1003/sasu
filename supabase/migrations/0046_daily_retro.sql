-- ADR-063: personal retrospectives; generation/lease fencing and confirmed-only sharing.
create table public.retro_days (
  id uuid primary key, dept_id uuid not null references public.departments,
  user_id uuid not null references auth.users on delete cascade,
  retro_date date not null, tz text not null default 'Asia/Seoul',
  visibility text not null default 'self' check(visibility in ('self','dept','leads_only')),
  status text not null default 'collecting' check(status in ('collecting','drafting','draft','needs_review','confirmed','failed')),
  status_reason text, collector_version text, activity_count int not null default 0,
  revision int not null default 0, confirmed_revision int, confirmed_at timestamptz,
  topics text[] not null default '{}', generation int not null default 0,
  input_hash text, lease uuid, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(dept_id,user_id,retro_date)
);
create table public.retro_activities (
  id uuid primary key default gen_random_uuid(), day_id uuid not null references public.retro_days on delete cascade,
  kind text not null check(kind in ('git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search','sasu_decision','sasu_answer','sasu_card','sasu_review')),
  ref text not null check(length(ref) between 1 and 200), title text not null check(length(title) between 1 and 200),
  at timestamptz not null, text text not null default '' check(length(text)<=500), meta jsonb not null default '{}',
  source_visibility text check(source_visibility in ('dept','leads_only')), excluded boolean not null default false,
  unique(day_id,kind,ref)
);
create table public.retro_revisions (
  day_id uuid not null references public.retro_days on delete cascade, revision int not null,
  origin text not null check(origin in ('draft','edit','confirm')), title text not null,
  body jsonb not null, topics text[] not null default '{}', highlight text, citations jsonb not null default '[]',
  edited_by uuid references auth.users, created_at timestamptz not null default now(), primary key(day_id,revision)
);
create table public.retro_exports (
  id uuid primary key default gen_random_uuid(), day_id uuid not null references public.retro_days on delete cascade,
  revision int not null, kind text not null check(kind in ('markdown','notion','link')), target_ref text,
  exported_by uuid not null references auth.users, created_at timestamptz not null default now()
);
create index retro_days_dept_date on public.retro_days(dept_id,retro_date desc,user_id);
create index retro_days_topics on public.retro_days using gin(topics);
alter table public.retro_days enable row level security;
alter table public.retro_activities enable row level security;
alter table public.retro_revisions enable row level security;
alter table public.retro_exports enable row level security;
revoke all on public.retro_days,public.retro_activities,public.retro_revisions,public.retro_exports from public,anon,authenticated;
grant select on public.retro_days,public.retro_activities,public.retro_revisions to anon,authenticated;
grant select on public.retro_exports to authenticated;
grant all on public.retro_days,public.retro_activities,public.retro_revisions,public.retro_exports to service_role;

create function public.mask_retro_text(p_text text) returns text language sql immutable set search_path=public,pg_temp as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),
    '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}','[이메일]','g'),
    '\m[0-9]{6}[- ]?[1-4][0-9]{6}\M','[주민번호]','g'),
    '(?<![0-9])((\+?82[-. ]?)?0?1[016789]|02|0[3-6][1-5])[-. ]?[0-9]{3,4}[-. ]?[0-9]{4}(?![0-9])','[전화번호]','g'),
    '\m([0-9]{4}[- ][0-9]{4}[- ][0-9]{4}[- ][0-9]{4}|[0-9]{16})\M','[카드번호]','g'),
    '(계좌번호|계좌)([[:space:]]*[:：]?[[:space:]]*)[0-9]{10,14}(?![0-9])','\1\2[계좌번호]','g'),
    '(?<![0-9A-Fa-f-])(?!(19|20)[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}(?![0-9]))[0-9]{2,6}(-[0-9]{2,6}){2,3}(?![0-9A-Fa-f-])','[계좌번호]','g')
$$;

create function private.retro_owner(p_day uuid) returns public.retro_days language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days;
begin
  select * into d from retro_days where id=p_day for update;
  if d.id is null or auth.uid() is null or d.user_id<>auth.uid() then raise exception 'retro_not_found' using errcode='42501'; end if;
  if is_demo_department(d.dept_id) then raise exception 'demo_org' using errcode='42501'; end if;
  if not exists(select 1 from members where dept_id=d.dept_id and user_id=auth.uid() and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
  return d;
end $$;

-- Copied internal activities keep the live source boundary, for the owner and reader.
create function private.retro_activity_live(p_activity uuid,p_viewer uuid,p_visibility text default 'self') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_activities a join retro_days day on day.id=a.day_id where a.id=p_activity
    and (p_visibility<>'dept' or a.source_visibility is distinct from 'leads_only') and case a.kind
    when 'sasu_decision' then exists(select 1 from decisions d where d.id::text=a.ref and d.dept_id=day.dept_id and d.decided_by=day.user_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept'))
    when 'sasu_card' then exists(select 1 from decision_requests c where c.id::text=a.ref and c.dept_id=day.dept_id and c.assignee_id=day.user_id and c.closed_at is not null and can_see(day.user_id,c.dept_id,c.visibility) and can_see(p_viewer,c.dept_id,c.visibility) and (p_visibility<>'dept' or c.visibility='dept'))
    when 'sasu_review' then exists(select 1 from reviewed_materials r where r.id::text=a.ref and r.dept_id=day.dept_id and r.confirmed_by=day.user_id and r.confirmed_at is not null and r.deleted_at is null and review_editor(r.dept_id,day.user_id) and review_editor(r.dept_id,p_viewer) and p_visibility<>'dept')
    when 'sasu_answer' then exists(select 1 from answers ans where ans.id::text=a.ref and ans.dept_id=day.dept_id and ans.asked_by=day.user_id and ans.status='done' and ans.verified
      and can_see(day.user_id,ans.dept_id,'dept') and can_see(p_viewer,ans.dept_id,'dept')
      and exists(select 1 from citations where owner_kind='answer' and owner_id=ans.id)
      and not exists(select 1 from citations c left join items i on i.id=c.item_id left join sources s on s.id=i.source_id and s.dept_id=i.dept_id left join decisions d on d.id=c.decision_id
        where c.owner_kind='answer' and c.owner_id=ans.id and not coalesce(
          (c.item_id is not null and c.decision_id is null and i.dept_id=ans.dept_id and i.deleted_at is null and s.active and can_see(day.user_id,i.dept_id,s.visibility) and can_see(p_viewer,i.dept_id,s.visibility) and (p_visibility<>'dept' or s.visibility='dept') and length(c.quote)>0 and position(c.quote in i.content)>0)
          or (c.decision_id is not null and c.item_id is null and d.dept_id=ans.dept_id and can_see(day.user_id,d.dept_id,d.visibility) and can_see(p_viewer,d.dept_id,d.visibility) and (p_visibility<>'dept' or d.visibility='dept') and length(c.quote)>0 and position(c.quote in d.outcome||E'\n'||d.rationale)>0),false)))
    else true end)
$$;
create function private.retro_revision_live(p_day uuid,p_revision int,p_viewer uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_revisions r where r.day_id=p_day and r.revision=p_revision and not exists(
    select 1 from jsonb_each(r.body) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') c
    where not exists(select 1 from retro_activities a where a.id::text=c->>'activity_id' and a.day_id=p_day and private.retro_activity_live(a.id,p_viewer))
  ))
$$;
-- RLS uses can_see for visibility; only the confirmed revision is shared.
create function public.retro_can_read(p_day uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_days d where d.id=p_day and (
    (d.user_id=auth.uid() and can_see(auth.uid(),d.dept_id,'dept')) or (d.confirmed_revision is not null and d.visibility<>'self' and private.retro_revision_live(d.id,d.confirmed_revision,auth.uid()) and
      ((auth.role()='anon' and d.visibility='dept' and is_demo_department(d.dept_id)) or can_see(auth.uid(),d.dept_id,d.visibility)))
  ))
$$;
create function public.retro_revision_read(p_day uuid,p_revision int) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select retro_can_read(p_day) and private.retro_revision_live(p_day,p_revision,auth.uid())
$$;
create function public.retro_activity_read(p_activity uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from retro_activities a where a.id=p_activity and retro_can_read(a.day_id) and private.retro_activity_live(a.id,auth.uid()))
$$;
create policy retro_days_read on public.retro_days for select to anon,authenticated using(retro_can_read(id));
create policy retro_revisions_read on public.retro_revisions for select to anon,authenticated using(retro_revision_read(day_id,revision) and exists(
  select 1 from retro_days d where d.id=retro_revisions.day_id and (d.user_id=auth.uid() or d.confirmed_revision=retro_revisions.revision)
));
create policy retro_activities_read on public.retro_activities for select to anon,authenticated using(retro_activity_read(id) and exists(
  select 1 from retro_days d where d.id=day_id and (d.user_id=auth.uid() or exists(
    select 1 from retro_revisions r, jsonb_each(r.body) s, jsonb_array_elements(s.value) i, jsonb_array_elements(i->'citations') c
    where r.day_id=d.id and r.revision=d.confirmed_revision and c->>'activity_id'=retro_activities.id::text
  ))
));
create policy retro_exports_read on public.retro_exports for select to authenticated using(exists(select 1 from retro_days d where d.id=day_id and d.user_id=auth.uid()));

create function private.retro_validate(p_day uuid,p_title text,p_body jsonb,p_topics text[],p_visibility text default 'self',p_allow_excluded boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s text; i jsonb; c jsonb; a retro_activities; n int:=0; result jsonb:='{}'; entries jsonb; refs jsonb;
begin
  if p_title is null or length(btrim(mask_retro_text(p_title))) not between 1 and 60 or p_topics is null or cardinality(p_topics)>5 or exists(select 1 from unnest(p_topics) t where t is null or length(btrim(mask_retro_text(t))) not between 1 and 50) or jsonb_typeof(p_body) is distinct from 'object' or not p_body ?& array['did','learned','decided','next'] or (select count(*) from jsonb_object_keys(p_body))<>4 then raise exception 'invalid_retro' using errcode='22023'; end if;
  foreach s in array array['did','learned','decided','next'] loop
    if jsonb_typeof(p_body->s) is distinct from 'array' then raise exception 'invalid_retro' using errcode='22023'; end if;
    entries:='[]';
    for i in select value from jsonb_array_elements(p_body->s) loop
      n:=n+1;
      if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(i->'text') is distinct from 'string' or n>200 or length(btrim(mask_retro_text(i->>'text'))) not between 1 and 2000 or jsonb_typeof(i->'citations') is distinct from 'array' or jsonb_array_length(i->'citations') not between 1 and 20 or (select count(*) from jsonb_object_keys(i))<>2 then raise exception 'invalid_retro' using errcode='22023'; end if;
      refs:='[]';
      for c in select value from jsonb_array_elements(i->'citations') loop
        if jsonb_typeof(c->'activity_id') is distinct from 'string' or jsonb_typeof(c->'quote') is distinct from 'string' or length(c->>'quote')>500 then raise exception 'citation_invalid' using errcode='22023'; end if;
        select * into a from retro_activities where id::text=c->>'activity_id' and day_id=p_day and (p_allow_excluded or not excluded);
        if a.id is null or coalesce(length(btrim(c->>'quote')),0)=0 or not (position(c->>'quote' in a.text)>0 or position(c->>'quote' in a.title)>0) then raise exception 'citation_invalid' using errcode='22023'; end if;
        if p_visibility='dept' and a.source_visibility='leads_only' then raise exception 'visibility_narrower_source' using errcode='42501'; end if;
        if not private.retro_activity_live(a.id,(select user_id from retro_days where id=p_day),p_visibility) then raise exception 'citation_invalid' using errcode='22023'; end if;
        refs:=refs||jsonb_build_array(jsonb_build_object('activity_id',a.id,'quote',c->>'quote'));
      end loop;
      entries:=entries||jsonb_build_array(jsonb_build_object('text',mask_retro_text(i->>'text'),'citations',refs));
    end loop;
    result:=result||jsonb_build_object(s,entries);
  end loop;
  return result;
end $$;

create function private.queue_retro(p_day uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare g int; r int; j uuid;
begin
  update retro_days set generation=generation+1,status='drafting',status_reason=null,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day returning generation,revision into g,r;
  j:=md5('retro-draft:'||p_day||':'||g)::uuid;
  insert into jobs(id,kind,payload) values(j,'retro_draft',jsonb_build_object('dayId',p_day,'revision',r,'generation',g)) on conflict(id) do nothing;
  return j;
end $$;

create function public.create_retro_day(p_dept uuid,p_day uuid,p_date date,p_tz text,p_collector text,p_bundle jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; a jsonb; old retro_activities; rid uuid; j uuid; h text; n int; clean_title text; clean_text text;
begin
  if is_demo_department(p_dept) then raise exception 'demo_org' using errcode='42501'; end if;
  if auth.uid() is null or not exists(select 1 from members where dept_id=p_dept and user_id=auth.uid() and consented_at is not null) then raise exception 'consent_required' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_tz) or p_date is null or abs(p_date-(now() at time zone p_tz)::date)>7 or octet_length(p_bundle::text)>1048576 or jsonb_typeof(p_bundle->'activities') is distinct from 'array' or jsonb_array_length(p_bundle->'activities')>500 then raise exception 'invalid_bundle' using errcode='22023'; end if;
  insert into retro_days(id,dept_id,user_id,retro_date,tz,collector_version) values(p_day,p_dept,auth.uid(),p_date,p_tz,p_collector) on conflict(dept_id,user_id,retro_date) do nothing;
  select * into d from retro_days where dept_id=p_dept and user_id=auth.uid() and retro_date=p_date for update; rid:=d.id;
  if d.tz<>p_tz then raise exception 'invalid_timezone' using errcode='22023'; end if;
  for a in select value from jsonb_array_elements(p_bundle->'activities') loop
    if a->>'kind' like 'sasu_%' then raise exception 'server_only_kind' using errcode='22023'; end if;
    if jsonb_typeof(a->'kind') is distinct from 'string' or jsonb_typeof(a->'title') is distinct from 'string' or jsonb_typeof(a->'text') is distinct from 'string' or jsonb_typeof(a->'ref') is distinct from 'string' or jsonb_typeof(a->'at') is distinct from 'string' or a->>'kind' not in ('git_commit','claude_session','claude_prompt','codex_session','memory_change','doc_change','web_visit','web_search') or coalesce(length(a->>'title'),0) not between 1 and 200 or length(a->>'text')>500 or coalesce(length(a->>'ref'),0) not between 1 and 200 or jsonb_typeof(a->'meta') is distinct from 'object' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if a->>'kind'='web_visit' and (a->>'ref' !~ '^https?://[^/?#]+(/[^?#]*)?$' or a->>'ref' ~ '[?#]') then raise exception 'invalid_bundle' using errcode='22023'; end if;
    if (a->>'at')::timestamptz at time zone p_tz not between p_date::timestamp and (p_date+1)::timestamp-interval '1 microsecond' then raise exception 'invalid_bundle' using errcode='22023'; end if;
    clean_title:=left(mask_retro_text(a->>'title'),200); clean_text:=left(mask_retro_text(a->>'text'),500);
    select * into old from retro_activities where day_id=rid and kind=a->>'kind' and ref=a->>'ref';
    if old.id is not null and (old.title<>clean_title or old.text<>clean_text) and exists(select 1 from retro_revisions r,jsonb_each(r.body) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') c where r.day_id=rid and c->>'activity_id'=old.id::text) then raise exception 'cited_activity_changed' using errcode='40001'; end if;
    insert into retro_activities(day_id,kind,ref,title,text,at,meta) values(rid,a->>'kind',a->>'ref',clean_title,clean_text,(a->>'at')::timestamptz,
      coalesce((select jsonb_object_agg(key,case when jsonb_typeof(value)='string' then to_jsonb(mask_retro_text(value#>>'{}')) when jsonb_typeof(value) in ('number','boolean') then value else 'null'::jsonb end) from jsonb_each(a->'meta')),'{}'))
    on conflict(day_id,kind,ref) do update set title=excluded.title,text=excluded.text,at=excluded.at,meta=excluded.meta;
  end loop;
  -- Current source permission is checked before taking a personal snapshot.
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_decision',id::text,left(mask_retro_text(outcome),200),left(mask_retro_text(rationale),500),decided_at,visibility from decisions
    where dept_id=p_dept and decided_by=auth.uid() and (decided_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_answer',a.id::text,left(mask_retro_text(a.question),200),left(mask_retro_text(a.question),500),a.created_at,
      case when exists(select 1 from citations c left join items i on i.id=c.item_id left join sources src on src.id=i.source_id left join decisions cited_decision on cited_decision.id=c.decision_id where c.owner_kind='answer' and c.owner_id=a.id and (src.visibility='leads_only' or cited_decision.visibility='leads_only')) then 'leads_only' else 'dept' end
    from answers a where a.dept_id=p_dept and a.asked_by=auth.uid() and a.status='done' and (a.created_at at time zone p_tz)::date=p_date and my_answer_evidence_valid(a.id)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_card',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),closed_at,visibility from decision_requests
    where dept_id=p_dept and assignee_id=auth.uid() and (closed_at at time zone p_tz)::date=p_date and can_see(auth.uid(),dept_id,visibility)
    on conflict(day_id,kind,ref) do nothing;
  insert into retro_activities(day_id,kind,ref,title,text,at,source_visibility)
    select rid,'sasu_review',id::text,left(mask_retro_text(title),200),left(mask_retro_text(title),500),confirmed_at,'leads_only' from reviewed_materials
    where dept_id=p_dept and confirmed_by=auth.uid() and (confirmed_at at time zone p_tz)::date=p_date and deleted_at is null and review_editor(dept_id,auth.uid())
    on conflict(day_id,kind,ref) do nothing;
  select count(*),md5(coalesce(jsonb_agg(jsonb_build_array(kind,ref,title,text,at,meta,excluded) order by kind,ref)::text,'')) into n,h from retro_activities where day_id=rid;
  if n>500 then raise exception 'activity_limit' using errcode='22023'; end if;
  update retro_days set activity_count=n,input_hash=h where id=rid;
  if d.input_hash is distinct from h or d.generation=0 then j:=private.queue_retro(rid); else j:=md5('retro-draft:'||rid||':'||d.generation)::uuid; end if;
  return jsonb_build_object('id',rid,'activity_count',n,'job_id',j);
end $$;

create function public.save_retro(p_day uuid,p_revision int,p_title text,p_body jsonb,p_topics text[]) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; b jsonb;
begin
  d:=private.retro_owner(p_day);
  if p_revision is null or p_revision<0 or d.revision is distinct from p_revision then raise exception 'stale_retro' using errcode='40001'; end if;
  b:=private.retro_validate(p_day,p_title,p_body,p_topics);
  insert into retro_revisions(day_id,revision,origin,title,body,topics,edited_by) values(p_day,d.revision+1,'edit',mask_retro_text(p_title),b,array(select mask_retro_text(t) from unnest(p_topics) t),auth.uid());
  update retro_days set revision=revision+1,status='draft',status_reason=null,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
  return d.revision+1;
end $$;
create function public.confirm_retro(p_day uuid,p_revision int) returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; r retro_revisions; b jsonb;
begin
  d:=private.retro_owner(p_day);
  if p_revision is null or p_revision<0 or d.revision is distinct from p_revision then raise exception 'stale_retro' using errcode='40001'; end if;
  select * into r from retro_revisions where day_id=p_day and revision=p_revision;
  if r.day_id is null then raise exception 'invalid_retro' using errcode='22023'; end if;
  b:=private.retro_validate(p_day,r.title,r.body,r.topics,d.visibility);
  if not exists(select 1 from jsonb_each(b) s,jsonb_array_elements(s.value)) then raise exception 'citation_invalid' using errcode='22023'; end if;
  insert into retro_revisions(day_id,revision,origin,title,body,topics,highlight,citations,edited_by) values(p_day,d.revision+1,'confirm',r.title,b,r.topics,r.highlight,r.citations,auth.uid());
  update retro_days set revision=revision+1,confirmed_revision=revision+1,confirmed_at=now(),topics='{}',status='confirmed',status_reason=null,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
  return d.revision+1;
end $$;
create function public.set_retro_visibility(p_day uuid,p_visibility text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; r retro_revisions;
begin
  d:=private.retro_owner(p_day);
  if p_visibility is null or p_visibility not in ('self','dept','leads_only') then raise exception 'invalid_visibility' using errcode='22023'; end if;
  if p_visibility<>'self' then
    select * into r from retro_revisions where day_id=p_day and revision=d.confirmed_revision;
    if r.day_id is null then raise exception 'not_confirmed' using errcode='22023'; end if;
    perform private.retro_validate(p_day,r.title,r.body,r.topics,p_visibility,true);
  end if;
  update retro_days set visibility=p_visibility where id=p_day;
end $$;
create function public.exclude_retro_activity(p_day uuid,p_activity uuid,p_excluded boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform private.retro_owner(p_day);
  if p_excluded is null then raise exception 'invalid_retro' using errcode='22023'; end if;
  update retro_activities set excluded=p_excluded where day_id=p_day and id=p_activity;
  if not found then raise exception 'activity_not_found' using errcode='22023'; end if;
  update retro_days set status='needs_review',status_reason='retro_input_changed',lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day and status='drafting';
end $$;
create function public.regenerate_retro(p_day uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin perform private.retro_owner(p_day); return private.queue_retro(p_day); end $$;
create function public.delete_retro_day(p_day uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin perform private.retro_owner(p_day); delete from retro_days where id=p_day; end $$;
create function public.retro_timeline(p_dept uuid,p_from date,p_to date,p_user uuid default null,p_topic text default null) returns setof jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select to_jsonb(d)-'input_hash'-'lease'-'lease_until'||jsonb_build_object('display_name',m.display_name,'title',r.title,'topics',coalesce(r.topics,'{}'))
  from retro_days d left join members m on m.user_id=d.user_id and m.dept_id=d.dept_id
  left join retro_revisions r on r.day_id=d.id and r.revision=case when d.user_id=auth.uid() then d.revision else d.confirmed_revision end
  where d.dept_id=p_dept and d.retro_date between p_from and p_to and (p_user is null or d.user_id=p_user) and (p_topic is null or p_topic=any(r.topics)) order by d.retro_date desc,d.user_id limit 200
$$;

create function public.claim_retro_draft(p_day uuid,p_revision int,p_generation int) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; token uuid:=gen_random_uuid(); activities jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into d from retro_days where id=p_day for update;
  if d.id is null or d.status<>'drafting' or p_revision is null or p_generation is null or d.revision is distinct from p_revision or d.generation is distinct from p_generation or d.lease_until>now() then return null; end if;
  if is_demo_department(d.dept_id) or not exists(select 1 from members where dept_id=d.dept_id and user_id=d.user_id and consented_at is not null) then return null; end if;
  update retro_days set lease=token,lease_until=now()+interval '2 minutes',updated_at=clock_timestamp() where id=p_day;
  select coalesce(jsonb_agg(to_jsonb(a) order by kind,at),'[]') into activities from retro_activities a where day_id=p_day and not excluded and private.retro_activity_live(a.id,d.user_id);
  return jsonb_build_object('day',to_jsonb(d)-'input_hash'-'lease'-'lease_until','lease',token,'activities',activities);
end $$;
create function public.finish_retro_draft(p_day uuid,p_revision int,p_generation int,p_lease uuid,p_title text,p_body jsonb,p_topics text[],p_error text,p_highlight text default null,p_citations jsonb default '[]') returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d retro_days; b jsonb; err text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into d from retro_days where id=p_day for update;
  if d.id is null or d.status<>'drafting' or p_revision is null or p_generation is null or p_lease is null or d.revision is distinct from p_revision or d.generation is distinct from p_generation or d.lease is null or d.lease is distinct from p_lease or d.lease_until is null or d.lease_until<=clock_timestamp() then return false; end if;
  if not exists(select 1 from members where dept_id=d.dept_id and user_id=d.user_id and consented_at is not null) then return false; end if;
  if p_error is not null then
    err:=case when p_error in ('retro_no_citations','llm_timeout','llm_refusal','schema_invalid','citation_invalid') then p_error else 'job_failed' end;
    update retro_days set status=case when err='retro_no_citations' then 'needs_review' else 'failed' end,status_reason=err,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
    return true;
  end if;
  b:=private.retro_validate(p_day,p_title,p_body,p_topics);
  if not exists(select 1 from jsonb_each(b) s,jsonb_array_elements(s.value)) then
    update retro_days set status='needs_review',status_reason='retro_no_citations',lease=null,lease_until=null where id=p_day; return true;
  end if;
  insert into retro_revisions(day_id,revision,origin,title,body,topics,highlight,citations) values(p_day,d.revision+1,'draft',mask_retro_text(p_title),b,array(select mask_retro_text(t) from unnest(p_topics) t),null,'[]');
  -- Highlight is optional; store it only when every top-level citation occurs in the validated body.
  if p_highlight is not null and jsonb_typeof(p_citations)='array' and jsonb_array_length(p_citations)>0 and not exists(select 1 from jsonb_array_elements(p_citations) c where not exists(select 1 from jsonb_each(b) s,jsonb_array_elements(s.value) i,jsonb_array_elements(i->'citations') bc where bc=c)) then
    update retro_revisions set highlight=left(mask_retro_text(p_highlight),500),citations=p_citations where day_id=p_day and revision=d.revision+1;
  end if;
  update retro_days set revision=revision+1,status='draft',status_reason=null,lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_day;
  return true;
end $$;
create function public.sweep_retro_drafts() returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare n int;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  update retro_days set status='failed',status_reason='llm_timeout',lease=null,lease_until=null where status='drafting' and updated_at<now()-interval '2 minutes'; get diagnostics n=row_count; return n;
end $$;

-- Explicit allowlist, including environments with permissive default privileges.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname like '%retro%' or p.proname='queue_retro') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  end loop;
end $$;
grant execute on function public.retro_can_read(uuid),public.retro_revision_read(uuid,int),public.retro_activity_read(uuid) to anon,authenticated;
grant execute on function public.create_retro_day(uuid,uuid,date,text,text,jsonb),public.save_retro(uuid,int,text,jsonb,text[]),public.confirm_retro(uuid,int),public.set_retro_visibility(uuid,text),public.exclude_retro_activity(uuid,uuid,boolean),public.regenerate_retro(uuid),public.delete_retro_day(uuid),public.retro_timeline(uuid,date,date,uuid,text) to authenticated;
grant execute on function public.claim_retro_draft(uuid,int,int),public.finish_retro_draft(uuid,int,int,uuid,text,jsonb,text[],text,text,jsonb),public.sweep_retro_drafts() to service_role;
