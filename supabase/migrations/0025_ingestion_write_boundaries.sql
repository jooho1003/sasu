-- ADR-042: 부서 읽기 권한은 조직 이동·부서 생성/삭제 권한이 아니다.
drop policy departments_member_access on public.departments;
create policy departments_member_access on public.departments
for select to authenticated
using (public.can_see(auth.uid(), id, 'dept'));

revoke insert, update, delete on public.departments from anon, authenticated;

-- 원문은 세션 권한 검증과 TS mask()를 거친 수집 어댑터에서만 입력한다.
-- 기존 SELECT RLS와 service_role 수집 권한은 유지한다.
revoke insert on public.items from anon, authenticated;
