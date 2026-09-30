-- PRD ACC-02: department terms are read under RLS and edited through a
-- session-bound RPC. The worker alone uses service_role to read current terms.
create table public.dept_glossaries (
  id uuid primary key default gen_random_uuid(),
  dept_id uuid not null references public.departments(id),
  term text not null check (length(btrim(term)) between 1 and 100),
  reading text check (reading is null or length(btrim(reading)) between 1 and 100),
  note text check (note is null or length(btrim(note)) between 1 and 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index dept_glossaries_term_unique on public.dept_glossaries(dept_id, lower(term));
create index dept_glossaries_recent on public.dept_glossaries(dept_id, updated_at desc);
alter table public.dept_glossaries enable row level security;
revoke all on public.dept_glossaries from public, anon, authenticated;
grant select on public.dept_glossaries to authenticated;
grant all on public.dept_glossaries to service_role;
create policy dept_glossaries_read on public.dept_glossaries
  for select to authenticated using (
    public.can_see(auth.uid(), dept_id, 'dept')
    and exists (select 1 from public.members m
      where m.dept_id=dept_glossaries.dept_id and m.user_id=auth.uid()
        and m.consented_at is not null)
    and not public.is_demo_department(dept_id)
  );

create function public.save_dept_glossary(
  p_dept uuid, p_id uuid, p_term text, p_reading text, p_note text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare saved_id uuid; clean_term text; clean_reading text; clean_note text;
begin
  if not public.review_editor(p_dept, auth.uid()) then
    raise exception using errcode='42501',message='glossary_editor_required';
  end if;
  clean_term := btrim(public.mask_review_text(p_term));
  clean_reading := nullif(btrim(public.mask_review_text(p_reading)), '');
  clean_note := nullif(btrim(public.mask_review_text(p_note)), '');
  if p_term is null or clean_term <> btrim(p_term)
    or clean_reading is distinct from nullif(btrim(p_reading),'')
    or clean_note is distinct from nullif(btrim(p_note),'')
    or length(clean_term) not between 1 and 100
    or (clean_reading is not null and length(clean_reading)>100)
    or (clean_note is not null and length(clean_note)>300) then
    raise exception using errcode='22023',message='glossary_invalid';
  end if;
  if p_id is null then
    insert into public.dept_glossaries(dept_id,term,reading,note,created_by)
      values(p_dept,clean_term,clean_reading,clean_note,auth.uid()) returning id into saved_id;
  else
    update public.dept_glossaries set term=clean_term,reading=clean_reading,note=clean_note,updated_at=now()
      where id=p_id and dept_id=p_dept returning id into saved_id;
    if saved_id is null then raise exception using errcode='P0002',message='glossary_not_found'; end if;
  end if;
  return saved_id;
end $$;
revoke all on function public.save_dept_glossary(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.save_dept_glossary(uuid,uuid,text,text,text) to authenticated;

create function public.delete_dept_glossary(p_dept uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare deleted_count integer;
begin
  if not public.review_editor(p_dept, auth.uid()) then
    raise exception using errcode='42501',message='glossary_editor_required';
  end if;
  delete from public.dept_glossaries where dept_id=p_dept and id=p_id;
  get diagnostics deleted_count=row_count;
  return deleted_count=1;
end $$;
revoke all on function public.delete_dept_glossary(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_dept_glossary(uuid,uuid) to authenticated;
