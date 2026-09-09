// 매분 워커 트리거의 시크릿·URL을 public.worker_config에 주입한다 (ADR-010).
// 마이그레이션(0004_worker_cron.sql)은 스케줄과 함수만 만들고 값은 넣지 않는다 —
// 시크릿을 리포에 커밋하지 않기 위해서다.
//
// 사용법:
//   npx tsx scripts/setup-worker-cron.ts https://sasu-alpha.vercel.app
//   npx tsx scripts/setup-worker-cron.ts            # JOBS_RUN_URL 환경변수 사용

import { loadEnvConfig } from "@next/env";

import { createServiceSupabaseClient } from "../lib/supabase/service";

loadEnvConfig(process.cwd());

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function resolveJobsRunUrl(): string {
  const fromArg = process.argv[2]?.trim();
  const base = fromArg || process.env.JOBS_RUN_URL?.trim();
  if (!base) {
    throw new Error(
      "배포 URL을 인자로 넘기거나 JOBS_RUN_URL을 설정하라 (예: https://sasu-alpha.vercel.app)",
    );
  }
  const url = base.endsWith("/api/jobs/run") ? base : `${base.replace(/\/$/, "")}/api/jobs/run`;
  if (!url.startsWith("https://")) {
    throw new Error("JOBS_RUN_URL은 https여야 한다");
  }
  return url;
}

async function main(): Promise<void> {
  const jobsRunUrl = resolveJobsRunUrl();
  const jobsTriggerSecret = requiredEnv("JOBS_TRIGGER_SECRET");
  const supabase = createServiceSupabaseClient();

  const { error } = await supabase.from("worker_config").upsert(
    [
      { key: "jobs_run_url", value: jobsRunUrl, updated_at: new Date().toISOString() },
      { key: "jobs_trigger_secret", value: jobsTriggerSecret, updated_at: new Date().toISOString() },
    ],
    { onConflict: "key" },
  );

  if (error) {
    throw new Error(`worker_config upsert 실패: ${error.code ?? "unknown"}`);
  }

  // 값은 출력하지 않는다 (로그 규칙). 길이와 URL만 확인한다.
  console.log(`worker_config 설정 완료`);
  console.log(`  jobs_run_url        = ${jobsRunUrl}`);
  console.log(`  jobs_trigger_secret = (${jobsTriggerSecret.length}자)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
