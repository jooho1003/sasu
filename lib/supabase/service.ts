// service role 클라이언트. RLS를 통째로 우회한다.
// 허용: lib/adapters/* · lib/pipeline/* · lib/jobs.ts · app/api/jobs/* · scripts/*
// 금지: 사용자 요청 경로(대시보드·카드·원장·묻기·슬랙 Q&A) — 필터 누락 한 줄이 유출이다 (ADR-024)

import { createClient } from "@supabase/supabase-js";

export function createServiceSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
