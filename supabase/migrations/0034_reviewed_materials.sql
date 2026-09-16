-- ADR-054: private originals, review drafts, atomic publication, lease/version fencing.
create table public.reviewed_materials (
  id uuid primary key, dept_id uuid not null references public.departments,
  created_by uuid not null references auth.users, kind text not null check(kind in ('audio','document')),
  title text not null, filename text not null, file_size bigint not null,
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'), duration double precision,
  visibility text not null check(visibility in ('dept','leads_only')),
  participants uuid[] not null default '{}', synthetic boolean not null default false,
  consent_confirmed_at timestamptz not null default now(),
  original_path text, original_uploaded boolean not null default false, original_deleted_at timestamptz,
  status text not null default 'uploading' check(status in ('uploading','processing','ready','failed','cancelled','deleted')),
  status_reason text, revision integer not null default 1, sections jsonb not null default '[]', candidate_sections jsonb,
  published_revision integer, published_source_id uuid references public.sources, confirmed_by uuid references auth.users, confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.review_parts (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references public.reviewed_materials,
  part_index integer not null, start_seconds double precision, end_seconds double precision, object_path text not null,
  status text not null default 'waiting' check(status in ('waiting','queued','processing','done','failed','cancelled')),
  attempt integer not null default 0, lease uuid, lease_until timestamptz, error_code text,
  sections jsonb not null default '[]', updated_at timestamptz not null default now(), unique(review_id,part_index)
);
create table public.review_revisions (
  review_id uuid not null references public.reviewed_materials, revision integer not null, title text not null,
  sections jsonb not null, edited_by uuid not null references auth.users, created_at timestamptz not null default now(),
  primary key(review_id,revision)
);
alter table public.reviewed_materials enable row level security;
alter table public.review_parts enable row level security;
alter table public.review_revisions enable row level security;
revoke all on public.reviewed_materials,public.review_parts,public.review_revisions from public,anon,authenticated;
grant select on public.reviewed_materials,public.review_parts,public.review_revisions to authenticated;
grant all on public.reviewed_materials,public.review_parts,public.review_revisions to service_role;
create policy reviews_read on public.reviewed_materials for select to authenticated using (can_see(auth.uid(),dept_id,'leads_only') and deleted_at is null and not is_demo_department(dept_id) and exists(select 1 from members m where m.dept_id=reviewed_materials.dept_id and m.user_id=auth.uid() and m.consented_at is not null));
create policy review_parts_read on public.review_parts for select to authenticated using(exists(select 1 from public.reviewed_materials r where r.id=review_id));
create policy review_revisions_read on public.review_revisions for select to authenticated using(exists(select 1 from public.reviewed_materials r where r.id=review_id));

create function public.review_editor(p_dept uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select can_see(p_user,p_dept,'leads_only') and not is_demo_department(p_dept)
    and exists(select 1 from members where dept_id=p_dept and user_id=p_user and consented_at is not null)
$$;
revoke all on function public.review_editor(uuid,uuid) from public,anon,authenticated;

-- Defense in depth for direct RPC callers. Application mask() remains the shared ingest mask.
create function public.mask_review_text(p_text text) returns text language sql immutable set search_path=public,pg_temp as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_text,''),
    '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}','[이메일]','g'),
    '\m[0-9]{6}[- ]?[1-4][0-9]{6}\M','[주민번호]','g'),
    '(?<![0-9])((\+?82[-. ]?)?0?1[016789]|02|0[3-6][1-5])[-. ]?[0-9]{3,4}[-. ]?[0-9]{4}(?![0-9])','[전화번호]','g'),
    '\m([0-9]{4}[- ][0-9]{4}[- ][0-9]{4}[- ][0-9]{4}|[0-9]{16})\M','[카드번호]','g'),
    '(계좌번호|계좌)([[:space:]]*[:：]?[[:space:]]*)[0-9]{10,14}(?![0-9])','\1\2[계좌번호]','g'),
    '(?<![0-9A-Fa-f-])(?!(19|20)[0-9]{2}-[0-9]{1,2}-[0-9]{1,2}(?![0-9]))[0-9]{2,6}(-[0-9]{2,6}){2,3}(?![0-9A-Fa-f-])','[계좌번호]','g')
