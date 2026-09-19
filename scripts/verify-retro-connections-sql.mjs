import { execFileSync } from "node:child_process";
const container = process.argv[2] ?? "supabase_db_review-qa";
const sql = `select json_build_object(
 'connections',to_regclass('public.retro_connections') is not null,
 'settings',to_regclass('public.retro_user_settings') is not null,
 'secret_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='retro_connections' and column_name='encrypted_secret'),
 'preset',exists(select 1 from information_schema.columns where table_schema='public' and table_name='departments' and column_name='retro_preset'),
 'note_rpc',to_regprocedure('public.add_retro_note(uuid,text,text)') is not null,
 'connection_rpc',to_regprocedure('public.create_retro_connection(uuid,text,text,jsonb,text)') is not null,
 'revoke_rpc',to_regprocedure('public.revoke_retro_connection(uuid)') is not null,
 'service_upsert',to_regprocedure('public.upsert_retro_activities_as(uuid,uuid,date,jsonb)') is not null
)`; 
const output = execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql], { encoding: "utf8" }).trim();
const result = JSON.parse(output);
const failed = Object.entries(result).filter(([, value]) => value !== true);
console.log(JSON.stringify({ checks: result, passed: Object.keys(result).length - failed.length, failed }, null, 2));
if (failed.length) process.exitCode = 1;
