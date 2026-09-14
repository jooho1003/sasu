-- ADR-038 게스트 S8: is_demo 조직의 합성 역할·점수표만 읽는다. 쓰기 권한은 주지 않는다 (0002 게스트 정책과 같은 방식).
grant select on table public.agent_roles, public.agent_role_results to anon;

create policy agent_roles_demo_read
on public.agent_roles
for select
to anon
using (public.is_demo_department(dept_id));

create policy agent_role_results_demo_read
on public.agent_role_results
for select
to anon
using (public.is_demo_department(dept_id));