$$;
revoke all on function public.mask_review_text(text) from public,anon,authenticated;

create function public.create_review(p_dept uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid:=(p_input->>'id')::uuid; k text:=p_input->>'kind'; dur double precision:=(p_input->>'duration')::double precision;
  people uuid[]; n integer; old reviewed_materials%rowtype;
begin
  if not review_editor(p_dept,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if not (p_input ?& array['id','kind','title','filename','fingerprint','size','visibility','participants','consent_confirmed'])
    or k is null or p_input->>'title' is null or p_input->>'filename' is null or p_input->>'size' is null
    or p_input->>'fingerprint' is null or p_input->>'visibility' is null or jsonb_typeof(p_input->'participants') is distinct from 'array'
    or coalesce((p_input->>'consent_confirmed')::boolean,false)=false or k not in ('audio','document')
    or p_input->>'visibility' not in ('dept','leads_only') or length(btrim(p_input->>'title')) not between 1 and 120
    or length(p_input->>'filename') not between 1 and 200 or p_input->>'fingerprint' !~ '^[a-f0-9]{64}$'
    or (p_input->>'size')::bigint not between 1 and (case when k='audio' then 52428800 else 20971520 end)
    or (k='document' and p_input->>'filename' !~* '\.(txt|md|markdown|csv|json|pdf|docx)$')
    or (k='audio' and (dur is null or dur<=0 or dur>1800)) then raise exception using errcode='22023',message='invalid_review'; end if;
  select coalesce(array_agg(value::uuid),'{}') into people from jsonb_array_elements_text(p_input->'participants');
  if k='audio' and not coalesce((p_input->>'synthetic')::boolean,false) and cardinality(people)=0 then raise exception using errcode='22023',message='participants_required'; end if;
  if exists(select 1 from unnest(people) u where not exists(select 1 from members m where m.dept_id=p_dept and m.user_id=u and m.consented_at is not null)) then raise exception using errcode='42501',message='participant_not_consented'; end if;
  select * into old from reviewed_materials where id=rid;
  if found then
    if old.dept_id=p_dept and old.created_by=auth.uid() and old.fingerprint=p_input->>'fingerprint' and old.deleted_at is null then return rid; end if;
    raise exception using errcode='40001',message='review_conflict';
  end if;
  insert into reviewed_materials(id,dept_id,created_by,kind,title,filename,file_size,fingerprint,duration,visibility,participants,synthetic,original_path)
    values(rid,p_dept,auth.uid(),k,mask_review_text(p_input->>'title'),mask_review_text(p_input->>'filename'),(p_input->>'size')::bigint,p_input->>'fingerprint',dur,p_input->>'visibility',people,coalesce((p_input->>'synthetic')::boolean,false),p_dept||'/'||rid||'/original');
  n:=case when k='audio' then ceil(dur/60)::integer else 1 end;
  for idx in 0..n-1 loop
    insert into review_parts(review_id,part_index,start_seconds,end_seconds,object_path)
      values(rid,idx,case when k='audio' then idx*60 end,case when k='audio' then least(dur,(idx+1)*60+1) end,
        p_dept||'/'||rid||case when k='audio' then '/parts/'||idx||'.wav' else '/original' end);
  end loop;
  return rid;
end $$;

create function public.review_storage_allowed(p_name text,p_write boolean) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from reviewed_materials r where r.deleted_at is null and r.original_deleted_at is null
    and review_editor(r.dept_id,auth.uid())
    and (r.original_path=p_name or exists(select 1 from review_parts p where p.review_id=r.id and p.object_path=p_name and (not p_write or p.status in ('waiting','failed')))))
$$;
revoke all on function public.review_storage_allowed(text,boolean) from public,anon;
grant execute on function public.review_storage_allowed(text,boolean) to authenticated;

-- Storage is absent in the isolated SQL-only harness; real Supabase provisions it.
do $migration$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit) values('review-materials','review-materials',false,52428800) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
    execute 'create policy review_objects_select on storage.objects for select to authenticated using(bucket_id=''review-materials'' and public.review_storage_allowed(name,false))';
    execute 'create policy review_objects_insert on storage.objects for insert to authenticated with check(bucket_id=''review-materials'' and public.review_storage_allowed(name,true))';
  end if;
