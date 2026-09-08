create or replace function can_see(p_user uuid, p_dept uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.members as member
    where member.user_id = p_user
      and member.dept_id = p_dept
      and (
        p_visibility = 'dept'
        or (p_visibility = 'leads_only' and member.role = 'lead')
      )
  );
$$;

-- SECURITY DEFINER 함수는 정책 평가에 필요한 역할만 실행할 수 있게 제한한다.
revoke all on function can_see(uuid, uuid, text) from public;
grant execute on function can_see(uuid, uuid, text) to authenticated, service_role;

-- orgs는 사용자에게 닫혀 있으므로 데모 여부는 RLS를 우회하는 이 함수로만 확인한다.
create or replace function is_demo_department(p_dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.departments as department
    join public.orgs as organization on organization.id = department.org_id
    where department.id = p_dept
      and organization.is_demo = true
  );
$$;

revoke all on function is_demo_department(uuid) from public;
grant execute on function is_demo_department(uuid) to anon, authenticated, service_role;

-- 모든 테이블은 기본 거부 상태에서 필요한 정책만 명시적으로 연다.
alter table orgs enable row level security;
alter table departments enable row level security;
alter table members enable row level security;
alter table sources enable row level security;
alter table meetings enable row level security;
alter table items enable row level security;
alter table ingest_events enable row level security;
alter table classifications enable row level security;
alter table decision_requests enable row level security;
alter table decisions enable row level security;
alter table citations enable row level security;
alter table conflicts enable row level security;
alter table answers enable row level security;
alter table jobs enable row level security;
alter table llm_calls enable row level security;

-- 인증 사용자: 부서 멤버십과 소스/파생물 가시성을 can_see() 하나로 판정한다.
create policy departments_member_access
on departments
for all
to authenticated
using (can_see(auth.uid(), id, 'dept'))
with check (can_see(auth.uid(), id, 'dept'));

create policy members_department_access
on members
for all
to authenticated
using (can_see(auth.uid(), dept_id, 'dept'))
with check (can_see(auth.uid(), dept_id, 'dept'));

create policy sources_visible_access
on sources
for all
to authenticated
using (can_see(auth.uid(), dept_id, visibility))
with check (can_see(auth.uid(), dept_id, visibility));

