-- ADR-073: finish abandoned single-file uploads without deleting retained originals.
create function public.sweep_abandoned_review_uploads() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reviewed_materials%rowtype; affected integer:=0;
begin
  for r in
    select * from public.reviewed_materials
    where original_layout='single_file' and status='uploading'
      and deleted_at is null and original_deleted_at is null
      and updated_at<=clock_timestamp()-interval '24 hours'
    order by id limit 100 for update skip locked
  loop
    update public.reviewed_materials
      set status='failed',status_reason='upload_timeout',updated_at=clock_timestamp()
      where id=r.id and original_layout='single_file' and status='uploading'
        and deleted_at is null and original_deleted_at is null;
    affected:=affected+1;
  end loop;
  return affected;
end $$;
revoke all on function public.sweep_abandoned_review_uploads() from public,anon,authenticated,service_role;
grant execute on function public.sweep_abandoned_review_uploads() to service_role;