end $migration$;

create function public.queue_review_part(p_review uuid,p_index integer) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; part review_parts%rowtype; jid uuid;
begin
  select * into r from reviewed_materials where id=p_review and deleted_at is null for update;
  if not found or not review_editor(r.dept_id,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if r.original_deleted_at is not null then raise exception using errcode='22023',message='original_deleted'; end if;
  select * into part from review_parts where review_id=r.id and part_index=p_index for update;
  if not found then raise exception using errcode='22023',message='invalid_part'; end if;
  if part.status in ('queued','processing') and part.updated_at<now()-interval '2 minutes' then
    update review_parts set status='failed',error_code='timeout',lease=null,lease_until=null where id=part.id returning * into part;
  end if;
  jid:=md5('review-part:'||part.id||':'||part.attempt)::uuid;
  if part.status in ('queued','processing','done') then return jid; end if;
  update review_parts set status='queued',attempt=attempt+1,error_code=null,lease=null,lease_until=null,updated_at=now() where id=part.id returning * into part;
  jid:=md5('review-part:'||part.id||':'||part.attempt)::uuid;
  insert into jobs(id,kind,payload) values(jid,'process_review',jsonb_build_object('partId',part.id,'attempt',part.attempt)) on conflict(id) do nothing;
  update reviewed_materials set status='processing',status_reason=null,original_uploaded=true,updated_at=now() where id=r.id;
  return jid;
end $$;

create function public.claim_review_part(p_part uuid,p_attempt integer,p_lease uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p review_parts%rowtype; r reviewed_materials%rowtype;
begin
  select * into r from reviewed_materials where id=(select review_id from review_parts where id=p_part) for update;
  select * into p from review_parts where id=p_part for update;
  if p.id is null or r.deleted_at is not null or r.status='cancelled' or p.attempt<>p_attempt or p.status not in ('queued','failed')
    or r.original_deleted_at is not null or not review_editor(r.dept_id,r.created_by)
    or exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=r.dept_id and m.user_id=u and m.consented_at is not null)) then return null; end if;
  update review_parts set status='processing',lease=p_lease,lease_until=now()+interval '2 minutes',updated_at=now(),error_code=null where id=p.id;
  return jsonb_build_object('part_id',p.id,'review_id',r.id,'dept_id',r.dept_id,'kind',r.kind,'filename',r.filename,'object_path',p.object_path,'start_seconds',p.start_seconds,'end_seconds',p.end_seconds,'part_index',p.part_index);
end $$;

create function public.finish_review_part(p_part uuid,p_lease uuid,p_sections jsonb,p_error text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare p review_parts%rowtype; r reviewed_materials%rowtype; all_sections jsonb;
begin
  select * into r from reviewed_materials where id=(select review_id from review_parts where id=p_part) for update;
  select * into p from review_parts where id=p_part for update;
  if p.id is null or p.status<>'processing' or p.lease is distinct from p_lease or p.lease_until<now()
    or r.deleted_at is not null or r.status='cancelled' or not review_editor(r.dept_id,r.created_by)
    or exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=r.dept_id and m.user_id=u and m.consented_at is not null)) then return false; end if;
  update review_parts set status=case when p_error is null then 'done' else 'failed' end,sections=case when p_error is null then p_sections else '[]' end,
    error_code=p_error,lease=null,lease_until=null,updated_at=now() where id=p.id;
  if p_error is not null then update reviewed_materials set status='failed',status_reason=p_error,updated_at=now() where id=r.id;
  elsif not exists(select 1 from review_parts where review_id=r.id and status<>'done') then
    select coalesce(jsonb_agg(s.value order by part.part_index,s.ordinality),'[]') into all_sections from review_parts part cross join lateral jsonb_array_elements(part.sections) with ordinality s where part.review_id=r.id;
    if r.sections='[]' and r.revision=1 then
      update reviewed_materials set sections=all_sections,status='ready',status_reason=null,updated_at=now() where id=r.id;
      insert into review_revisions(review_id,revision,title,sections,edited_by) values(r.id,r.revision,r.title,all_sections,r.created_by) on conflict do nothing;
    else update reviewed_materials set candidate_sections=all_sections,status='ready',status_reason=null,updated_at=now() where id=r.id; end if;
  end if;
  return true;