create policy meetings_source_access
on meetings
for all
to authenticated
using (
  exists (
    select 1
    from public.sources as source
    where source.id = meetings.source_id
      and source.dept_id = meetings.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
)
with check (
  exists (
    select 1
    from public.sources as source
    where source.id = meetings.source_id
      and source.dept_id = meetings.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
);

create policy items_source_access
on items
for all
to authenticated
using (
  exists (
    select 1
    from public.sources as source
    where source.id = items.source_id
      and source.dept_id = items.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
)
with check (
  exists (
    select 1
    from public.sources as source
    where source.id = items.source_id
      and source.dept_id = items.dept_id
      and can_see(auth.uid(), source.dept_id, source.visibility)
  )
);

create policy classifications_item_access
on classifications
for all
to authenticated
using (
  exists (
    select 1
    from public.items as item
    join public.sources as source on source.id = item.source_id
    where item.id = classifications.item_id
      and source.dept_id = item.dept_id
      and can_see(auth.uid(), item.dept_id, source.visibility)
  )
)
with check (
  exists (
    select 1
    from public.items as item
    join public.sources as source on source.id = item.source_id
    where item.id = classifications.item_id
      and source.dept_id = item.dept_id
      and can_see(auth.uid(), item.dept_id, source.visibility)
  )
);

create policy decision_requests_visible_access
on decision_requests
for all
to authenticated
using (can_see(auth.uid(), dept_id, visibility))
with check (can_see(auth.uid(), dept_id, visibility));

create policy decisions_department_access
on decisions
for all
to authenticated
using (can_see(auth.uid(), dept_id, 'dept'))
with check (can_see(auth.uid(), dept_id, 'dept'));

create policy answers_department_access
on answers
for all
to authenticated
using (can_see(auth.uid(), dept_id, 'dept'))
with check (can_see(auth.uid(), dept_id, 'dept'));

create policy citations_owner_access
on citations
for all
to authenticated
using (
  (
    (
      (owner_kind = 'decision_request' and exists (
        select 1
        from public.decision_requests as request
        where request.id = citations.owner_id
          and can_see(auth.uid(), request.dept_id, request.visibility)
      ))
      or (owner_kind = 'decision' and exists (
        select 1
        from public.decisions as decision
        where decision.id = citations.owner_id
          and can_see(auth.uid(), decision.dept_id, 'dept')
      ))
      or (owner_kind = 'answer' and exists (
        select 1
        from public.answers as answer
        where answer.id = citations.owner_id
          and can_see(auth.uid(), answer.dept_id, 'dept')
      ))
    )
    and (
      item_id is null
      or exists (
        select 1
        from public.items as item
        join public.sources as source on source.id = item.source_id
        where item.id = citations.item_id
          and source.dept_id = item.dept_id
          and can_see(auth.uid(), item.dept_id, source.visibility)
      )
    )
    and (
      decision_id is null
      or exists (
        select 1
        from public.decisions as cited_decision
        where cited_decision.id = citations.decision_id
          and can_see(auth.uid(), cited_decision.dept_id, 'dept')
      )
    )
  )
)
with check (
  (
    (
      (owner_kind = 'decision_request' and exists (
        select 1
        from public.decision_requests as request
        where request.id = citations.owner_id
          and can_see(auth.uid(), request.dept_id, request.visibility)
      ))
      or (owner_kind = 'decision' and exists (
        select 1
        from public.decisions as decision
        where decision.id = citations.owner_id
          and can_see(auth.uid(), decision.dept_id, 'dept')
      ))
      or (owner_kind = 'answer' and exists (
        select 1
        from public.answers as answer
        where answer.id = citations.owner_id
          and can_see(auth.uid(), answer.dept_id, 'dept')
      ))
    )
    and (
      item_id is null
      or exists (
        select 1
        from public.items as item
        join public.sources as source on source.id = item.source_id
        where item.id = citations.item_id
          and source.dept_id = item.dept_id
          and can_see(auth.uid(), item.dept_id, source.visibility)
      )
    )
    and (
      decision_id is null
      or exists (
        select 1
        from public.decisions as cited_decision
        where cited_decision.id = citations.decision_id
          and can_see(auth.uid(), cited_decision.dept_id, 'dept')
      )
    )
  )
);

create policy conflicts_owner_access
on conflicts
for all
to authenticated
using (
  exists (
    select 1
    from public.decision_requests as request
    join public.decisions as prior_decision
      on prior_decision.id = conflicts.prior_decision_id
    where request.id = conflicts.request_id
      and can_see(auth.uid(), request.dept_id, request.visibility)
      and can_see(auth.uid(), prior_decision.dept_id, 'dept')
  )
)
with check (
  exists (
    select 1
    from public.decision_requests as request
    join public.decisions as prior_decision
      on prior_decision.id = conflicts.prior_decision_id
    where request.id = conflicts.request_id
      and can_see(auth.uid(), request.dept_id, request.visibility)
      and can_see(auth.uid(), prior_decision.dept_id, 'dept')
  )
);

-- 게스트: is_demo 조직의 데모 동선 데이터만 읽을 수 있고 쓰기 정책은 없다.
create policy departments_demo_read
on departments
for select
to anon
using (is_demo_department(id));

create policy sources_demo_read
on sources
for select
to anon
using (is_demo_department(dept_id));

create policy meetings_demo_read
on meetings
for select
to anon
using (is_demo_department(dept_id));

create policy items_demo_read
on items
for select
to anon
using (is_demo_department(dept_id));

create policy classifications_demo_read
on classifications
for select
to anon
using (
  exists (
    select 1
    from public.items as item
    where item.id = classifications.item_id
      and is_demo_department(item.dept_id)
  )
);

create policy decision_requests_demo_read
on decision_requests
for select
to anon
using (is_demo_department(dept_id));

create policy decisions_demo_read
on decisions
for select
to anon
using (is_demo_department(dept_id));

create policy answers_demo_read
on answers
for select
to anon
using (is_demo_department(dept_id));

create policy citations_demo_read
on citations
for select
to anon
using (
  (
    (
      (owner_kind = 'decision_request' and exists (
        select 1
        from public.decision_requests as request
        where request.id = citations.owner_id
          and is_demo_department(request.dept_id)
      ))
      or (owner_kind = 'decision' and exists (
        select 1
        from public.decisions as decision
        where decision.id = citations.owner_id
          and is_demo_department(decision.dept_id)
      ))
      or (owner_kind = 'answer' and exists (
        select 1
        from public.answers as answer
        where answer.id = citations.owner_id
          and is_demo_department(answer.dept_id)
      ))
    )
    and (
      item_id is null
      or exists (
        select 1
        from public.items as item
        where item.id = citations.item_id
          and is_demo_department(item.dept_id)
      )
    )
    and (
      decision_id is null
      or exists (
        select 1
        from public.decisions as cited_decision
        where cited_decision.id = citations.decision_id
          and is_demo_department(cited_decision.dept_id)
      )
    )
  )
);

create policy conflicts_demo_read
on conflicts
for select
to anon
using (
  exists (
    select 1
    from public.decision_requests as request
    join public.decisions as prior_decision
      on prior_decision.id = conflicts.prior_decision_id
    where request.id = conflicts.request_id
      and is_demo_department(request.dept_id)
      and is_demo_department(prior_decision.dept_id)
  )
);
