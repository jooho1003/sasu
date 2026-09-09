-- 매분 워커 트리거 — Supabase pg_cron + pg_net (ADR-010 확정, 2026-09-10 / D3)
--
-- 판정 근거: Vercel 공식 문서 "Usage & Pricing for Cron Jobs" 기준 Hobby 플랜의
-- Minimum interval은 "Once per day"이고, 더 잦은 cron 표현은 **배포 단계에서 실패**한다.
-- 이 팀은 Hobby(team_zKvH3LpgiM9aftxjgdOUcPzE, billing.plan = "hobby")이므로
-- Vercel Cron으로는 매분 트리거가 불가능하다. 워커 코드는 트리거와 무관하게 동일하다 (ADR-009).
--
-- 시크릿은 이 파일에 넣지 않는다. `npx tsx scripts/setup-worker-cron.ts`가
-- .env의 값을 service role로 public.worker_config에 주입한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.worker_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- 정책을 만들지 않는다 = anon·authenticated 전면 거부. service_role만 RLS를 우회한다.
-- (jobs·llm_calls·ingest_events와 같은 취급 — 0002_can_see_rls.sql)
alter table public.worker_config enable row level security;

create or replace function public.run_jobs_tick()
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net, pg_temp
as $fn$
declare
  v_url        text;
  v_secret     text;
  v_request_id bigint;
begin
  select value into v_url    from public.worker_config where key = 'jobs_run_url';
  select value into v_secret from public.worker_config where key = 'jobs_trigger_secret';

  if v_url is null or v_secret is null then
    raise notice 'worker_config 미설정 — scripts/setup-worker-cron.ts 를 실행하라';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-jobs-secret', v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

revoke all on function public.run_jobs_tick() from public;
revoke all on function public.run_jobs_tick() from anon;
revoke all on function public.run_jobs_tick() from authenticated;

-- 매분 스케줄. 재적용해도 중복되지 않도록 기존 것을 먼저 해제한다.
do $sched$
begin
  if exists (select 1 from cron.job where jobname = 'sasu-jobs-tick') then
    perform cron.unschedule('sasu-jobs-tick');
  end if;
  perform cron.schedule('sasu-jobs-tick', '* * * * *', $cron$select public.run_jobs_tick();$cron$);
end
$sched$;
