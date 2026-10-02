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
  private clearing: Promise<void> | null = null;
  private signingOut: Promise<void> | null = null;
  private generation = 0;
  private verifying = false;
  private clearFailed = false;
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly api: ApiClient,
    private readonly sessionStorage: EncryptedKeyValueStorage,
    private readonly localFiles: readonly Pick<EncryptedFile, "remove">[],
    private readonly onClearing?: () => void,
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
    if (this.verifying) throw new Error("로그인 확인이 진행 중입니다.");
    this.verifying = true;
    try {
      if (this.signingOut) await this.signingOut;
      return await this.verifyCurrent(email, code);
    } finally {
      this.verifying = false;
    }
  }

  private async verifyCurrent(email: string, code: string): Promise<{ authenticated: true }> {
    if (this.clearing) await this.clearing;
    if (this.clearFailed) await this.clearLocalState();
    const generation = this.generation;
    const result = await this.supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    await this.assertVerificationCurrent(generation);
    if (result.error || !result.data.session) {
      logError("auth_verify_code_failed", { code: result.error?.code ?? "no_session" });
      throw new Error("로그인 코드를 확인하지 못했습니다.");
    }
    // Persist the returned OTP session before IPC yields back to the renderer.
    // This is explicit because the encrypted asynchronous storage adapter must
    // never leave the following authenticated API request without a token.
    const persisted = await this.supabase.auth.setSession({
      access_token: result.data.session.access_token,
      refresh_token: result.data.session.refresh_token,
    });
    await this.assertVerificationCurrent(generation);
    if (persisted.error || !persisted.data.session) {
      logError("auth_session_persist_failed", { code: persisted.error?.code ?? "no_session" });
      throw new Error("로그인 정보를 저장하지 못했습니다.");
    }
    const retained = await this.supabase.auth.getSession();
    await this.assertVerificationCurrent(generation);
    if (retained.error || !retained.data.session) {
      logError("auth_session_missing_after_persist", { code: retained.error?.code ?? "no_session" });
      throw new Error("로그인 정보를 저장하지 못했습니다.");
    }
    return { authenticated: true };
  }

  private async assertVerificationCurrent(generation: number): Promise<void> {
    if (generation === this.generation) return;
    // verifyOtp/setSession can persist after a tray logout. Remove that late
    // credential before allowing another verification to begin.
    await this.clearLocalState();
    throw new Error("로그인이 취소되었습니다.");
  }

  signOut(): Promise<void> {
    if (this.signingOut) return this.signingOut;
    const generation = this.generation;
    this.signingOut = (async () => {
      try {
        await this.api.delete("/api/companion/link");
      } catch (cause) {
        logError("device_unlink_failed", { code: cause instanceof Error ? cause.name : "unknown" });
      }
      // A 401 from DELETE may already have performed this same local cleanup.
      if (generation === this.generation) await this.clearLocalState();
      else if (this.clearing) await this.clearing;
    })().finally(() => { this.signingOut = null; });
    return this.signingOut;
  }

  clearLocalState(): Promise<void> {
    if (this.clearing) return this.clearing;
    this.generation += 1;
    this.onClearing?.();
    this.clearing = (async () => {
      const signedOut = await this.supabase.auth.signOut({ scope: "local" }).catch(() => ({ error: true }));
      const removed = await Promise.allSettled([
        this.sessionStorage.clear(),
        ...this.localFiles.map((file) => file.remove()),
      ]);
      this.clearFailed = Boolean(signedOut?.error) || removed.some((result) => result.status === "rejected");
      if (this.clearFailed) {
        logError("local_clear_failed", { code: "local_clear_failed" });
        throw new Error("local_clear_failed");
      }
    })().finally(() => { this.clearing = null; });
    return this.clearing;
  }
}
