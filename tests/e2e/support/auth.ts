import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { BrowserContext } from "@playwright/test";

export type SeedCredentials = { emailEnv: string; passwordEnv: string };

export const SEED_LEAD: SeedCredentials = { emailEnv: "SEED_LEAD_EMAIL", passwordEnv: "SEED_LEAD_PASSWORD" };
export const SEED_MEMBER: SeedCredentials = { emailEnv: "SEED_MEMBER_EMAIL", passwordEnv: "SEED_MEMBER_PASSWORD" };

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function missingEnv(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

// 시드 계정으로 로그인한 세션을 @supabase/ssr 쿠키 형식으로 브라우저 컨텍스트에 넣는다.
// 반환하는 클라이언트는 같은 사용자 토큰으로 PostgREST를 직접 호출할 때 쓴다.
export async function signInSeedUser(
  context: BrowserContext,
  baseURL: string,
  credentials: SeedCredentials,
): Promise<{ session: Session; supabase: SupabaseClient }> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const unauthenticated = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const signIn = await unauthenticated.auth.signInWithPassword({
    email: requiredEnv(credentials.emailEnv),
    password: requiredEnv(credentials.passwordEnv),
  });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`seed user session was not created (${credentials.emailEnv})`);
  }

  const session = signIn.data.session;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  await context.addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: `base64-${base64Url(JSON.stringify(session))}`,
    url: new URL(baseURL).origin,
    httpOnly: true,
    secure: baseURL.startsWith("https://"),
    sameSite: "Lax",
  }]);

  return {
    session,
    supabase: createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    }),
  };
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}
