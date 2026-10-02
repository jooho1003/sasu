import { describe, expect, it, vi } from "vitest";
import { AuthService } from "../supabase";

describe("AuthService local logout", () => {
  it("signals local clearing once and waits for encrypted storage deletion", async () => {
    let finish!: () => void;
    const signingOut = new Promise<void>((resolve) => { finish = resolve; });
    const supabase = { auth: { signOut: vi.fn(() => signingOut) } };
    const storage = { clear: vi.fn(async () => undefined) };
    const file = { remove: vi.fn(async () => undefined) };
    const clearing = vi.fn();
    const auth = new AuthService(supabase as never, {} as never, storage as never, [file], clearing);
    const first = auth.clearLocalState();
    const second = auth.clearLocalState();
    expect(clearing).toHaveBeenCalledOnce();
    finish();
    await Promise.all([first, second]);
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
    expect(storage.clear).toHaveBeenCalledOnce();
    expect(file.remove).toHaveBeenCalledOnce();
  });

  it("still clears and signals after unlink fails", async () => {
    const api = { delete: vi.fn(async () => { throw new Error("offline"); }) };
    const supabase = { auth: { signOut: vi.fn(async () => undefined) } };
    const storage = { clear: vi.fn(async () => undefined) };
    const file = { remove: vi.fn(async () => undefined) };
    const clearing = vi.fn();
    const auth = new AuthService(supabase as never, api as never, storage as never, [file], clearing);
    await auth.signOut();
    expect(clearing).toHaveBeenCalledOnce();
    expect(file.remove).toHaveBeenCalledOnce();
    expect(storage.clear).toHaveBeenCalledOnce();
  });

  it("clears a late OTP result after logout instead of retaining its session", async () => {
    let verified!: (value: unknown) => void;
    const supabase = { auth: {
      verifyOtp: vi.fn(() => new Promise((resolve) => { verified = resolve; })),
      setSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn(async () => undefined),
    } };
    const storage = { clear: vi.fn(async () => undefined) };
    const auth = new AuthService(supabase as never, {} as never, storage as never, []);
    const result = auth.verifyCode("synthetic@example.test", "123456");
    const rejected = expect(result).rejects.toThrow("로그인이 취소되었습니다");
    await vi.waitFor(() => expect(supabase.auth.verifyOtp).toHaveBeenCalledOnce());
    await auth.clearLocalState();
    verified({ data: { session: { access_token: "synthetic", refresh_token: "synthetic" } }, error: null });
    await rejected;
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
    expect(storage.clear).toHaveBeenCalledTimes(2);
  });

  it("blocks a new login while local deletion fails and still attempts every file", async () => {
    const supabase = { auth: { signOut: vi.fn(async () => undefined), verifyOtp: vi.fn() } };
    const storage = { clear: vi.fn(async () => undefined) };
    const failedFile = { remove: vi.fn(async () => { throw new Error("disk_failed"); }) };
    const otherFile = { remove: vi.fn(async () => undefined) };
    const auth = new AuthService(supabase as never, {} as never, storage as never, [failedFile, otherFile]);
    await expect(auth.clearLocalState()).rejects.toThrow("local_clear_failed");
    expect(otherFile.remove).toHaveBeenCalledOnce();
    await expect(auth.verifyCode("synthetic@example.test", "123456")).rejects.toThrow("local_clear_failed");
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(failedFile.remove).toHaveBeenCalledTimes(2);
  });
});