end $$;

create function public.save_review(p_review uuid,p_revision integer,p_title text,p_sections jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; incoming jsonb; prior jsonb; normalized jsonb:='[]'; txt text;
begin
  select * into r from reviewed_materials where id=p_review and deleted_at is null for update;
  if not found or not review_editor(r.dept_id,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if r.revision is distinct from p_revision then raise exception using errcode='40001',message='stale_review'; end if;
  if r.status not in ('ready','cancelled','failed') or p_title is null or length(btrim(p_title)) not between 1 and 120 or jsonb_typeof(p_sections) is distinct from 'array'
    or jsonb_array_length(p_sections)>1000 or length(p_sections::text)>1500000
    or exists(select 1 from jsonb_array_elements(p_sections) s where length(s->>'id') not between 1 and 100 or s->>'text' is null or length(s->>'text')>20000)
    or (select count(*)<>count(distinct s->>'id') from jsonb_array_elements(p_sections) s) then raise exception using errcode='22023',message='invalid_sections'; end if;
  for incoming in select * from jsonb_array_elements(p_sections) loop
    select s into prior from jsonb_array_elements(r.sections) s where s->>'id'=incoming->>'id';
    txt:=mask_review_text(incoming->>'text');
    normalized:=normalized||jsonb_build_array(case when prior is not null then prior||jsonb_build_object('text',txt,'edited',txt<>prior->>'original_text')
      else jsonb_build_object('id',incoming->>'id','text',txt,'original_text','','origin','user','edited',false,'location',null,'start_seconds',null,'end_seconds',null) end);
  end loop;
  update reviewed_materials set title=mask_review_text(p_title),sections=normalized,revision=revision+1,updated_at=now() where id=r.id returning * into r;
  insert into review_revisions(review_id,revision,title,sections,edited_by) values(r.id,r.revision,r.title,r.sections,auth.uid());
  return r.revision;
end $$;

create function public.publish_review(p_review uuid,p_revision integer) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype; sid uuid:=gen_random_uuid(); section jsonb; txt text; iid uuid; n integer:=0; pos integer;
begin
  select * into r from reviewed_materials where id=p_review and deleted_at is null for update;
  if not found or not review_editor(r.dept_id,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if r.revision is distinct from p_revision then raise exception using errcode='40001',message='stale_review'; end if;
  if r.published_revision=p_revision and r.published_source_id is not null and exists(select 1 from sources where id=r.published_source_id and active) then return r.published_source_id; end if;
  if r.status<>'ready' or exists(select 1 from review_parts where review_id=r.id and status<>'done')
    or not exists(select 1 from jsonb_array_elements(r.sections) s where length(btrim(s->>'text'))>0)
    or exists(select 1 from unnest(r.participants) u where not exists(select 1 from members m where m.dept_id=r.dept_id and m.user_id=u and m.consented_at is not null)) then raise exception using errcode='22023',message='review_not_complete'; end if;
  if r.published_source_id is not null then perform remove_source(r.published_source_id); end if;
  insert into sources(id,dept_id,kind,external_id,title,visibility,active) values(sid,r.dept_id,'document','review:'||r.id||':'||r.revision||':'||sid,r.title,r.visibility,true);
  for section in select * from jsonb_array_elements(r.sections) loop
    txt:=mask_review_text(section->>'text'); pos:=1;
    while pos<=length(txt) loop
      if length(btrim(substr(txt,pos,2400)))>0 then
        insert into items(source_id,dept_id,external_ref,author,content) values(sid,r.dept_id,'review-section-'||n,
          case when section->>'origin'='user' then '사용자 추가' when (section->>'edited')::boolean then '검토·교정된 자료' when r.kind='audio' then '동의 확인 음성 전사' else '검토된 문서' end,substr(txt,pos,2400)) returning id into iid;
        insert into jobs(kind,payload) values('classify',jsonb_build_object('itemId',iid,'contentVersion',1)); n:=n+1;
      end if;
      pos:=pos+2400;
    end loop;
  end loop;
  insert into document_summaries(source_id,dept_id,status,extracted_chars,chunk_count) values(sid,r.dept_id,'processing',(select coalesce(sum(length(s->>'text')),0) from jsonb_array_elements(r.sections) s),n);
  insert into jobs(kind,payload) values('summarize_document',jsonb_build_object('documentId',sid));
  update reviewed_materials set published_source_id=sid,published_revision=revision,confirmed_by=auth.uid(),confirmed_at=now(),updated_at=now() where id=r.id;
  return sid;
end $$;

create function public.review_action(p_review uuid,p_revision integer,p_action text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype;
begin
  select * into r from reviewed_materials where id=p_review and deleted_at is null for update;
  if not found or not review_editor(r.dept_id,auth.uid()) then raise exception using errcode='42501',message='review_editor_required'; end if;
  if r.revision is distinct from p_revision then raise exception using errcode='40001',message='stale_review'; end if;
  if p_action in ('stop','delete') and r.published_source_id is not null then perform remove_source(r.published_source_id); end if;
  if p_action in ('cancel','delete','delete_original') then
    update review_parts set status=case when status='done' then 'done' else 'cancelled' end,lease=null,lease_until=null,updated_at=now() where review_id=r.id;
    update jobs set status='failed',last_error='cancelled',lease_until=null where kind='process_review' and payload->>'partId' in (select id::text from review_parts where review_id=r.id) and status in ('queued','running');
  end if;
  if p_action='stop' then
    update reviewed_materials set published_source_id=null,published_revision=null,updated_at=now() where id=r.id;
  elsif p_action='cancel' then
    update reviewed_materials set status='cancelled',updated_at=now() where id=r.id;
  elsif p_action in ('delete','delete_original') then
    update reviewed_materials set original_deleted_at=now(),status=case when p_action='delete' then 'deleted' when status in ('processing','uploading') then 'cancelled' else status end,
      deleted_at=case when p_action='delete' then now() else null end,sections=case when p_action='delete' then '[]' else sections end,candidate_sections=null,updated_at=now() where id=r.id;
    if p_action='delete' then delete from review_revisions where review_id=r.id; update review_parts set sections='[]' where review_id=r.id; end if;
    insert into jobs(kind,payload) values('purge_review_files',jsonb_build_object('reviewId',r.id));
  elsif p_action='reextract' then
    if r.original_deleted_at is not null or r.status='processing' then raise exception using errcode='22023',message='cannot_reextract'; end if;
    update review_parts set status='waiting',sections='[]',lease=null,lease_until=null where review_id=r.id;
    update reviewed_materials set status='uploading',candidate_sections=null,updated_at=now() where id=r.id;
  elsif p_action='use_extraction' then
    if r.candidate_sections is null then raise exception using errcode='22023',message='no_extraction'; end if;
    update reviewed_materials set sections=candidate_sections,candidate_sections=null,revision=revision+1,updated_at=now() where id=r.id returning * into r;
    insert into review_revisions(review_id,revision,title,sections,edited_by) values(r.id,r.revision,r.title,r.sections,auth.uid());
  elsif p_action='discard_extraction' then update reviewed_materials set candidate_sections=null where id=r.id;
  else raise exception using errcode='22023',message='unknown_review_action'; end if;
  return true;
end $$;

create function public.sweep_review_parts() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  update review_parts set status='failed',error_code='timeout',lease=null,lease_until=null,updated_at=now()
    where (status='processing' and lease_until<now()) or (status='queued' and updated_at<now()-interval '2 minutes');
  get diagnostics n=row_count;
  update reviewed_materials r set status='failed',status_reason='timeout',updated_at=now() where r.status='processing' and exists(select 1 from review_parts p where p.review_id=r.id and p.status='failed');
  return n;
end $$;
revoke all on function public.create_review(uuid,jsonb),public.queue_review_part(uuid,integer),public.save_review(uuid,integer,text,jsonb),public.publish_review(uuid,integer),public.review_action(uuid,integer,text) from public,anon,service_role;
grant execute on function public.create_review(uuid,jsonb),public.queue_review_part(uuid,integer),public.save_review(uuid,integer,text,jsonb),public.publish_review(uuid,integer),public.review_action(uuid,integer,text) to authenticated;
revoke all on function public.claim_review_part(uuid,integer,uuid),public.finish_review_part(uuid,uuid,jsonb,text),public.sweep_review_parts() from public,anon,authenticated;
grant execute on function public.claim_review_part(uuid,integer,uuid),public.finish_review_part(uuid,uuid,jsonb,text),public.sweep_review_parts() to service_role;

-- Without reliable diarization we cannot remove just one person's speech. Revoke
-- the whole recording and its derivatives when a participant withdraws/leaves.
create function public.revoke_participant_reviews() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r reviewed_materials%rowtype;
begin
  if tg_op='UPDATE' and new.consented_at is not null then return new; end if;
  for r in select * from reviewed_materials where dept_id=old.dept_id and old.user_id=any(participants) and deleted_at is null order by id for update loop
    if r.published_source_id is not null then
      perform 1 from sources where id=r.published_source_id for update;
      update items set content='',deleted_at=now() where source_id=r.published_source_id and deleted_at is null;
      update sources set active=false where id=r.published_source_id;
    end if;
    update reviewed_materials set status='deleted',status_reason='consent_withdrawn',deleted_at=now(),original_deleted_at=now(),sections='[]',candidate_sections=null,updated_at=now() where id=r.id;
    delete from review_revisions where review_id=r.id;
    update review_parts set status='cancelled',sections='[]',lease=null,lease_until=null where review_id=r.id;
    update jobs set status='failed',last_error='consent_withdrawn',lease_until=null where kind='process_review' and payload->>'partId' in (select id::text from review_parts where review_id=r.id) and status in ('queued','running');
    insert into jobs(kind,payload) values('purge_review_files',jsonb_build_object('reviewId',r.id));
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.revoke_participant_reviews() from public,anon,authenticated,service_role;
create trigger members_revoke_reviews after update of consented_at or delete on public.members for each row execute function public.revoke_participant_reviews();

-- Old summaries contain quotes too. Source deactivation must clear them, and
-- completion of an already running summary must not restore their contents.
create function public.clear_inactive_document_summary() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not new.active then
    update document_summaries set summary=null,status='summary_failed',status_reason='source_removed',updated_at=now() where source_id=new.id;
  end if;
  return new;
end $$;
create function public.fence_document_summary() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from sources where id=new.source_id and active) then
    new.summary:=null; new.status:='summary_failed'; new.status_reason:='source_removed';
  end if;
  return new;
end $$;
revoke all on function public.clear_inactive_document_summary(),public.fence_document_summary() from public,anon,authenticated,service_role;
create trigger sources_clear_document_summary after update of active on public.sources for each row execute function public.clear_inactive_document_summary();
create trigger document_summary_fence before insert or update on public.document_summaries for each row execute function public.fence_document_summary();
create policy document_summaries_active on public.document_summaries as restrictive for select to authenticated using(exists(select 1 from public.sources s where s.id=source_id and s.active));
update public.document_summaries d set summary=null,status='summary_failed',status_reason='source_removed',updated_at=now()
  where exists(select 1 from public.sources s where s.id=d.source_id and not s.active);
