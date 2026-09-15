alter table public.orgs add column trailer_assessment_enabled boolean not null default false;
create table public.trailer_attempts (
  id uuid primary key default gen_random_uuid(),
  trailer_id uuid not null references public.trailers(id) on delete cascade,
  dept_id uuid not null references public.departments(id),
  kind text not null check(kind in ('synthetic','candidate')),
  label text not null check(char_length(btrim(label)) between 1 and 40),
  submissions jsonb not null check(jsonb_typeof(submissions)='array' and jsonb_array_length(submissions) between 1 and 3),
  status text not null default 'scoring' check(status in ('scoring','scored','failed')),
  status_reason text, result jsonb,
  weighted_score numeric check(weighted_score is null or weighted_score between 0 and 5),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index trailer_attempts_trailer_created on public.trailer_attempts(trailer_id,created_at);
create index trailer_attempts_unfinished on public.trailer_attempts(updated_at) where status='scoring';
alter table public.trailer_attempts enable row level security;
revoke all on public.trailer_attempts from public,anon,authenticated;
grant all on public.trailer_attempts to service_role;
grant select on public.trailer_attempts to authenticated,anon;
create policy trailer_attempts_lead_read on public.trailer_attempts for select to authenticated using(public.can_see(auth.uid(),dept_id,'leads_only'));
create policy trailer_attempts_demo_read on public.trailer_attempts for select to anon using(public.is_demo_department(dept_id));

create or replace function private.guard_trailer_attempt() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare allowed boolean;
begin
  if TG_OP='INSERT' then select dept_id into new.dept_id from public.trailers where id=new.trailer_id; end if;
  select o.trailer_assessment_enabled into allowed from public.trailers t join public.orgs o on o.id=t.org_id where t.id=new.trailer_id;
  if new.kind='candidate' and allowed is not true then raise exception 'trailer_assessment_disabled' using errcode='P0001'; end if;
  if TG_OP='UPDATE' and (new.trailer_id is distinct from old.trailer_id or new.dept_id is distinct from old.dept_id
    or new.kind is distinct from old.kind or new.label is distinct from old.label or new.submissions is distinct from old.submissions) then
    raise exception 'attempt_identity_immutable' using errcode='42501';
  end if;
  new.updated_at := clock_timestamp(); return new;
end $$;
create trigger guard_trailer_attempt before insert or update on public.trailer_attempts for each row execute function private.guard_trailer_attempt();

create or replace function public.create_trailer_attempt(p_attempt_id uuid,p_trailer uuid,p_kind text,p_label text,p_submissions jsonb)
returns table(attempt_id uuid,updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.trailers; existing public.trailer_attempts; allowed boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  select * into t from public.trailers where id=p_trailer for update;
  if t.id is null or t.status not in ('review','published','unpublished') or t.scenarios is null or jsonb_typeof(t.scenarios)<>'array' or jsonb_array_length(t.scenarios)=0 then
    raise exception 'trailer_state_invalid' using errcode='P0001';
  end if;
  if p_attempt_id is null or p_kind is null or p_kind not in ('synthetic','candidate') or p_label is null or char_length(btrim(p_label)) not between 1 and 40
    or p_submissions is null or jsonb_typeof(p_submissions)<>'array' or jsonb_array_length(p_submissions) not between 1 and 3 then
    raise exception 'invalid_attempt' using errcode='22023';
  end if;
  select trailer_assessment_enabled into allowed from public.orgs where id=t.org_id;
  if p_kind='candidate' and allowed is not true then raise exception 'trailer_assessment_disabled' using errcode='P0001'; end if;
  select * into existing from public.trailer_attempts where id=p_attempt_id for update;
  if existing.id is not null and (existing.trailer_id<>p_trailer or existing.kind<>p_kind or existing.label<>btrim(p_label) or existing.submissions<>p_submissions) then
    raise exception 'attempt_submissions_mismatch' using errcode='P0001';
  end if;
  return query insert into public.trailer_attempts as a(id,trailer_id,dept_id,kind,label,submissions)
    values(p_attempt_id,p_trailer,t.dept_id,p_kind,btrim(p_label),p_submissions)
    on conflict(id) do update set status='scoring',status_reason=null,result=null,weighted_score=null
    where a.trailer_id=excluded.trailer_id and a.kind=excluded.kind and a.label=excluded.label and a.submissions=excluded.submissions
    returning a.id,a.updated_at;
  if not found then raise exception 'attempt_submissions_mismatch' using errcode='P0001'; end if;
end $$;
revoke all on function private.guard_trailer_attempt() from public,anon,authenticated,service_role;
revoke all on function public.create_trailer_attempt(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.create_trailer_attempt(uuid,uuid,text,text,jsonb) to service_role;
