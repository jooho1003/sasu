-- ADR-055: the public reviewer account is authenticated for read visibility,
-- but it must never mutate product or private storage data.  A database trigger
-- is required because SECURITY DEFINER RPCs bypass ordinary row policies.
create or replace function private.reject_demo_reviewer_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() = '99999999-9999-4999-8999-999999999991'::uuid then
    raise exception using
      errcode = '42501',
      message = 'demo_read_only';
  end if;
  return null;
end
$$;

revoke all on function private.reject_demo_reviewer_mutation()
  from public, anon, authenticated, service_role;

do $$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'drop trigger if exists demo_reviewer_read_only on %I.%I',
      target.schema_name,
      target.table_name
    );
    execute format(
      'create trigger demo_reviewer_read_only before insert or update or delete on %I.%I for each statement execute function private.reject_demo_reviewer_mutation()',
      target.schema_name,
      target.table_name
    );
  end loop;

  if to_regclass('storage.objects') is not null then
    execute 'drop trigger if exists demo_reviewer_read_only on storage.objects';
    execute 'create trigger demo_reviewer_read_only before insert or update or delete on storage.objects for each statement execute function private.reject_demo_reviewer_mutation()';
  end if;
end
$$;

comment on function private.reject_demo_reviewer_mutation() is
  'ADR-055 hard stop for all writes made with the public reviewer account.';
