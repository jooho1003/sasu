-- ADR-092 phase 53: 게스트 데모 「문서」가 시드된 문서 요약을 읽는다.
-- 0002의 *_demo_read 정책과 같은 형태로 is_demo 조직 부서의 활성 소스 요약 SELECT만 연다.
-- 쓰기 정책·RPC·새 테이블은 없다. 앱은 읽은 요약을 그 부서 원문으로 다시 검증한 뒤에만 렌더한다.
create policy document_summaries_demo_read
on public.document_summaries
for select
to anon
using (
  public.is_demo_department(dept_id)
  and exists (
    select 1
    from public.sources as s
    where s.id = document_summaries.source_id
      and s.dept_id = document_summaries.dept_id
      and s.active
  )
);
