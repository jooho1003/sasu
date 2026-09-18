// Review-only checks against the existing LOCAL Supabase container. No .env,
// network credentials, production endpoint or persistent writes. Always rollback.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const container = "supabase_db_review-qa";
const migration = readFileSync("supabase/migrations/0038_notion_installations.sql", "utf8");
const sql = `
begin;
set local lock_timeout='3s';
select to_regclass('public.notion_installations') is null as needs_migration \\gset
\\if :needs_migration
${migration}
\\endif
select set_config('request.jwt.claim.role','service_role',true);
create temporary table notion_review_ids as select
  gen_random_uuid() org_a, gen_random_uuid() org_b, gen_random_uuid() org_demo,
  gen_random_uuid() dept_a, gen_random_uuid() dept_b,
  gen_random_uuid() admin_a, gen_random_uuid() admin_b, gen_random_uuid() admin_demo,
  gen_random_uuid() lead_a, gen_random_uuid() member_a,
  gen_random_uuid() source_a, gen_random_uuid() source_b;
grant select on notion_review_ids to authenticated,service_role;
insert into orgs(id,name,is_demo) select org_a,'Notion review A',false from notion_review_ids
  union all select org_b,'Notion review B',false from notion_review_ids
  union all select org_demo,'Notion review demo',true from notion_review_ids;
insert into departments(id,org_id,name) select dept_a,org_a,'A' from notion_review_ids
  union all select dept_b,org_b,'B' from notion_review_ids;
insert into auth.users(id) select admin_a from notion_review_ids union all select admin_b from notion_review_ids
  union all select admin_demo from notion_review_ids union all select lead_a from notion_review_ids
  union all select member_a from notion_review_ids;
insert into org_admins(org_id,user_id,granted_by) select org_a,admin_a,'review' from notion_review_ids
  union all select org_b,admin_b,'review' from notion_review_ids
  union all select org_demo,admin_demo,'review' from notion_review_ids;
insert into members(user_id,dept_id,role,display_name,consented_at)
  select lead_a,dept_a,'lead','Review lead',now() from notion_review_ids
  union all select member_a,dept_a,'member','Review member',now() from notion_review_ids;
insert into sources(id,dept_id,kind,external_id,active)
  select source_a,dept_a,'notion_page',gen_random_uuid()::text,true from notion_review_ids
  union all select source_b,dept_b,'notion_page',gen_random_uuid()::text,true from notion_review_ids;
create function pg_temp.review_check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end $$;
create function pg_temp.review_denied(query text, expected text, label text) returns void language plpgsql as $$
begin
  begin
    execute query;
  exception when others then
    if sqlstate=expected then raise notice 'PASS: %',label; return; end if;
    raise;
  end;
  raise exception 'FAIL: %',label;
end $$;
set local role service_role;
select pg_temp.review_check(complete_notion_installation(admin_a,org_a,org_a::text,'A','bot-a','internal_token','v1.synthetic'), 'service adapter stores installation') from notion_review_ids;
select pg_temp.review_check(complete_notion_installation(admin_b,org_b,org_b::text,'B','bot-b','internal_token','v1.synthetic'), 'second organization stores own installation') from notion_review_ids;
select pg_temp.review_denied(format('select complete_notion_installation(%L,%L,%L,''bad'',''bot'',''internal_token'',''v1.synthetic'')',admin_b,org_b,org_a::text),'23505','same workspace cannot belong to two organizations') from notion_review_ids;
select pg_temp.review_denied(format('select complete_notion_installation(%L,%L,%L,''bad'',''bot'',''internal_token'',''v1.synthetic'')',admin_demo,org_demo,org_demo::text),'42501','demo installation rejected') from notion_review_ids;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',admin_a::text,true) from notion_review_ids;
select pg_temp.review_denied('select * from public.notion_installations','42501','authenticated cannot read credential table');
select pg_temp.review_denied('insert into public.notion_installations default values','42501','authenticated cannot insert credentials');
select pg_temp.review_denied(format('select complete_notion_installation(%L,%L,%L,''A'',''bot'',''internal_token'',''v1.synthetic'')',admin_a,org_a,org_a::text),'42501','browser cannot call credential persistence RPC') from notion_review_ids;
select pg_temp.review_check(admin_notion_installation()->>'workspace_id'=org_a::text and not (admin_notion_installation() ? 'encrypted_token'),'admin metadata contains only own installation without token') from notion_review_ids;
select pg_temp.review_check(notion_installation_for_department(dept_a) is null,'contentless admin has no department credential access') from notion_review_ids;
select set_config('request.jwt.claim.sub',admin_b::text,true) from notion_review_ids;
select pg_temp.review_check(admin_notion_installation()->>'workspace_id'=org_b::text,'foreign admin sees only own metadata') from notion_review_ids;
select set_config('request.jwt.claim.sub',member_a::text,true) from notion_review_ids;
select pg_temp.review_check(notion_installation_for_department(dept_a) is null,'member cannot retrieve installation') from notion_review_ids;
select set_config('request.jwt.claim.sub',lead_a::text,true) from notion_review_ids;
select pg_temp.review_check(notion_installation_for_department(dept_a)->>'org_id'=org_a::text and notion_installation_for_department(dept_b) is null,'lead lookup uses can_see and excludes foreign department') from notion_review_ids;
select pg_temp.review_denied('select revoke_notion_installation()','42501','lead cannot revoke organization installation');
select set_config('request.jwt.claim.sub',admin_a::text,true) from notion_review_ids;
select pg_temp.review_check(revoke_notion_installation(),'admin can revoke own installation');
reset role;
select pg_temp.review_check(i.encrypted_token is null and not i.active and not s.active and s.last_error='notion_disconnected','revocation destroys token and disables collection')
  from notion_installations i join notion_review_ids r on r.org_a=i.org_id join sources s on s.id=r.source_a;
select pg_temp.review_check(i.active and i.encrypted_token is not null and s.active,'other organization unchanged')
  from notion_installations i join notion_review_ids r on r.org_b=i.org_id join sources s on s.id=r.source_b;
rollback;
`;
try {
  const output = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
  });
  // psql notices normally use stderr; assertion failures cause a nonzero exit.
  if (!output) throw new Error("local_review_no_output");
  console.log("PASS: 16 Notion SQL isolation assertions; local transaction rolled back.");
} catch (error) {
  process.stderr.write(error.stderr?.toString() ?? "local_notion_review_failed\n");
  process.exitCode = 1;
}
