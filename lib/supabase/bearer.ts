// Design Ref: desktop-companion §4.1, §7 S1 — Bearer 전용이며 쿠키를 읽지 않는다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createBearerSupabaseClient(
  accessToken: string,
): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase public environment is not configured");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
