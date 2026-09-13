-- RLS의 부서 읽기 권한이 역할 변경·원장 수정 권한이 되지 않도록 분리한다.
revoke insert, delete, update on public.members from authenticated;
grant update (slack_user_id, consented_at, consent_version) on public.members to authenticated;

create or replace function public.guard_member_update()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if (new.consented_at is distinct from old.consented_at
        or new.consent_version is distinct from old.consent_version)
       and old.user_id <> auth.uid() then
      raise exception using errcode = '42501', message = 'own_consent_only';
    end if;
    if new.slack_user_id is distinct from old.slack_user_id
       and not public.can_see(auth.uid(), old.dept_id, 'leads_only') then
      raise exception using errcode = '42501', message = 'lead_mapping_only';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_member_update() from public, anon, authenticated;
create trigger members_write_guard before update on public.members
for each row execute function public.guard_member_update();

-- 원장은 생성·조회만. AI 답변의 완료 상태는 service_role RPC만 쓴다.
revoke update, delete on public.decisions from authenticated;
revoke update, delete on public.answers from authenticated;
create policy answers_pending_insert on public.answers as restrictive
for insert to authenticated with check (
  status = 'pending' and answer is null and verified is null
  and refused = false and error_code is null
  and generic_answer is null and question_key is null
);

-- 소스 설정의 HTTP lead 검사와 동일한 제한을 직접 REST 쓰기에도 집행한다.
create policy sources_lead_insert on public.sources as restrictive
for insert to authenticated with check (public.can_see(auth.uid(), dept_id, 'leads_only'));
create policy sources_lead_update on public.sources as restrictive
for update to authenticated
using (public.can_see(auth.uid(), dept_id, 'leads_only'))
with check (public.can_see(auth.uid(), dept_id, 'leads_only'));
create policy sources_lead_delete on public.sources as restrictive
for delete to authenticated using (public.can_see(auth.uid(), dept_id, 'leads_only'));
