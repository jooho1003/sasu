import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_CALLBACK_ERROR_PATH, parseEmailConfirm, postLoginPath } from "@/lib/auth-login";

const TOKEN = "a1B2c3_D4-e5";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";

describe("parseEmailConfirm (U3)", () => {
  it("email·magiclink 형식의 token_hash만 통과시킨다", () => {
    expect(parseEmailConfirm(new URLSearchParams({ token_hash: TOKEN, type: "email" }))).toEqual({ tokenHash: TOKEN, type: "email" });
    expect(parseEmailConfirm(new URLSearchParams({ token_hash: TOKEN, type: "magiclink" }))).toEqual({ tokenHash: TOKEN, type: "magiclink" });
    // Supabase PKCE 메일의 TokenHash는 pkce_ 접두어가 붙는다.
    expect(parseEmailConfirm(new URLSearchParams({ token_hash: `pkce_${"f".repeat(56)}`, type: "email" }))?.tokenHash).toBe(`pkce_${"f".repeat(56)}`);
    expect(parseEmailConfirm(new URLSearchParams({ token_hash: "x".repeat(512), type: "email" }))?.tokenHash).toHaveLength(512);
  });

  it("쿼리 next·redirect_to는 결과에 들어가지 않는다", () => {
    const params = new URLSearchParams({ token_hash: TOKEN, type: "email", next: "https://evil.example", redirect_to: "//evil.example" });
    expect(parseEmailConfirm(params)).toEqual({ tokenHash: TOKEN, type: "email" });
  });

  it("type 누락·허용 밖 값은 거부한다", () => {
    for (const type of [null, "", "recovery", "signup", "invite", "email_change", "sms", "Email", "MAGICLINK", " email"]) {
      const params = new URLSearchParams({ token_hash: TOKEN });
      if (type !== null) params.set("type", type);
      expect(parseEmailConfirm(params)).toBeNull();
    }
  });

  it("token_hash 누락·특수문자·513자는 거부한다", () => {
    for (const tokenHash of [null, "", "abc.def", "abc def", "abc/def", "abc+def", "abc=", "%2Fevil", "<script>", "토큰", "abc\ndef", "x".repeat(513)]) {
      const params = new URLSearchParams({ type: "email" });
      if (tokenHash !== null) params.set("token_hash", tokenHash);
      expect(parseEmailConfirm(params)).toBeNull();
    }
  });

  it("같은 이름의 값이 두 번 오면 어느 쪽도 고르지 않는다", () => {
    expect(parseEmailConfirm(new URLSearchParams(`token_hash=${TOKEN}&token_hash=other&type=email`))).toBeNull();
    expect(parseEmailConfirm(new URLSearchParams(`token_hash=${TOKEN}&type=email&type=recovery`))).toBeNull();
  });
});

type Result = { data: unknown; error: unknown };

function fakeSupabase(options: { user?: Result; membership?: Result; adminOrg?: Result } = {}) {
  const user = options.user ?? { data: { user: { id: USER_ID } }, error: null };
  const membership = options.membership ?? { data: { dept_id: DEPT_ID }, error: null };
  const adminOrg = options.adminOrg ?? { data: null, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => membership),
  };
  const client = {
    auth: { getUser: vi.fn(async () => user) },
    from: vi.fn(() => builder),
    rpc: vi.fn(async () => adminOrg),
  };
  return { client, builder, supabase: client as unknown as SupabaseClient };
}

describe("postLoginPath (U4)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "off");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("세션 사용자의 첫 부서로 보낸다", async () => {
    const { client, builder, supabase } = fakeSupabase();
    await expect(postLoginPath(supabase, undefined)).resolves.toEqual({ path: `/d/${DEPT_ID}`, ok: true });
    expect(client.from).toHaveBeenCalledWith("members");
    expect(builder.select).toHaveBeenCalledWith("dept_id");
    expect(builder.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(builder.order).toHaveBeenCalledWith("dept_id", { ascending: true });
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("안전한 next 쿠키를 첫 부서보다 먼저 쓴다", async () => {
    const { supabase } = fakeSupabase();
    await expect(postLoginPath(supabase, encodeURIComponent("/admin/events?tab=1"))).resolves.toEqual({ path: "/admin/events?tab=1", ok: true });
  });

  it("깨진 쿠키와 외부·로그인 경로 쿠키는 무시한다", async () => {
    for (const encodedNext of ["%E0%A4%A", "", encodeURIComponent("https://evil.example/x"), encodeURIComponent("//evil.example"), encodeURIComponent("/\\evil.example"), encodeURIComponent("/auth/confirm?token_hash=x")]) {
      const { supabase } = fakeSupabase();
      await expect(postLoginPath(supabase, encodedNext)).resolves.toEqual({ path: `/d/${DEPT_ID}`, ok: true });
    }
  });

  it("멤버십 조회 오류는 membership_lookup으로 끝내고 관리자 조회를 하지 않는다", async () => {
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "on");
    const { client, supabase } = fakeSupabase({ membership: { data: null, error: { message: "db down" } } });
    await expect(postLoginPath(supabase, encodeURIComponent("/admin"))).resolves.toEqual({ path: "/login?error=membership_lookup", ok: false });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("사용자 조회 오류·사용자 없음은 auth_callback으로 끝내고 멤버십을 읽지 않는다", async () => {
    for (const user of [{ data: { user: null }, error: { message: "jwt expired" } }, { data: { user: null }, error: null }]) {
      const { client, supabase } = fakeSupabase({ user });
      await expect(postLoginPath(supabase, encodeURIComponent("/admin"))).resolves.toEqual({ path: AUTH_CALLBACK_ERROR_PATH, ok: false });
      expect(client.from).not.toHaveBeenCalled();
    }
    expect(AUTH_CALLBACK_ERROR_PATH).toBe("/login?error=auth_callback");
  });

  it("관리자 읽기를 켜면 멤버십 없는 조직 관리자는 /admin, 아니면 /no-membership", async () => {
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "readonly");
    let fake = fakeSupabase({ membership: { data: null, error: null }, adminOrg: { data: "org-id", error: null } });
    await expect(postLoginPath(fake.supabase, undefined)).resolves.toEqual({ path: "/admin", ok: true });
    expect(fake.client.rpc).toHaveBeenCalledWith("admin_org_id");

    fake = fakeSupabase({ membership: { data: null, error: null }, adminOrg: { data: null, error: null } });
    await expect(postLoginPath(fake.supabase, undefined)).resolves.toEqual({ path: "/no-membership", ok: true });

    fake = fakeSupabase({ membership: { data: null, error: null }, adminOrg: { data: "org-id", error: { message: "rpc failed" } } });
    await expect(postLoginPath(fake.supabase, undefined)).resolves.toEqual({ path: "/no-membership", ok: true });
  });

  it("관리자 읽기를 끄면 관리자 RPC 없이 /no-membership", async () => {
    const { client, supabase } = fakeSupabase({ membership: { data: null, error: null }, adminOrg: { data: "org-id", error: null } });
    await expect(postLoginPath(supabase, undefined)).resolves.toEqual({ path: "/no-membership", ok: true });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("부서가 있으면 관리자 읽기가 켜져 있어도 관리자 RPC를 부르지 않는다", async () => {
    vi.stubEnv("SASU_ORG_ADMIN_MODE", "on");
    const { client, supabase } = fakeSupabase();
    await expect(postLoginPath(supabase, undefined)).resolves.toEqual({ path: `/d/${DEPT_ID}`, ok: true });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
