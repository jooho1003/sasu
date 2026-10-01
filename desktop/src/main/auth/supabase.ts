// Design Ref: desktop-companion §2·§7 S4·S9 — OTP sessions persist only through encrypted main-process storage.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ApiClient } from "../api/client";
import type { EncryptedFile, EncryptedKeyValueStorage } from "../storage/encrypted-file";
import { logError } from "../logger";

export function createDesktopSupabase(
  storage: EncryptedKeyValueStorage,
): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("public_supabase_config_missing");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

export class AuthService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly api: ApiClient,
    private readonly sessionStorage: EncryptedKeyValueStorage,
    private readonly localFiles: readonly EncryptedFile[],
  ) {}

  async requestCode(email: string): Promise<{ sent: true }> {
    const result = await this.supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (result.error) {
      logError("auth_request_code_failed", { code: result.error.code });
      throw new Error("로그인 코드를 보내지 못했습니다.");
    }
    return { sent: true };
  }

  async verifyCode(email: string, code: string): Promise<{ authenticated: true }> {
    const result = await this.supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (result.error || !result.data.session) {
      logError("auth_verify_code_failed", { code: result.error?.code ?? "no_session" });
      throw new Error("로그인 코드를 확인하지 못했습니다.");
    }
    return { authenticated: true };
  }

  async signOut(): Promise<void> {
    try {
      await this.api.delete("/api/companion/link");
    } catch (cause) {
      logError("device_unlink_failed", {
        code: cause instanceof Error ? cause.name : "unknown",
      });
    }
    await this.clearLocalState();
  }

  async clearLocalState(): Promise<void> {
    await this.supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await this.sessionStorage.clear().catch(() => undefined);
    await Promise.all(this.localFiles.map((file) => file.remove().catch(() => undefined)));
  }
}
